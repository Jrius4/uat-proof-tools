# UAT / QA Proof Videos: A Free, Open-Source Recording Guide

> **Background research, not the manual.** This is the October 2026 tool survey that led to the `uat-proof` toolkit.
> For how to use the toolkit, see the [README](../README.md). Where they differ, the README wins. Known differences:
> the engine pins Playwright 1.59.1 (its screencast `showActions` has fewer options than 1.62), iOS recording uses
> `simctl` (no touch indicators), and burned-in captions are rendered as images because the installed ffmpeg has no
> `drawtext`/`libass`.

Last researched: 10 October 2026. Covers web, Flutter and React Native apps, driven by Claude Code (Sonnet 5.5).

## 1. Goal and constraints

- Produce short videos that show an app being tested, to serve as UAT / QA proof.
- Claude Code (on the existing Claude subscription) writes and fixes the test scripts.
- Everything else must be **free and open source**. No extra paid services.
- Platforms in scope: web, Flutter, React Native.

## 2. The core idea

An AI model does not record anything by itself. The video comes from the tool it drives. The setup is three layers:

1. **Driver:** Claude Code authors the scripts (and can drive the app interactively through MCP servers).
2. **Recorder:** the test framework or a screen recorder captures the video.
3. **Polish:** ffmpeg trims, converts and captions the clips.

Any model that can write the scripts gives you the same videos. Sonnet 5.5 is fine for authoring; a cheaper model such as Haiku 5.5 can handle repeat edits once scripts are stable.

## 3. Tool landscape

Star counts come from different snapshots (some from July to October 2026), so treat them as approximate and re-check before depending on them. "Not verified" means I could not find a figure.

| Need | Tool | Stars / maintenance | License | Notes |
|---|---|---|---|---|
| Web testing + video | Playwright | ~92.9K stars; latest release found 1.62.1 | Apache-2.0 | Built-in screencast API (added in 1.59) with action highlights and chapter titles |
| AI-driven browser | Playwright MCP | ~37.9K stars; pushed to 2026-10-07 | Free | Lets Claude Code drive a browser from natural language |
| Browser debugging | Chrome DevTools MCP | ~53.1K stars; pushed to 2026-10-07 | Free | Debugging (console, network, performance), not a recorder. Chrome only |
| Mobile flows (Flutter, RN, native) | Maestro CLI | ~13.7K stars (undated figure) | Apache-2.0 | YAML flows, easy for Claude Code to write. Needs Java 17+ |
| Flutter-native tests | Patrol | ~1.2K stars as of April 2026 | Apache-2.0 | Extends `integration_test`; handles OS permission dialogs |
| React Native alternative | Detox | ~10.6K stars; maintenance not confirmed (indexer showed a 2023 last commit, possibly stale) | Free | Prefer Maestro unless you need Detox specifically |
| Flutter AI driver | Marionette MCP | Stars not verified; 40 forks, 227 commits, pub.dev 0.3.0 | Free | Young. Lets Claude Code inspect, tap, type, scroll and screenshot a running app. App needs the `marionette_flutter` package |
| Flutter AI tooling | Dart and Flutter MCP server | Stars not verified | Free | Screenshots, widget tree, runtime errors. Better for development than for UAT flows |
| Android recording | scrcpy | ~127K stars; v3.3.2 | Free | Records the Android screen to MP4; `--show-touches` shows taps |
| Desktop / emulator window recording | OBS Studio | ~75K stars; active (commit within the last day) | GPL-2.0 | Records any window or the whole screen |
| Quick screen clips | Cap | ~21K stars; active | AGPL-3.0 | Loom-style; macOS and Windows; optional |
| Video polish | ffmpeg | Stars not checked; long-standing standard | Free | Convert, trim, caption, join |
| Android emulator | Android Studio emulator | n/a | Free | Test without a physical phone |
| Narration (text-to-speech) | Piper | Maintained by the Open Home Foundation at OHF-Voice/piper1-gpl; the original repo had 11K+ stars and was archived 6 Oct 2025. New repo's stars not verified | GPL-3.0-or-later | Fast, runs on CPU. Each voice model has its own license, so check it |
| Narration (text-to-speech) | Kokoro | Stars not verified | Apache-2.0 | 82M-parameter model; better quality than Piper, heavier. Neither engine clones a voice from a short sample |

## 4. Cost traps to avoid

- **Maestro Cloud** is the paid part of Maestro. The CLI is open source. Use `maestro test` locally.
- **Maestro Studio** (desktop app) is not part of the open-source repo. Skip it.
- **`maestro record`** may render video on Maestro's servers, according to one write-up (possibly dated). Verify, and use scrcpy for local recording instead, especially for client apps or anything with health data.
- **Firebase Test Lab** and other device farms are cloud services. Use your own emulator or phone.

## 5. Keeping Claude usage low

Have Claude Code write each script once, then rerun it yourself:

- Web: `npx playwright test`
- Mobile: `maestro test`

Those runs do not use Claude at all. You only spend Claude usage when writing or fixing a script.

## 6. Web: Playwright

### Two ways to record

- **Screencast API (1.59+):** programmatic start/stop, action highlights, chapter titles. Best for UAT proof.
- **Classic config:** `use: { video: 'on' }` in `playwright.config.ts`. Simplest. If you use the classic option, the video is only finalized when the browser context closes.

### No-code route

The bundled `playwright-cli` has `video-start`, `video-chapter` and `video-stop` commands, so Claude Code can record while following plain-language instructions.

### Keep traces too

Playwright traces capture DOM snapshots, network and console activity, which a video cannot show. Keep the trace next to each video as supporting evidence.

### Limits

- Records the browser viewport only, not the whole OS.
- Output is `.webm` (VP8 at 1 Mbit/s in 1.59, which makes text soft); convert to MP4 for sharing (see section 9). uat-proof records through Chrome's own screencast instead, for sharp, lossless frames.
- A Flutter **web** build draws to a canvas, so element targeting is harder than for normal HTML. Treat it as a mobile-style problem, not a Playwright-friendly one.

## 7. Flutter and React Native

### Driving the app

- **Maestro** works across Flutter, React Native and native apps. One tool to learn. Flows are YAML.
- **Patrol** is worth a look for Flutter-only projects that need to handle permission prompts and system dialogs.
- **Marionette MCP / Dart MCP** let Claude Code explore a running Flutter app interactively. Good for exploration and demo clips, not proof-grade evidence, because nothing in them asserts a pass.

### Making the app testable

- Flutter: Maestro finds elements through accessibility semantics. Give key widgets `Semantics` labels or stable visible text, otherwise flows cannot find them.
- React Native: use `accessibilityLabel` / `testID` on key components.

### Recording

- **Android:** `scrcpy --record file.mp4 --show-touches`.
- **iOS simulator:** needs a Mac with Xcode. Decide whether iOS is in scope before investing here.
- **Emulator window or desktop build:** OBS Studio.

Neither Maestro nor scrcpy adds chapter titles or highlights like Playwright's screencast does. Add captions afterwards with ffmpeg (section 9).

## 7b. Recommended stack

| Platform | Driver | Recorder |
|---|---|---|
| Web | Playwright specs | Chrome screencast over CDP (lossless `.mp4`) |
| Flutter | Maestro flows (Patrol optional) | `scrcpy --record` |
| React Native | Maestro flows | `scrcpy --record` |
| Finishing | n/a | ffmpeg |

## 8. Workflow

1. Write each UAT scenario in plain language with a stable ID.
2. Have Claude Code generate a Playwright spec and/or Maestro flow per scenario, with real assertions.
3. Run the scripts yourself (no Claude usage). Videos and screenshots land in `evidence/`.
4. Watch each video once, then trim, convert and caption with ffmpeg.
5. Store clips, traces and screenshots next to the UAT sign-off document.

**Important:** pass/fail must come from explicit assertions in the scripts, not from Claude saying "looks good". A video of an AI clicking around is not proof by itself. A video plus passing assertions is.

## 9. ffmpeg cheat sheet

```bash
# WebM to MP4 (widely playable)
ffmpeg -i UAT-001.webm -c:v libx264 -pix_fmt yuv420p UAT-001.mp4

# Trim from 2s to 20s (re-encode for accurate cuts)
ffmpeg -ss 00:00:02 -to 00:00:20 -i UAT-001.mp4 -c:v libx264 -pix_fmt yuv420p UAT-001-trim.mp4

# Burn a caption into the top-left corner
# (if drawtext complains about fonts, add fontfile=/path/to/font.ttf)
ffmpeg -i UAT-001.mp4 -vf "drawtext=text='UAT-001 Login valid':x=20:y=20:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.5" UAT-001-captioned.mp4

# Join clips into one reel: list them in clips.txt as
#   file 'UAT-001-captioned.mp4'
#   file 'UAT-002-captioned.mp4'
# (clips must share the same codec and resolution)
ffmpeg -f concat -safe 0 -i clips.txt -c copy uat-reel.mp4
```

## 9b. Audio and narration (open source)

The same scenarios can produce narrated videos. There are four ways to add audio, depending on what you want.

### Option 1: Scripted narration (most repeatable)

Add a `Narration:` line to each step in the scenario file (template below). A local text-to-speech engine (Piper or Kokoro) turns those lines into audio clips, and ffmpeg places them over the video. Nothing is re-recorded when you rerun a test.

- **Piper:** fast, runs on a CPU, GPL-3.0-or-later. Using it to generate speech is free; the GPL only matters if you distribute modified Piper source code.
- **Kokoro:** Apache-2.0, better sound quality, heavier.
- Neither clones a voice from a short sample.
- Check the license of each voice model you download.
- TTS APIs change between versions. Have Claude Code check the installed version's docs when it writes the narration script.

**Syncing audio to video is the hard part.**

Web: have each Playwright spec log a timestamp at every step.

```ts
const t0 = Date.now();
const marks: { label: string; ms: number }[] = [];
const mark = (label: string) => marks.push({ label, ms: Date.now() - t0 });
// call mark('Step 2: enter credentials') before each step,
// then write marks to evidence/UAT-001.timeline.json at the end
```

A small script then reads the timeline, generates one clip per step, and places each at its timestamp:

```bash
# Place two clips at 1.5s and 6.2s, then mix them
# (normalize=0 needs ffmpeg ~5.1 or newer)
ffmpeg -i s1.wav -i s2.wav -filter_complex \
"[0]adelay=1500|1500[a0];[1]adelay=6200|6200[a1];[a0][a1]amix=inputs=2:normalize=0[a]" \
-map "[a]" narration.wav

# Attach the narration to the video
ffmpeg -i UAT-001.mp4 -i narration.wav -c:v copy -c:a aac -shortest UAT-001-narrated.mp4
```

Flutter / React Native: Maestro has no easy built-in timestamp hook. Options:

- Split each scenario into one small flow per step and run them from a shell script that records the time before each one.
- Or use a single narration track for the whole scenario.

### Option 2: Live voiceover by you

OBS Studio can capture your microphone and the screen together. It sounds the most natural and needs no TTS, but every recording is manual. Best for demo reels rather than scripted proof runs.

### Option 3: Capture the app's own sound

- **Android (scrcpy):** audio forwarding is on by default for Android 11 and above, and recording a device also records its audio.
  - Android 12+: works out of the box.
  - Android 11: the screen must be unlocked when scrcpy starts.
  - Android 10 or older: audio cannot be captured.
  - Android 13+ apps can opt out of playback capture.
  - Use `--no-audio` to switch it off. Example: `scrcpy --record evidence/UAT-001-mobile.mkv --show-touches`
  - The device microphone can be captured instead with `--audio-source=mic`.
- **Web / desktop:** OBS can capture desktop audio. As far as I know, Playwright's own video has no audio track.
- **Narrating a phone live:** scrcpy's mic option records the phone's microphone, not yours. To record your voice while mirroring, capture the scrcpy window and your mic in OBS, or add narration afterwards with ffmpeg.

### Option 4: Captions instead of audio (simplest)

Burned-in captions generated from the same scenario text (see the `drawtext` example in section 9) work for reviewers who watch on mute and are less likely to drift out of sync.

### Suggested order

1. Captions first.
2. Piper narration for web, where timestamps are easy.
3. For mobile: record with scrcpy (with its audio), then add one narration track per scenario afterwards.

### Scenario template with narration lines

```markdown
## UAT-001: Login with valid credentials
- Platforms: web, mobile
- Preconditions: test account exists (credentials in env vars UAT_USER / UAT_PASS)
- Steps:
  1. Open the app
     - Narration: "We open the application on the login screen."
  2. Enter email and password
     - Narration: "We enter the test account's email and password."
  3. Tap/click "Log in"
     - Narration: "We submit the form."
- Expected:
  - Dashboard is shown
  - Text "Welcome" is visible
  - Narration: "The dashboard loads and shows the welcome message. UAT-001 passes."
- Evidence: 1 video + screenshot of dashboard
```

Caution: narration is built from the script text, so keep real client or patient data out of it. Also, the final "passes" line should only be in the finished video if the assertions actually passed. Generate it after the run, from the real result.

### Prompt addition for Claude Code

```text
Also: for each scenario, write evidence/<ID>.timeline.json with a timestamp
(ms since recording started) at the start of every step. Then write
scripts/narrate.* that reads uat/scenarios.md, generates one TTS clip per
Narration line with Piper, places each clip at its timestamp with ffmpeg,
and muxes the result into the scenario's video. Only add the final "passes"
line if the test run actually passed. Check the installed Piper version's
docs for the correct API.
```

## 10. Scenario template: `uat/scenarios.md`

```markdown
# UAT Scenarios

## UAT-001: Login with valid credentials
- Platforms: web, mobile
- Preconditions: test account exists (credentials in env vars UAT_USER / UAT_PASS)
- Steps:
  1. Open the app
  2. Enter email and password
  3. Tap/click "Log in"
- Expected:
  - Dashboard is shown
  - Text "Welcome" is visible
- Evidence: 1 video + screenshot of dashboard

## UAT-002: Login with wrong password
- Platforms: web, mobile
- Preconditions: same test account
- Steps:
  1. Open the app
  2. Enter valid email and a wrong password
  3. Tap/click "Log in"
- Expected:
  - Error message "Invalid credentials" is visible
  - User stays on the login screen
- Evidence: 1 video
```

Use stable IDs, concrete steps, and expected results that can be checked as text on screen.

## 11. Prompt for Claude Code

```text
Read uat/scenarios.md. For each scenario:
1. Web: create tests/uat/<ID>.spec.ts using @playwright/test. Record with
   page.screencast.start/stop (wrap the steps in try/finally so the video
   always saves), call showActions, and call showChapter with the scenario
   title. Check the installed Playwright version's docs for exact API names.
   Use real expect() assertions for every "Expected" line.
2. Mobile: create flows/<ID>.yaml as a Maestro flow with assertVisible for
   every "Expected" line and a takeScreenshot at the end.
3. Read credentials from env vars only. Never hardcode them.
4. Save videos and screenshots under evidence/.
5. Do not mark anything passed yourself. Run the tests and report the real results.
```

## 12. Example outputs

### Web: `tests/uat/UAT-001.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test('UAT-001: Login with valid credentials', async ({ page }) => {
  await page.screencast.start({ path: 'evidence/UAT-001.webm' });
  try {
    await page.screencast.showActions({ position: 'top-right' });
    await page.screencast.showChapter('UAT-001: Login with valid credentials');

    await page.goto(process.env.BASE_URL!);
    await page.getByLabel('Email').fill(process.env.UAT_USER!);
    await page.getByLabel('Password').fill(process.env.UAT_PASS!);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByText('Welcome')).toBeVisible();
  } finally {
    await page.screencast.stop();
  }
});
```

### Mobile: `flows/UAT-001.yaml`

```yaml
appId: com.example.app
name: "UAT-001: Login with valid credentials"
---
- launchApp:
    clearState: true
- tapOn: "Email"
- inputText: ${UAT_USER}
- tapOn: "Password"
- inputText: ${UAT_PASS}
- tapOn: "Log in"
- assertVisible: "Welcome"
- takeScreenshot: evidence/UAT-001-dashboard
```

## 13. Running it

```bash
# Web
BASE_URL=https://staging.example.com UAT_USER=... UAT_PASS=... npx playwright test tests/uat

# Mobile (two terminals)
scrcpy --record evidence/UAT-001-mobile.mp4 --show-touches
maestro test -e UAT_USER=... -e UAT_PASS=... flows/UAT-001.yaml
# then Ctrl+C scrcpy
```

## 14. Watch-outs

- **Typed values can show in videos.** Use dedicated test accounts with throwaway passwords, never real users' data.
- **Verify API names.** The screencast calls are based on the Playwright 1.59 release notes; the newest release found was 1.62.1. Check against your installed version.
- **Do a first run by hand.** Watch the first video to confirm framing and chapter titles before generating the rest.
- **Health or client data:** keep recordings local and review them before sharing.

## 15. Open decisions and next steps

- [ ] Android only, or iOS too? (iOS recording needs a Mac with Xcode.)
- [ ] Confirm which systems and apps are in scope first.
- [ ] Add `Semantics` labels / `testID`s to key screens so flows can find elements.
- [ ] Set up a dedicated test account and staging environment.
- [ ] Generate the first scenario, run it, and review the video.
- [ ] Decide where evidence is stored (repo folder, shared drive, UAT sign-off pack).
- [ ] Optional: try Marionette MCP for exploratory sessions after the scripted flows work.
- [ ] Audio: decide between captions only, scripted Piper narration, or live voiceover (section 9b).
- [ ] Audio: check the license of the Piper/Kokoro voice model you pick.
- [ ] Audio: on Android, confirm the test device runs Android 11+ if you want scrcpy to capture app sound.
- [ ] Audio: for mobile narration, decide between per-step flows (precise timing) and one narration track per scenario.
