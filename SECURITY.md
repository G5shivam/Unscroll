# Security

## What Unscroll promises

1. Feed, Reels and Explore stay hidden; messages and posting work.
2. A Focus lock (session or schedule window) cannot be paused, shortened,
   edited or deleted once it starts, and changing the clock or time zone does
   not end it.
3. Any loosening (showing something again, removing or shortening a schedule)
   takes effect only after **24 hours of real elapsed time**, and never during Focus.
4. Ending a lock early takes a deliberate system-level step: uninstalling
   Unscroll, or switching off its permission (Android Accessibility / iOS
   Screen Time). Both are detected and reset the streak. Uninstalling always works.
5. Nothing leaves the phone. Screen content is never stored or logged.

## How it is enforced

- **Lock ratchet** (`src/core/ratchet.ts`, `PolicyRatchet.kt`): stricter changes
  always pass; every looser change needs a matured grant for exactly that
  surface or schedule. On Android the native `Enforcer` re-checks every policy
  the app sends, using grants it registered and timed itself, so even a buggy
  JS layer cannot weaken a lock.
- **No stop API anywhere** (JS, Kotlin, Swift). A test asserts the Kotlin
  enforcer exposes no stop/cancel/disable method.
- **Time**: sessions, running schedule windows ("window locks") and the 24 h
  wait accumulate *monotonic* time (Android `elapsedRealtime`, iOS
  `CLOCK_MONOTONIC`). Powered-off time does not count, so a reboot can only make
  a lock longer. The wall clock is used only to decide when a window *starts*.
- **Storage**: app state is validated field by field on load (fuzz-tested);
  Android backups and device transfer are disabled; the enforcer's own state
  falls back to fail-closed defaults if corrupt.
- **Clean Instagram (iOS)**: top-level navigation limited to https
  instagram.com hosts; the injected script runs only on instagram.com, carries
  validated JSON data only (selectors cannot contain `{ } ; < > @ \`), reads no
  page data and makes no network calls; page messages must match an exact
  pattern and are rate-limited.
- **Android manifest**: Accessibility service bound only by the system;
  non-exported boot receiver; no `SYSTEM_ALERT_WINDOW` (uses an accessibility
  overlay); no cleartext traffic in release; unneeded permissions removed.
- **Uninstall always possible**: package installers, Play Store, System UI and
  launchers are never covered (tested).

## Independent audit (2026-10-28) and resolution

| # | Finding | Severity | Resolution |
| --- | --- | --- | --- |
| C1 | Android lock could be ended via Settings pages the guard missed (Clear storage, Accessibility shortcut, other languages) | Critical | Google Play policy forbids blocking users from disabling a service, so the guard is now **off by default** and switching Unscroll off is a detected, streak-resetting exit (same model as iOS). Optional guard also covers Clear storage pages. Copy updated so the app never over-promises. |
| H1 | Clock forward + reboot matured 24 h waits instantly | High | **Fixed**: waits measured in monotonic time in TS and Kotlin; regression tests in both. |
| H2 | Time-zone/clock change could end a running schedule window | High | **Fixed**: running windows become monotonic window locks that can only grow. Tests in both. |
| H3 | App and native enforcer could drift (first policy refused; grant timing) and then silently refuse stricter changes | High | **Fixed**: first policy accepted; refused pushes retried every tick; Settings shows "confirming your latest change"; stricter changes withdraw stale native grants. Tests. |
| M1 | Enforcer's periodic save never ran (`Long.MIN_VALUE` overflow) | Medium | **Fixed**; test asserts `now()` persists. |
| M2 | Block overlay could linger over the launcher | Medium | **Fixed**: hidden whenever the foreground is unknown; window-change events added. Split-screen covering the other pane remains (see below). |
| M3 | Unlisted browsers; host-only URL bars mis-blocking DMs | Medium | Added Vivaldi, Kiwi, Firefox Focus; host-only bars no longer guessed; profile Reels caught. |
| M4 | iOS lock state lives in app storage (backup restore could remove it) | Medium | Accepted for v1 (see below). |
| M5 | Clean Instagram allowed facebook.com (unfiltered feed), script ran on all hosts, profile Reels missed, captcha frames blocked, message spam | Medium | **Fixed**: Facebook removed (log in with Instagram credentials); script runs on instagram.com only; profile Reels blocked; https sub-frames allowed; messages rate-limited. Tests. |
| L | `\u` escape crash in MiniJson; stale grants; Swift `nil` in dictionary; picker retain cycle | Low | **Fixed**. |

## Known limitations (accepted for v1)

- **Permission switch-off is an exit on both platforms.** Required by Google
  Play policy on Android and by Apple's design on iOS. It is detected and
  recorded, and resets the streak.
- **Tampering before a window starts.** Changing the time zone or clock
  *before* a scheduled window can stop that window from starting. Running
  windows, sessions and 24 h waits are unaffected.
- **iOS state in app storage.** Restoring an old device backup could restore an
  older state. Sessions are enforced in the app (the official Instagram app stays
  shielded regardless).
- **iOS selection is opaque.** Apple does not reveal which app the user picked;
  onboarding asks for Instagram but cannot verify it.
- **Instagram changes its UI.** Android view ids and labels (English and Hindi)
  are best-effort and must be verified on device each Instagram release.
- **Split-screen**: the Android overlay covers the full screen.
- **Build-tool advisories**: `npm audit` reports issues only in build-time
  tooling (`@expo/cli`, `@expo/config`, Jest). None ship inside the app; the
  suggested fix would downgrade Expo by several major versions.
