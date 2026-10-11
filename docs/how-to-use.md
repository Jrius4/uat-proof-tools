# How to use uat-proof

This guide covers four things: setting the tool up, using it as a Claude Code plugin, bringing in UAT scenarios you already have, and running many scenarios at scale. Everything here comes from the code and from runs on this repo's examples. Anything I have not run is marked **Not tested**.

Contents

1. [How it fits together](#1-how-it-fits-together)
2. [Set up](#2-set-up)
3. [Use it as a Claude Code plugin](#3-use-it-as-a-claude-code-plugin)
4. [Bring in scenarios you already have](#4-bring-in-scenarios-you-already-have)
5. [Run a test, per platform](#5-run-a-test-per-platform)
6. [Run it at scale](#6-run-it-at-scale)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. How it fits together

Two parts, with a hard line between them:

- **Claude Code (the plugin)** writes and fixes the *inputs*: the scenario file and the test drivers. It costs Claude usage.
- **The `uatp` engine** is a local command-line tool. It runs the driver, records the screen, speaks the narration, adds subtitles and renders the video. It does not use Claude, so re-running it is free.

The PASS/FAIL on a video comes from the test driver's real result (`result.json`, exit code), never from Claude and never from how the video looks.

```
scenario YAML  ──►  drivers (Playwright / Maestro)  ──►  uatp record  ──►  uatp render  ──►  mp4 + subtitles + report
(you approve it)    (one per platform)                   raw video +        two videos:
                                                         result.json        stakeholder, qa
```

The scenario YAML is the single source of truth. Narration, captions, the storyboard and the per-step results are all built from it.

## 2. Set up

You install the tool once. You then point it at whichever app you want to test; the app repo is separate from this one.

**Requirements**

| For | You need |
|---|---|
| Everything | macOS (the default voice is the built-in `say`), Node 22.6 or newer, ffmpeg with libx264 |
| Web | Nothing more. The engine pins Playwright 1.59.1 |
| Android | Maestro, Java 17, scrcpy, adb, an emulator or a phone with USB debugging |
| iOS Simulator | Maestro, Java 17, Xcode with a booted simulator |
| Desktop apps | OBS 28+ with the WebSocket server enabled |

**Install the engine's dependencies (once)**

```bash
cd /path/to/uat-proof-tools
npm ci --prefix engine
```

**Check your machine**

```bash
node /path/to/uat-proof-tools/engine/bin/uatp.ts doctor
```

`✓` means ready. `✗` must be fixed. `!` only matters for the platform it names (for example "no booted simulator" matters only for iOS).

**Make `uatp` easy to type**

The engine has no global install. Either add a shell function to `~/.zshrc`:

```bash
uatp() { node /path/to/uat-proof-tools/engine/bin/uatp.ts "$@"; }
```

or pass `--project <dir>` so you can run it from anywhere:

```bash
node /path/to/uat-proof-tools/engine/bin/uatp.ts validate --project ~/code/my-app
```

The rest of this guide assumes the `uatp` function and that you run it **from the root of the app you are testing**.

**Prepare the app project (once)**

```bash
cd ~/code/my-app
uatp init
```

This creates `uat/scenarios/`, `tests/uat/`, `flows/uat/` and a `uatp.config.yaml`. Recordings go to `evidence/`, which the repo's `.gitignore` excludes because videos are large and can contain client data. Re-run `init` if you move the tool, because it writes a machine-local file (`tests/uat/_uat.ts`) that points at your install.

## 3. Use it as a Claude Code plugin

### Load it

From the app repo:

```bash
cd ~/code/my-app
claude --plugin-dir /path/to/uat-proof-tools
```

`--plugin-dir` loads the plugin for that session only. There is no marketplace listing yet, so there is no one-line install. To check the plugin is well-formed, run `claude plugin validate /path/to/uat-proof-tools`.

Plugin skills are namespaced, so type `/uat-proof` and pick the entry from the autocomplete list.

### What the plugin gives you

| Skill | Agent behind it | Use it to |
|---|---|---|
| `uat-proof` | (orchestrator) | Run the whole pipeline end to end |
| `uat-scenario` | `uat-scenario-writer` | Write or edit the scenario YAML and storyboard |
| `uat-drivers` | `uat-test-engineer` | Write or fix the Playwright spec / Maestro flow |
| `uat-record` | (the orchestrator) | Preflight, device setup, run and debug a recording |
| `uat-render` | `uat-video-producer` | Render, retune voice or pacing, fix sync |
| `uat-review` | `uat-reviewer` | Check sync, legibility, leaked secrets and claim vs result |

### The usual flow

Ask for the whole thing:

```
/uat-proof UAT-001 --platform web
```

or start from a ticket:

```
/uat-proof "As a returning customer I can sign in and see my dashboard" --platform android
```

The skill then:

1. Runs `uatp doctor` and fixes `✗` items.
2. Writes the scenario, then `uatp validate` and `uatp storyboard`.
3. **Stops and shows you the storyboard** (`uat/scenarios/<id>.md`): what viewers will see and hear. Nothing is recorded until you say yes. Ask for edits here; it updates the YAML and regenerates the storyboard.
4. Writes the drivers.
5. Records, then renders both videos.
6. Reviews the result and reports the outcome for each step.

What the plugin will and will not do:

- It will not weaken an assertion or change expected text to make a failing run pass. If a check fails against the real app, it reports the failure and stops. That is a finding, not a bug in the script.
- It will not invent an expected result the source does not state. It lists open questions instead.
- It keeps credentials out of files, narration and captions. Credentials come from environment variables, for example `UAT_USER` and `UAT_PASS`.

You can also call one stage on its own, for example "use the uat-render skill to re-render UAT-001 on android with the qa profile".

**Not tested:** the skills and agents running live inside Claude Code. Their structure is validated and the engine they call is tested, but I did not run a full `/uat-proof` session. Expect to adjust on the first run.

### Without Claude

Once a scenario and its driver exist, you never need Claude to record again:

```bash
uatp all UAT-001 -p web
```

## 4. Bring in scenarios you already have

**There is no import command.** The engine's commands (`validate`, `storyboard`, `record`, `render`, `all`) all expect scenarios that already use the YAML format below. Converting a spreadsheet, Word file, wiki page or test-management export into that format is a job for Claude, through the `uat-scenario` skill, or for a script you write.

### Option A (recommended): have Claude convert them

Put your existing scenarios somewhere Claude can read them (a folder, a CSV, a pasted block), start Claude with the plugin loaded, and ask:

```
Use the uat-scenario skill to convert my existing UAT scenarios in ./qa/legacy/ into
uat/scenarios/*.yaml. One file per scenario, ids like UAT-001. Platform is web.
Do not invent expected results: if a scenario doesn't state one, list it as an open question.
Then run uatp validate and uatp storyboard for each and show me the storyboards.
```

The `uat-scenario-writer` agent writes the YAML, runs `uatp validate`, fixes errors and generates the storyboards. It will come back with open questions wherever your old scenario lacked a clear expected result. Answer those, then review the storyboards.

### Option B: map them by hand

Each field in your old scenario goes somewhere in the new one:

| In your existing scenario | Goes to | Notes |
|---|---|---|
| Test case ID | `id` | Letters, digits, `-` and `_`. Becomes the file name |
| Title / name | `title` | 3 to 90 characters |
| Purpose / objective | `proves` | One plain sentence, 140 characters at most. Spoken on the title card |
| Setup / preconditions | `preconditions` | Listed on the storyboard, not spoken |
| Each action step | `steps[]` with `id: s1`, `s2`… | `do` is what happens (for engineers). `narration` is what is said (for viewers) |
| Each expected result | `expect[]` with `id: e1`, `e2`… | `check` must be something visible on screen. It becomes a real assertion |
| Test data (usernames, passwords) | **Not in the file** | Use environment variables and mark the step `sensitive: true` |
| Environment / URL / app id | `targets` | `targets.web.baseUrl`, `targets.android.appId`, and so on |

A minimal file:

```yaml
id: UAT-001
title: Sign in with a valid account
proves: A returning customer can sign in and reach their dashboard.
platforms: [web]
targets:
  web:
    baseUrl: ${BASE_URL}
steps:
  - id: s1
    do: Open the app
    narration: We open the app on the sign-in screen.
    caption: Open the app
  - id: s2
    do: Enter the test account's email and password
    narration: We enter the test account's details.
    sensitive: true
  - id: s3
    do: Click Log in
    narration: We click Log in.
expect:
  - id: e1
    check: The text "Welcome" is visible
    narration: The dashboard shows the welcome message.
    caption: Welcome message shown
outro:
  pass: Sign-in works as expected. This check passed.
  fail: This check did not pass. The QA report lists what went wrong.
```

Narration rules (the validator enforces some of them): speak as "we", present tense, about 20 words at most per line, the words that appear on screen, no selectors or ids, and never an email, token or `${VAR}` in narration or captions. Do not claim success inside a step; the engine adds the pass or fail result itself. Longer guidance: `skills/uat-scenario/references/narration-style.md`. Full field list: `skills/uat-scenario/references/schema.md`. Worked examples: `skills/uat-scenario/examples/`.

### Option C: convert in bulk with a script

If your scenarios are already structured (a CSV with one row per step, for instance), a small script that emits the YAML above will be faster than either option for hundreds of scenarios. Have it produce the structure, then let Claude write the `narration` lines, since those must be written for a viewer rather than copied from a test step. **Not tested:** I have not written or run such a converter.

### After converting: validate, then storyboard

```bash
uatp validate              # every scenario in uat/scenarios, exits 1 on errors
uatp validate UAT-001      # one scenario (by id or by file path)
uatp storyboard UAT-001    # writes uat/scenarios/UAT-001.md
```

`validate` errors (schema problems, duplicate ids, an email or `${VAR}` in narration, `desktop` without a command) must be fixed. Warnings (narration over 28 words, a quoted value in a `sensitive` step) are worth reading. Open the `.md` storyboard and check what a viewer will see and hear. Edit the YAML, never the `.md`, because the `.md` is regenerated.

### You also need drivers

A scenario describes what to prove. A **driver** is the script that does it in the app. If you already have Playwright tests or Maestro flows, they can be adapted rather than rewritten:

- **Playwright (web):** `tests/uat/<ID>.spec.ts`. Import from `./_uat`, wrap each scenario step in `uat.step('s1', 'label', async () => {…})` and each expectation in `uat.check('e1', 'label', async () => {…})`.
- **Maestro (Android, iOS):** `flows/uat/<ID>.yaml`. Give every command a `label` that starts with its id, for example `label: "[s2] Enter email"`.

Every step and expectation id in the scenario must appear in the driver. An id that never runs counts as **not run**, which fails the scenario. Ask Claude with the `uat-drivers` skill to write or convert them. Reference notes: `skills/uat-drivers/references/playwright.md` and `maestro.md`.

## 5. Run a test, per platform

The commands are the same on every platform:

```bash
uatp record UAT-001 -p <platform>   # run the driver and record
uatp render UAT-001 -p <platform>   # narrate, subtitle, compose both videos
uatp all    UAT-001 -p <platform>   # both of the above
```

If a scenario lists only one platform, `-p` can be left out.

**Exit codes:** `0` passed, `2` ran but did not pass, `1` the tool or setup failed. Use them in scripts and CI.

### Web

```bash
export BASE_URL=https://staging.example.com   # or targets.web.baseUrl in the scenario
export UAT_USER=...  UAT_PASS=...             # throwaway test account only
uatp all UAT-001 -p web
```

Add `--headed` to `record` to watch the browser. Try the bundled demo first: `cd examples/todomvc && uatp all UAT-DEMO-001 -p web`.

### Android

1. Start an emulator or connect a phone with USB debugging, and install the app.
2. `adb devices` should list exactly one device. If it lists several, pin one in `uatp.config.yaml` under `devices.android`.
3. `uatp all UAT-001 -p android`

Maestro takes about 14 seconds to start, and that lead-in is cut from the video automatically. Taps are drawn as a gold ring by the renderer.

### iOS Simulator

```bash
xcrun simctl boot "iPhone 16" && open -a Simulator
uatp all UAT-001 -p ios
```

Install the app on the simulator first.

### Desktop app

Desktop recording goes through OBS: open OBS with a scene that captures the target window, enable Tools → WebSocket Server Settings, and `export OBS_WS_PASSWORD=...`. The scenario's `targets.desktop.command` is a shell command that drives the app and calls `uatp mark <id>` as each step begins (`uatp mark e1 --fail "reason"` to flag a failed check), exiting non-zero on failure. See `examples/desktop-textedit`.

**Not tested:** OBS recording. The code is written against obs-websocket v5, but no OBS session has been run. Expect a first-run adjustment.

### Where the output goes

`evidence/<runId>/<ID>/<platform>/` contains:

| File | What it is |
|---|---|
| `UAT-001.<platform>.stakeholder.mp4` | For non-technical viewers: plain title, large burned-in subtitles, roomy pacing |
| `UAT-001.<platform>.qa.mp4` | For engineers: step badges, soft subtitle track, idle waits sped up (up to 4×) |
| `.vtt`, `.srt`, `.jpg` | Subtitles and thumbnail for each video |
| `report.md` | Result for each step and check, and links to the videos |
| `result.json`, `timeline.json` | The source of truth for pass/fail and timing |
| `raw.*`, `driver.log`, `recorder.log`, `trace.zip` or `junit.xml` | Raw recording and logs, for debugging |

`uatp render` never touches the raw recording or re-runs the test, so you can re-render as often as you like to change the voice or pacing.

### Check before you share

Watch the stakeholder video. The `uat-review` skill checks sync, legibility, leaked secrets and claim vs result, and you can run it before sending a video to a client. Plain text inputs show what was typed, so use a throwaway account. `sensitive: true` keeps secrets out of narration and captions but cannot blur what a driver types into a visible field.

### Change the voice

Default is macOS `say`. List voices with `say -v '?'` and set them in `uatp.config.yaml`:

```yaml
tts:
  engine: say
  voice: Samantha
  rate: 165        # words per minute; 150 to 175 is easy to follow
```

For an open-source voice that also works off macOS, use Piper:

```bash
python3.12 -m venv ~/piper-venv        # not 3.15: onnxruntime has no wheels for it yet
~/piper-venv/bin/pip install piper-tts
~/piper-venv/bin/python -m piper.download_voices en_US-lessac-medium --data-dir ~/piper-voices
export PATH=~/piper-venv/bin:$PATH
```

```yaml
tts:
  engine: piper
  piperModel: /Users/you/piper-voices/en_US-lessac-medium.onnx   # absolute path; "~" is not expanded
```

Install Piper under a **short path**: its espeak-ng component fails with "phontab: No such file" if the install path is much over about 160 characters. Check any voice model's licence before distributing videos. Piper has been run end to end on the web demo and the Android emulator example. Neither run was judged by ear, so listen first.

## 6. Run it at scale

### Many scenarios, one command

`uatp all` takes one scenario at a time, so loop over the folder. This loop was run against the bundled demo, and it records, renders, and fails if any scenario fails:

```bash
fail=0
for f in uat/scenarios/*.yaml; do
  id=$(basename "$f" .yaml)
  uatp all "$id" -p web || fail=1     # keep going; collect failures
done
exit $fail
```

Swap `-p web` for the platform you are recording. Scenarios that list several platforms need `-p` stated each time, because `uatp` will not guess.

To run a subset, glob on the id: `for f in uat/scenarios/UAT-CHECKOUT-*.yaml; do …`.

### Keep the pipeline honest

- **Validate first, fail fast.** `uatp validate` with no arguments checks every scenario and exits 1 on any error. Run it before recording anything, and on pull requests that change `uat/scenarios/`.
- **Use the exit codes.** `0`, `2` and `1` mean passed, did not pass, and tool error. A CI job can treat `2` as "the app has a defect" and `1` as "the pipeline is broken".
- **Group by id.** A consistent prefix per area (`UAT-AUTH-001`, `UAT-CHECKOUT-004`) makes folders, loops and reports easy to filter.
- **Split long journeys.** Four to eight steps per scenario keeps videos short and failures easy to locate.
- **Share config.** `uatp.config.yaml` in each app repo holds voice, pacing, devices and per-platform sync tuning. If narration lands slightly early or late, set `syncOffsetMs.<platform>` and re-render, with no re-recording.

### CI

- Web scenarios need the engine's dependencies, ffmpeg with libx264, and Playwright's Chromium (`npx playwright install chromium` inside `engine/`). The default `say` voice only exists on macOS, so a macOS runner works as-is, and a Linux runner needs Piper. **Not tested:** Piper or the whole pipeline on Linux.
- Android and iOS need an emulator or simulator, which means a runner that can host one. **Not tested** in CI.
- Desktop recording needs a real display and OBS, so it suits a dedicated machine rather than a shared runner.
- Store `evidence/` as a build artifact. Do not commit it. It is large and can contain client data, which is why it is gitignored.
- Provide credentials as secrets that become environment variables. Never put them in scenarios, flows or specs.

### Limits to plan around

- **One device and one OBS session at a time.** Android, iOS and desktop runs share a single emulator, simulator or OBS instance, so run them one after another.
- **Web scenarios write to separate folders per scenario id**, so running several in parallel should be possible. **Not tested.**
- **Cost.** Recording and rendering use no Claude usage. Claude is only used when writing or fixing scenarios and drivers. Re-running a scenario whose scenario and driver did not change costs nothing.
- **Time.** Recording runs in real time and rendering produces two videos, so budget for both. Emulators can be slow, and Maestro's start-up alone takes about 14 seconds. I have not measured total run time per scenario.

### One tool, many apps

The engine lives in one checkout. Each app repo holds its own `uat/`, `tests/uat/`, `flows/uat/` and `uatp.config.yaml`. Use `claude --plugin-dir /path/to/uat-proof-tools` from each app repo, and run `uatp init` once in each.

## 7. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `uatp: command not found` | There is no global install. Define the `uatp` shell function from section 2 |
| `doctor` shows `✗ playwright chromium` | `npx playwright install chromium` inside `engine/` |
| A step or check shows "not run" | The id is in the scenario but missing from the driver. Every `s*` and `e*` id must appear in it |
| Exit `2` with a red banner | The app did not meet an expectation. This is a finding. Do not edit the assertion to make it pass |
| Exit `1` | Tool or setup error. Read `driver.log` and `recorder.log` in the run folder |
| Everything is shifted by many seconds | Check `result.json` notes for "produced no video file within 30 s" |
| Narration slightly early or late | Set `syncOffsetMs.<platform>` in `uatp.config.yaml` and re-render |
| Tap rings early or late (mobile) | Tune `tapLagMs.<platform>` in `uatp.config.yaml` |
| Several devices connected | Pin one under `devices` in `uatp.config.yaml` |
| Piper fails with "phontab: No such file" | Piper is installed under a path that is too long. Reinstall under `~/piper-venv` |
| `uatp validate` says narration contains a variable or email | Remove it. Credentials must never be spoken or shown |

Further reading: the [README](../README.md) for the verified-and-not-verified list and known limits, and [research-guide.md](research-guide.md) for the survey of tools that led to this design.
