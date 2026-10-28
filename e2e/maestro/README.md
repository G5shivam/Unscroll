# On-device E2E (Maestro)

These flows exercise the real native enforcers, which the web E2E cannot.
Install Maestro (https://maestro.dev), install a build of Unscroll on a device
or emulator that also has Instagram installed and logged in, then:

```bash
maestro test e2e/maestro/android/   # Android
maestro test e2e/maestro/ios/       # iOS (real device: Screen Time does not run in the Simulator)
```

Flows that need Accessibility or Screen Time permission include a manual step
the first time (Android/iOS do not allow apps to grant these to themselves).

Note: `hold-to-lock` needs a 3-second press. If your Maestro version's long
press is shorter, turn on TalkBack/VoiceOver once: the button switches to a
two-step "Confirm lock" mode that `tapOn` can drive.
