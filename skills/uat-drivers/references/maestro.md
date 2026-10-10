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
- `commands.json` in that folder (verified against Maestro 2.11.0) is an array of `{command, metadata}`; `label` sits inside the command and `metadata.timestamp` is the command's start in epoch ms. It gives each command's start time and status. Commands whose label contains `[sN]` or `[eN]` become timeline markers (first occurrence = start) and pass/fail (all commands for that id must complete).
- If no labelled command is found in `commands.json`, the engine falls back to the arrival time of Maestro's console lines (less accurate, noted in `result.json`).
- `label:` works on `launchApp`, `tapOn` and `assertVisible` in the map form (verified on 2.11.0). Run a new flow once by hand to confirm other commands accept it.
- Maestro takes ~14 s to start before its first command, and slow emulators make some commands take seconds. Neither is a problem: rendering starts at the first labelled step.

## Making apps testable

- React Native: `testID` and `accessibilityLabel` on key components.
- Flutter: `Semantics(label: …)` or stable visible text; Maestro reads the accessibility tree.
- Avoid coordinate taps; they break across devices and look random on video.

## Platform notes

- Android: emulator or USB device. scrcpy's `--show-touches` does not draw anything for Maestro's injected taps, so the renderer overlays a ring using the `Tapping at (x, y)` line from Maestro's own log. Prefer `tapOn` with text/id; taps with no such log line get no ring.
- iOS Simulator: recorded with `xcrun simctl io recordVideo`, which captures the screen without touch indicators and only writes frames when the picture changes (the renderer handles that). Tap rings are drawn from Maestro's `Try tapping at (x, y)` log line, converted from points to pixels with the simulator's screen scale (verified on an iPhone 16, iOS 18.3).
- On a freshly booted simulator Maestro first installs and starts its own driver app (~15 s) and the first commands can be slow; none of that appears in the video because rendering starts at the first labelled step.
