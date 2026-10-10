---
name: uat-record
description: Run a UAT scenario's driver while recording the screen (Playwright for web, scrcpy+Maestro for Android, simctl+Maestro for iOS Simulator, OBS for desktop) and produce raw video, timeline.json and result.json. Use for preflight checks, device setup, and running or debugging a recording.
argument-hint: "<scenario id> -p <web|android|ios|desktop>"
---

# Recording a scenario

```
UATP="node ${CLAUDE_SKILL_DIR}/../../engine/bin/uatp.ts"
```

Run from the app project root.

## Preflight

`$UATP doctor`. Required: node ≥ 22.6, ffmpeg with libx264, Playwright chromium, the TTS voice. Platform extras show as `!` warnings.

| Platform | Before recording |
|---|---|
| web | Nothing, besides `BASE_URL` (or `targets.web.baseUrl`) and any credential env vars |
| android | Emulator running or phone with USB debugging; `adb devices` lists exactly one (else set `devices.android`) |
| ios | A booted simulator with the app installed: `xcrun simctl boot "<name>"; open -a Simulator` |
| desktop | OBS open with a scene capturing the target window/display; Tools → WebSocket Server Settings enabled; `export OBS_WS_PASSWORD=…` |

## Run

```
$UATP record <ID> -p <platform>        # optional: --headed (web), --run <runId>
```

Exit codes: `0` passed, `2` ran but **not passed**, `1` tool/setup error. Output goes to `evidence/<runId>/<ID>/<platform>/`:
`raw.*` (video), `timeline.json`, `result.json`, `driver.log`, plus `trace.zip` (web), `junit.xml` (mobile), `recorder.log`.

## Reading the outcome

Report from `result.json` only. `items[]` has per-step/expectation status; an item that never ran is a failure ("not run"). Do not call a run passed because the video looks right.

## Desktop driver contract

`targets.desktop.command` runs with `uatp` on PATH. It must call `uatp mark <id>` as each step begins (`uatp mark e1 --fail "reason"` to flag a failed check) and exit non-zero on failure.

## Sync calibration

If narration lands slightly early or late in the rendered video, set `syncOffsetMs.<platform>` in `uatp.config.yaml` (positive moves markers later) and re-render; no re-recording needed.

## Troubleshooting

- *Chromium missing / version mismatch*: engine pins Playwright 1.59.1 (matches the cached browser). Otherwise `npx playwright install chromium` inside `engine/`.
- *No "[sN]" labelled commands*: the Maestro flow lacks labels; see uat-drivers.
- *scrcpy/simctl produced no video*: read `recorder.log`.
- *Rings look early/late (Android)*: tune `render.tapLagMs` in `uatp.config.yaml`.
- *Everything is shifted by many seconds*: check `result.json` notes for "produced no video file within 30 s".
- *Several devices connected*: pin one in `uatp.config.yaml` → `devices`.
