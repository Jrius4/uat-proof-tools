# Maestro driver notes

Installed: Maestro 2.11.0 (Java 17). Flows are YAML; the engine passes `${VAR}` values from the environment with `-e`.

## Flow skeleton

```yaml
appId: com.example.app
name: "UAT-001: Sign in with a valid account"
---
- launchApp:
    clearState: true
    label: "[s1] Open the app"
- tapOn:
    text: "Email"
    label: "[s2] Enter email"
- inputText:
    text: ${UAT_USER}
    label: "[s2] Enter email"
- tapOn:
    text: "Password"
    label: "[s2] Enter password"
- inputText:
    text: ${UAT_PASS}
    label: "[s2] Enter password"
- tapOn:
    text: "Log in"
    label: "[s3] Log in"
- assertVisible:
    text: "Welcome"
    label: "[e1] Welcome is visible"
```

File names: `flows/uat/<ID>.yaml`, or `<ID>.android.yaml` / `<ID>.ios.yaml` when platforms differ (the platform-specific file wins).

## How the engine uses it

- It runs `maestro test --test-output-dir <run>/maestro …` while `scrcpy` (Android) or `simctl` (iOS) records.
- `commands.json` in that folder gives each command's start time and status. Commands whose label contains `[sN]` or `[eN]` become timeline markers (first occurrence = start) and pass/fail (all commands for that id must complete).
- If no labelled command is found in `commands.json`, the engine falls back to the arrival time of Maestro's console lines (less accurate, noted in `result.json`).
- If a command shape does not accept `label:` in your Maestro version, check `maestro --help` / docs for the map form and adjust; run the flow once by hand to confirm.

## Making apps testable

- React Native: `testID` and `accessibilityLabel` on key components.
- Flutter: `Semantics(label: …)` or stable visible text; Maestro reads the accessibility tree.
- Avoid coordinate taps; they break across devices and look random on video.

## Platform notes

- Android: emulator or USB device; `scrcpy --show-touches` is used so taps are visible.
- iOS Simulator: recorded with `xcrun simctl io recordVideo`, which captures the screen without touch indicators. If tap visibility matters, record the Simulator window with the `desktop` (OBS) platform instead.
