# Unscroll

Instagram without the feed. Unscroll hides Instagram's Home feed, Reels and
Explore while keeping messages and posting, and fully locks Instagram during
Focus Hours. A lock has no stop button.

One React Native (Expo SDK 58) codebase for **Android and iOS**:

| | Android | iOS |
| --- | --- | --- |
| Feed / Reels / Explore hidden | Inside the official Instagram app (Accessibility service + overlay) | Official app shielded by Screen Time; Instagram used in Unscroll's "Clean Instagram" view |
| Focus lock | Instagram, Instagram Lite and instagram.com in browsers | Official app always shielded; Clean Instagram locked |
| Clock / time-zone tampering | Locks and 24 h waits run on the monotonic clock | Same |
| Escape | Uninstall, or switch Unscroll off in Settings › Accessibility (detected, resets streak) | Uninstall, or turn off Screen Time access (detected, resets streak) |

## Run it

```bash
npm install
npm run web                 # UI preview in the browser, with a simulated blocker
npx expo run:android        # dev build on a device/emulator (needs Android Studio)
npx expo run:ios            # dev build on a device (needs Xcode; Screen Time needs a real iPhone)
```

### Build installable apps in the cloud (no Android Studio / Xcode needed)

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview      # installable APK
npx eas-cli@latest build -p ios --profile production        # needs an Apple Developer account
```

Before your first iOS build:

1. Change `com.unscroll.app` in `app.json` (and the two extension ids under
   `extra.eas`) to your own bundle id, and add `ios.appleTeamId`.
2. Request the **Family Controls (Distribution)** entitlement from Apple for the
   app and both extensions (ShieldConfiguration, ShieldAction). Development
   builds work without approval; App Store builds do not.

Before publishing on Google Play: complete the **Accessibility API declaration**
in Play Console (the in-app disclosure and consent screen is already built).

## Project layout

```
src/core/            Pure TypeScript engine: schedules, trusted clock, sessions,
                     window locks, 24 h cooling-off, lock ratchet
src/state/           Controller (engine + native enforcer + storage), persistence
src/native/          Bridge to the native module, plus a simulated enforcer (web/tests)
src/inject/          Clean Instagram: injected script + strict config validation
src/app/             Screens (Expo Router)
src/ui/              Design system: tokens, Hold-to-lock, lock panel, primitives
modules/unscroll-blocker/
  android/           Kotlin enforcer: core/ is pure Kotlin (unit-tested),
                     plus Accessibility service, overlay, boot receiver, Expo bridge
  ios/               Swift: Screen Time authorisation, app picker, ManagedSettings shield
targets/             iOS Shield Configuration + Shield Action extensions
plugins/             Config plugins: Android hardening, iOS entitlements
shared-test-vectors/ JSON cases run by BOTH the TypeScript and Kotlin tests
e2e/                 Browser E2E + injected-script tests; e2e/maestro = on-device flows
```

## Tests

```bash
npm run test:all     # typecheck, generated-file check, Jest (2 time zones), browser suites
cd android && ./gradlew :unscroll-blocker:testDebugUnitTest   # Kotlin core (after `npx expo prebuild`)
maestro test e2e/maestro/android/                             # on a device
```

See [TESTING.md](TESTING.md) for what each suite covers and what was run, and
[SECURITY.md](SECURITY.md) for the threat model and audit.

## Settings guard (Android, off by default)

Unscroll can also cover the Settings pages that would switch it off during
Focus. **This is off by default because Google Play's Accessibility policy does
not allow apps to prevent users from disabling or uninstalling an app or
service** (only parental-control and enterprise apps are exempt). Only enable it
for builds you distribute outside Google Play:

```json
["./plugins/withUnscrollAndroid", { "settingsGuard": true }]
```
