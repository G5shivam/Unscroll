import ManagedSettings
import ManagedSettingsUI
import UIKit

/// The screen iOS shows instead of the official Instagram app.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {
  private let ink = UIColor(red: 0x14 / 255, green: 0x21 / 255, blue: 0x3D / 255, alpha: 1)
  private let highlighter = UIColor(red: 0xF5 / 255, green: 0xDD / 255, blue: 0x4B / 255, alpha: 1)

  /// Shield text in the user's language. Extensions have no access to the app's JS
  /// catalogs, so the few strings live here (keep in sync with src/i18n/locales).
  private static let copy: [String: (title: String, subtitle: String, close: String)] = [
    "en": ("Open Instagram in Unscroll", "Your messages and posting work there. The feed and Reels don’t.", "Close"),
    "hi": ("Instagram को Unscroll में खोलें", "वहाँ आपके मैसेज और पोस्ट करना काम करते हैं। फ़ीड और रील्स नहीं।", "बंद करें"),
    "es": ("Abre Instagram en Unscroll", "Allí funcionan tus mensajes y publicaciones. El feed y los Reels, no.", "Cerrar"),
    "pt": ("Abra o Instagram no Unscroll", "Lá suas mensagens e publicações funcionam. O feed e os Reels, não.", "Fechar"),
    "fr": ("Ouvrez Instagram dans Unscroll", "Vos messages et publications y fonctionnent. Le fil et les Reels, non.", "Fermer"),
    "de": ("Öffne Instagram in Unscroll", "Dort funktionieren Nachrichten und Posten. Feed und Reels nicht.", "Schließen"),
    "id": ("Buka Instagram di Unscroll", "Pesan dan posting berfungsi di sana. Feed dan Reels tidak.", "Tutup"),
  ]

  private static func text() -> (title: String, subtitle: String, close: String) {
    for tag in Locale.preferredLanguages {
      let code = String(tag.prefix(while: { $0 != "-" && $0 != "_" })).lowercased()
      if let c = copy[code == "in" ? "id" : code] { return c }
    }
    return copy["en"]!
  }

  private func make() -> ShieldConfiguration {
    let text = Self.text()
    return ShieldConfiguration(
      backgroundBlurStyle: .systemUltraThinMaterialDark,
      backgroundColor: ink,
      icon: UIImage(systemName: "lock.fill"),
      title: ShieldConfiguration.Label(text: text.title, color: highlighter),
      subtitle: ShieldConfiguration.Label(text: text.subtitle, color: .white),
      primaryButtonLabel: ShieldConfiguration.Label(text: text.close, color: ink),
      primaryButtonBackgroundColor: highlighter,
      secondaryButtonLabel: nil
    )
  }

  override func configuration(shielding application: Application) -> ShieldConfiguration { make() }
  override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { make() }
  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { make() }
  override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { make() }
}
