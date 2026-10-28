# Testing

Results from the build environment on 2026-10-28.

| Suite | Command | What it covers | Result |
| --- | --- | --- | --- |
| Typecheck | `npm run typecheck` | Whole app, strict TypeScript | Pass |
| Lint | `npx expo lint` | Expo ESLint rules incl. React hooks | Pass |
| Unit + integration | `npm test` (Asia/Kolkata), `npm run test:utc` | Engine, schedules, trusted clock, sessions, window locks, ratchet, persistence (incl. 2,000-case fuzz), Clean Instagram config, controller with simulated enforcer, components, audit regressions | **170 passed** in each of IST, UTC and US Pacific |
| Shared vectors | part of `npm test` | 68 JSON cases also run by the Kotlin tests, proving both engines agree | Pass |
| Injected script | `node e2e/inject.browser.mjs` | The real Clean Instagram script in headless Chromium on an instagram.com-like single-page app | **12 passed** |
| App E2E | `node e2e/app.browser.mjs` | Real app UI (web build, phone viewport): onboarding, consent, hold-to-lock, no stop control, extend-only, schedules, 24 h cooling-off, escape detection, persistence, accessible names, touch targets, tab-label clipping, console errors | **19 passed** |
| Production bundle | `node e2e/prod-bundle.check.mjs` | No test hooks, secrets or http endpoints in the shipped JS | **3 passed** |
| Kotlin core | `./gradlew :unscroll-blocker:testDebugUnitTest` | Same shared vectors + screen classifier + enforcer (no-stop API, extend-only, clock jump, reboot, grants, window locks, corrupt state, uninstall never blocked) | **Written, not run here** (see below) |
| On device | `maestro test e2e/maestro/...` | Real Accessibility blocking, overlay, iOS shield | **Written, not run here** |

Core logic line coverage (Jest): engine 99%, schedule 98%, ratchet 100%,
clock 89%, session 100%, Clean Instagram config 98%.

## Not run in this environment

The build machine had no Android SDK, Xcode or Kotlin compiler, and could not
download them. So:

- **Kotlin and Swift were not compiled.** Both were reviewed line by line by two
  independent reviewers for compile and logic errors (no compile errors found). Compile them with
  `npx expo run:android` / `npx expo run:ios` or an EAS build.
- **Kotlin unit tests** live in
  `modules/unscroll-blocker/android/src/test/.../CoreTests.kt` and run with Gradle.
- **On-device flows** (`e2e/maestro`) need a phone or emulator with Instagram.

Run all three before a release. Instagram's internal view ids change with app
updates, so re-run `e2e/maestro/android/02-reels-hidden.yaml` after every
Instagram update.
