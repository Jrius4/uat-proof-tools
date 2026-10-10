---
name: uat-review
description: Review finished UAT proof videos for subtitle/narration sync, legibility, leaked secrets, and whether what the video claims matches the recorded result. Use after rendering, before sharing a video with a client or stakeholder.
argument-hint: "<scenario id> -p <platform> [--run <runId>]"
---

# Reviewing proof videos

Read-only. You inspect output and write findings; you do not change videos, scenarios or results.

Work in the run folder `evidence/<runId>/<ID>/<platform>/`.

## Checklist

1. **Claim vs result.** Read `result.json` and `report.md`. The end card (extract the last frame) must say PASSED only if `passed: true`. A failed item's narration must not claim success. Flag any mismatch as **blocker**.
2. **Structure.** `ffprobe -v error -show_entries stream=codec_name,width,height,sample_rate -of compact <mp4>` : h264 video, aac audio at 48000, a `mov_text` subtitle stream. Chapters: `ffprobe -show_chapters`. Chapter count should equal items + 2.
3. **Sync.** For each cue in the `.vtt`, grab a frame at its midpoint: `ffmpeg -ss <t> -i <mp4> -frames:v 1 -vf scale=640:-1 out.png`, then look at it. The screen should show the step being narrated (or its result). Optional audio check: `ffmpeg -i <mp4> -af silencedetect=noise=-40dB:d=0.25 -vn -f null -` and confirm speech starts within ~0.3 s of each cue start.
4. **Legibility.** Captions not clipped, not covering the thing being demonstrated, readable at phone size; banner text matches the check.
5. **Secrets.** Frames while typing credentials (steps with `sensitive: true`): is anything real visible (emails, tokens, patient/client data)? Also grep the `.vtt` for `@`, `${`, long digit strings. Anything found is a **blocker**.
6. **Pacing.** No cue under ~1.2 s, no long dead silence (> 3 s) without a reason, no action starting while the previous line is still being spoken.

## Report format

```
Verdict: ready to share | fix first
Blockers: …            (claim mismatch, leaked secret, missing/incorrect result)
Fixes: …               (sync offset to try, narration to shorten, config knob)
Checked: frames at t=…, silence ranges, ffprobe output
Not checked: …
```

State only what you verified. If you could not view frames, say so.
