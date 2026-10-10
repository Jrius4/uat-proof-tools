# uat-proof

Turn UAT/QA scenarios into short, easy-to-watch proof videos with **voice narration and subtitles**, for web, Android, iOS Simulator and any desktop window.

Claude Code **writes and fixes** the scenario and test drivers (skills + agents). A **deterministic local engine** (`uatp`) records, narrates and renders. Re-running the engine costs no Claude usage, and the PASS/FAIL on every video comes from the test driver's real result, never from Claude or from how the video looks.

```
ticket / story
   │  skill uat-scenario  (agent uat-scenario-writer)
   ▼
uat/scenarios/UAT-001.yaml  +  UAT-001.md storyboard   ← a human approves this before anything is recorded
   │  skill uat-drivers   (agent uat-test-engineer)
   ▼
tests/uat/UAT-001.spec.ts (Playwright)   flows/uat/UAT-001.yaml (Maestro)
   │  uatp record
   ▼
evidence/<run>/UAT-001/<platform>/  raw video + timeline.json + result.json (+ trace.zip / junit.xml)
   │  uatp render
   ▼
UAT-001.<platform>.stakeholder.mp4   UAT-001.<platform>.qa.mp4   .vtt .srt   report.md
   │  skill uat-review    (agent uat-reviewer)
   ▼
sync / legibility / secrets / claim-vs-result check
```

## Quick start

Requirements: macOS (the default voice uses `say`), Node ≥ 22.6, ffmpeg with libx264, and per platform: Maestro + Java 17 (mobile), scrcpy + adb (Android), Xcode (iOS Simulator), OBS 28+ (desktop).

```bash
# one-time: engine dependencies
npm ci --prefix engine

# in the app project you want to test (the plugin lives here; the app is elsewhere)
node /path/to/uat-proof-tools/engine/bin/uatp.ts doctor
node /path/to/uat-proof-tools/engine/bin/uatp.ts init
```

Use as a Claude Code plugin from any app repo: `claude --plugin-dir /path/to/uat-proof-tools`, then ask for `/uat-proof UAT-001 --platform web` (the skill drives scenario → approval → drivers → record → render → review, and stops for your approval of the storyboard).

Try the demo without Claude:

```bash
cd examples/todomvc
node ../../engine/bin/uatp.ts all UAT-DEMO-001 -p web      # record + render both profiles
open evidence/*/UAT-DEMO-001/web/UAT-DEMO-001.web.stakeholder.mp4
```

## Commands

| | |
|---|---|
| `uatp doctor` | Checks ffmpeg, Playwright browser, voice, Maestro, Java, adb/scrcpy, Xcode simulators, OBS WebSocket |
| `uatp init` | Creates `uat/scenarios`, `tests/uat`, `flows/uat`, `uatp.config.yaml` |
| `uatp validate [id…]` | Schema + safety checks (duplicate ids, credentials/emails in narration, over-long lines) |
| `uatp storyboard <id>` | Writes `<id>.md`: what viewers will see and hear. Review this first |
| `uatp record <id> -p <platform>` | Runs the driver while recording. Exit `0` passed, `2` not passed, `1` error |
| `uatp render <id> -p <platform>` | Narrates, subtitles and composes both profiles |
| `uatp all <id> -p <platform>` | `record` then `render` |
| `uatp mark <step>` | For desktop drivers: timestamp the start of a step |

## Scenario format

Plain YAML, platform-agnostic. Everything else is generated from it. Full field list: [skills/uat-scenario/references/schema.md](skills/uat-scenario/references/schema.md); examples: [skills/uat-scenario/examples](skills/uat-scenario/examples).

```yaml
id: UAT-001
title: Sign in with a valid account
proves: A returning customer can sign in and reach their dashboard.
platforms: [web, android]
steps:
  - id: s1
    do: Open the app
    narration: We open the app on the sign-in screen.
    caption: Open the app
  - id: s2
    do: Enter email and password
    narration: We enter the test account's details.
    sensitive: true
expect:
  - id: e1
    check: Text "Welcome" is visible
    narration: The dashboard shows the welcome message.
outro:
  pass: Sign-in works as expected. This check passed.
  fail: This check did not pass. The QA report lists what went wrong.
```

## What the videos look like

| | stakeholder (non-technical) | qa (engineering) |
|---|---|---|
| Intro | Title + "what this proves", spoken | ID, platform, commit, date |
| Subtitles | Burned in, large | Soft track + `.vtt`/`.srt` |
| Step tag | none | `s2 Enter email` badge |
| Taps | Gold ring where a finger tapped (Android) | Same |
| Checks | Green ✓ banner, held ~1.5 s | Same, with check text |
| Pacing | Holds the last frame until speech ends | Tight; long idle waits sped up (≤ 4×) |
| End card | PASSED / NOT PASSED + one line | Same + failed ids |

Both play in any player (H.264/AAC, MP4, chapter marks). Tune voice, rate and pacing in `uatp.config.yaml` ([example](config/uatp.config.example.yaml)).

**Honest narration.** If a check fails, its scripted line is replaced by "This did not pass. We expected: …", the banner turns red, and the end card says NOT PASSED. A check that never ran counts as a failure.

## What is verified, and what is not

Verified on this machine (macOS, Node 24, ffmpeg 9.0.2, Playwright 1.59.1):

- **Web, end to end** against the TodoMVC demo: record → both profiles → frames inspected (title, captions, banners, end card), speech aligned to subtitle cues within ~100 ms, soft subtitle track, chapters, 48 kHz AAC.
- **Android, end to end on a real emulator** (Android 17, 1080×2424; Maestro 2.11.0, scrcpy 5.0.1): the stock Settings app, [examples/android-settings](examples/android-settings). Real Maestro `commands.json` parsed (labels, start times, statuses), real scrcpy recording started and finalised on SIGINT, frames at each marker match the timeline, portrait layout and captions render correctly at full resolution. The run found and fixed two real bugs (see below).
- **Failure path**: a deliberately wrong expectation produced a red banner, corrected narration, NOT PASSED end card, and exit code 2.
- 27 unit tests (`npm test --prefix engine`): pacing plan, subtitle cueing, scenario validation, Maestro parsing and tap extraction.
- Plugin manifest passes `claude plugin validate`.

Fixed after real-device testing:

- scrcpy's "Recording started" line is block-buffered over a pipe and only appears at exit, so the recorder waited 30 s and mis-aligned every marker by ~30 s. Recording start is now detected from the output file appearing.
- scrcpy's `--show-touches` is enabled but **does not draw anything for Maestro's injected taps**. Taps are now drawn by the renderer: Maestro's log records `Tapping at (x, y)`, and a gold ring is overlaid at that point.

**Not yet verified, so expect a first-run adjustment:**

- **iOS Simulator** (Maestro on iOS and `simctl` recording): no booted simulator was used.
- **OBS** WebSocket recording (code written against obs-websocket v5; no OBS session was run).
- **Piper** TTS (adapter written, Piper not installed).
- The skills and agents running live inside Claude Code (structure validated, behaviour not exercised).
- Android on a physical phone, other Android versions, and apps other than Settings.

Known limits:

- **Tap rings are Android-only.** They come from Maestro's log, with a `render.tapLagMs` (650 ms default) because the log line precedes the touch landing; calibrated on one slow emulator, so adjust if rings look early or late. iOS Simulator recordings (`simctl`) have no touch indicators and no rings; use the `desktop` platform on the Simulator window if taps must be visible. Taps by `swipe`, `scroll` or coordinates without a "Tapping at" log line get no ring.
- **Maestro start-up is dead air.** Maestro takes ~14 s to start before its first command; that lead-in is cut automatically because rendering starts at the first step. Individual Maestro commands can also be slow on emulators (a 5 s tap is normal there), which shows up as idle time inside a step; the `qa` profile speeds those up.
- Playwright is pinned to **1.59.1** because it matches the browser already cached on this machine; newer versions need `npx playwright install chromium` (a download). 1.59's `showActions` is simpler than 1.62's; the fixture upgrades automatically.
- Captions are rendered as images because the installed ffmpeg lacks `drawtext`/`libass`.
- `sensitive: true` keeps secrets out of narration and captions, but it cannot blur text a driver types into a visible field. Use throwaway test accounts and let `uat-reviewer` check frames.
- Narration is `say` (macOS only) until Piper is set up. Check any voice model's licence before distributing videos.

## Layout

```
.claude-plugin/plugin.json
skills/   uat-proof (orchestrator) · uat-scenario · uat-drivers · uat-record · uat-render · uat-review
agents/   uat-scenario-writer · uat-test-engineer · uat-video-producer · uat-reviewer
engine/   uatp CLI (Node, no build step): lib/recorders/{web,mobile,obs}, lib/{compose,cards,subtitles,tts}, playwright/uat-fixture.ts
config/   uatp.config.example.yaml
examples/ todomvc (web) · android-settings (Android emulator)
docs/     research-guide.md (the tool survey that led here)
```
