---
name: uat-render
description: Turn a recorded UAT run into finished videos - narration (text-to-speech), subtitles, title and result cards, chapters - in two profiles (stakeholder and qa). Use to render, re-render, tune pacing or voice, switch TTS engine, or fix narration/subtitle sync.
argument-hint: "<scenario id> -p <platform> [--profile stakeholder|qa|all] [--run <runId>]"
---

# Rendering

```
UATP="node ${CLAUDE_SKILL_DIR}/../../engine/bin/uatp.ts"
$UATP render <ID> -p <platform>          # both profiles, newest run
```

Rendering never touches the raw recording and never re-runs the test, so it is free to repeat. It does not use Claude.

## Outputs (in the run folder)

`<ID>.<platform>.stakeholder.mp4` and `.qa.mp4`, each with `.vtt`, `.srt`, a `.jpg` thumbnail and chapter marks, plus `report.md`. The mp4 also carries a soft subtitle track.

| | stakeholder | qa |
|---|---|---|
| Intro | plain title + "what this proves", spoken | ID, platform, commit, date |
| Subtitles | burned in, large | soft track + sidecar files |
| Step tag | none | `s2 Enter email` top-left |
| Checks | green ✓ banner, held ~1.5 s | same with check text |
| Pacing | holds last frame so speech finishes; roomy | tight; long idle waits sped up (≤4×) |
| End card | PASSED / NOT PASSED + one line | same + failed ids |

The closing line and PASSED/NOT PASSED come from `result.json`. A failed check is **not** narrated as a success: its scripted line is replaced with "This did not pass. We expected: …".

## Tuning (`uatp.config.yaml`, all optional)

- Voice/speed (`say` only): `tts.voice` (`say -v '?'` lists voices), `tts.rate` (150-175 is easy to follow). Piper's voice is the model file in `tts.piperModel`.
- More breathing room: `profiles.stakeholder.breathingMs`, `leadInMs`.
- Longer title/end cards: `titleCardMs`, `endCardMs`.
- Sync: `syncOffsetMs.<platform>`.
- Speech is cached by text+voice+rate in `<run>/tts/`; unchanged lines don't re-synthesize.

## TTS engines

Piper is the default (piper-tts 1.8.0 on Python 3.12, installed under a short path; see the README for setup). `uatp init` writes `tts.piperModel` when it finds a voice in `~/piper-voices`, `$UATP_PIPER_MODEL` or `--piper-model`; otherwise set `tts: { engine: piper, piperModel: /path/voice.onnx }` yourself. `say` (macOS only) is the alternative: `tts.engine: say`. **Check each voice model's licence** before distributing videos. Neither engine clones a voice.

## Why captions are images

The installed ffmpeg has no `drawtext`/`libass`, so subtitles are rendered as transparent PNGs (HTML/CSS in Chromium) and overlaid. If you later install an ffmpeg with `libass`, switching to `subtitles=` is possible but not needed.
