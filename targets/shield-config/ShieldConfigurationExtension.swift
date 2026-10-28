import ManagedSettings
import ManagedSettingsUI
import UIKit

/// The screen iOS shows instead of the official Instagram app.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {
  private let ink = UIColor(red: 0x14 / 255, green: 0x21 / 255, blue: 0x3D / 255, alpha: 1)
  private let highlighter = UIColor(red: 0xF5 / 255, green: 0xDD / 255, blue: 0x4B / 255, alpha: 1)

  private func make() -> ShieldConfiguration {
    ShieldConfiguration(
      backgroundBlurStyle: .systemUltraThinMaterialDark,
      backgroundColor: ink,
      icon: UIImage(systemName: "lock.fill"),
      title: ShieldConfiguration.Label(text: "Open Instagram in Unscroll", color: highlighter),
      subtitle: ShieldConfiguration.Label(
        text: "Your messages and posting work there. The feed and Reels don’t.",
        color: .white
      ),
      primaryButtonLabel: ShieldConfiguration.Label(text: "Close", color: ink),
      primaryButtonBackgroundColor: highlighter,
      secondaryButtonLabel: nil
    )
  }

  override func configuration(shielding application: Application) -> ShieldConfiguration { make() }
  override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { make() }
  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { make() }
  override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { make() }
}
