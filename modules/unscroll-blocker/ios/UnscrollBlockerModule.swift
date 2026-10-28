import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

/**
 * iOS enforcement.
 *
 * The official Instagram app (whatever the user picked in Apple's picker) is
 * shielded at ALL times with ManagedSettings. Instagram is used through the
 * Clean Instagram view inside Unscroll, where the JS engine applies the feed /
 * Reels rules and the Focus lock. There is deliberately no call that removes
 * the shield: only deleting Unscroll (or revoking Screen Time access in
 * Settings, which the app detects and records) lifts it.
 */
public class UnscrollBlockerModule: Module {
  private let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("unscroll"))
  private let selectionKey = "unscroll.selection.v1"

  public func definition() -> ModuleDefinition {
    Name("UnscrollBlocker")

    AsyncFunction("getStatus") { () -> [String: Any] in
      let authorized = AuthorizationCenter.shared.authorizationStatus == .approved
      let selection = self.loadSelection()
      let count = selection.map { Self.count($0) } ?? 0
      if authorized, let selection = selection { self.applyShield(selection) }
      return ["blockerEnabled": authorized && count > 0, "authorized": authorized, "selectedCount": count]
    }

    AsyncFunction("getClockSample") { () -> [String: Any] in
      [
        "wallMs": Date().timeIntervalSince1970 * 1000,
        // Darwin's CLOCK_MONOTONIC keeps counting while the device sleeps and cannot be set by the user.
        "monoMs": Double(clock_gettime_nsec_np(CLOCK_MONOTONIC)) / 1_000_000,
        "bootId": Self.bootSessionId(),
        "networkMs": NSNull(),
        // iOS gives apps no way to read "Set Automatically". Locks and the 24 h wait use the
        // monotonic clock instead, so this only affects when a schedule window starts (SECURITY.md).
        "wallTrusted": true,
      ]
    }

    AsyncFunction("requestPermission") { () async throws in
      try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
    }

    AsyncFunction("pickApps") { (promise: Promise) in
      guard var presenter = self.appContext?.utilities?.currentViewController() else {
        promise.resolve(["selectedCount": 0])
        return
      }
      // Present from the top-most controller so the sheet can't silently fail to appear.
      while let shown = presenter.presentedViewController { presenter = shown }
      let existing = self.loadSelection()
      // Weak: the sheet's closure must not keep its own hosting controller alive.
      weak var host: UIHostingController<PickerSheet>?
      let sheet = PickerSheet(selection: existing ?? FamilyActivitySelection()) { picked in
        host?.dismiss(animated: true)
        guard let picked = picked else {
          promise.resolve(["selectedCount": existing.map { Self.count($0) } ?? 0])
          return
        }
        // The selection can only grow: removing Instagram later would be a silent escape.
        let accepted = existing.map { Self.isSuperset(picked, of: $0) } ?? true
        let chosen = accepted ? picked : existing!
        self.saveSelection(chosen)
        if AuthorizationCenter.shared.authorizationStatus == .approved { self.applyShield(chosen) }
        promise.resolve(["selectedCount": Self.count(chosen)])
      }
      let controller = UIHostingController(rootView: sheet)
      controller.isModalInPresentation = true
      host = controller
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    // On iOS the policy (surfaces, schedules, sessions) is enforced by the JS
    // engine inside the Clean Instagram view; the native layer only keeps the
    // official app shielded, which nothing in this API can undo.
    AsyncFunction("applyPolicy") { (_: String, _: String) -> [String: Any] in
      if let s = self.loadSelection(), AuthorizationCenter.shared.authorizationStatus == .approved { self.applyShield(s) }
      return ["accepted": true]
    }

    AsyncFunction("registerLoosening") { (_: String) in }
    AsyncFunction("cancelLoosening") { (_: String) in }

    AsyncFunction("startSession") { (_: String, _: Double) -> [String: Any] in
      if let s = self.loadSelection(), AuthorizationCenter.shared.authorizationStatus == .approved { self.applyShield(s) }
      return ["accepted": true]
    }

    AsyncFunction("takeBlockCount") { () -> Int in 0 }
    AsyncFunction("openBatterySettings") { () in }
  }

  // MARK: - Shield

  private func applyShield(_ selection: FamilyActivitySelection) {
    store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
    if selection.categoryTokens.isEmpty {
      store.shield.applicationCategories = nil
    } else {
      store.shield.applicationCategories = ShieldSettings.ActivityCategoryPolicy<Application>.specific(selection.categoryTokens)
    }
    store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
  }

  // MARK: - Selection persistence (app container; removed on uninstall)

  private func loadSelection() -> FamilyActivitySelection? {
    guard let data = UserDefaults.standard.data(forKey: selectionKey) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  private func saveSelection(_ s: FamilyActivitySelection) {
    if let data = try? JSONEncoder().encode(s) { UserDefaults.standard.set(data, forKey: selectionKey) }
  }

  private static func count(_ s: FamilyActivitySelection) -> Int {
    s.applicationTokens.count + s.categoryTokens.count + s.webDomainTokens.count
  }

  private static func isSuperset(_ new: FamilyActivitySelection, of old: FamilyActivitySelection) -> Bool {
    old.applicationTokens.isSubset(of: new.applicationTokens)
      && old.categoryTokens.isSubset(of: new.categoryTokens)
      && old.webDomainTokens.isSubset(of: new.webDomainTokens)
  }

  private static func bootSessionId() -> String {
    var size = 0
    guard sysctlbyname("kern.bootsessionuuid", nil, &size, nil, 0) == 0, size > 0 else { return "boot-unknown" }
    var buffer = [CChar](repeating: 0, count: size)
    guard sysctlbyname("kern.bootsessionuuid", &buffer, &size, nil, 0) == 0 else { return "boot-unknown" }
    return "boot-" + String(cString: buffer)
  }
}

struct PickerSheet: View {
  @State var selection: FamilyActivitySelection
  let onDone: (FamilyActivitySelection?) -> Void

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("Choose Instagram")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onDone(nil) } }
          ToolbarItem(placement: .confirmationAction) { Button("Done") { onDone(selection) } }
        }
    }
  }
}
