# UAT / QA Proof Videos: A Free, Open-Source Recording Guide

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
- Output is `.webm`; convert to MP4 for sharing (see section 9).
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
| Web | Playwright specs | Playwright screencast (`.webm`) |
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
