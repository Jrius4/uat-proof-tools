# Narration voices

Ten English Piper voices (5 female, 5 male) ship as a curated set. All come from [`rhasspy/piper-voices`](https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/en) at the pinned `v1.0.0` tag, and all use licences that allow commercial use.

| # | Label | Model | Speaker | Gender | Character | Licence |
|---|---|---|---|---|---|---|
| 1 | kristin | en_US-kristin-medium | | F | calm, relaxing (audiobook) | public domain |
| 2 | cori | en_GB-cori-high | | F | warm British audiobook | public domain |
| 3 | ljspeech | en_US-ljspeech-high | | F | clear, neutral US | public domain |
| 4 | alba | en_GB-alba-medium | | F | Scottish | CC BY 4.0 |
| 5 | sa-female | en_GB-vctk-medium | p336 | F | South African | CC BY 4.0 |
| 6 | norman | en_US-norman-medium | | M | calm, deep, relaxing (audiobook) | public domain |
| 7 | john | en_US-john-medium | | M | warm US narrator | public domain |
| 8 | joe | en_US-joe-medium | | M | plain US | CC0 |
| 9 | northern | en_GB-northern_english_male-medium | | M | Northern English | CC BY-SA 4.0 |
| 10 | sa-male | en_GB-vctk-medium | p347 | M | South African | CC BY 4.0 |

Piper has no single-speaker African-English voice. The two South African entries are speakers inside the multi-speaker VCTK model, which is why they carry a speaker name.

The list lives in [`config/piper-voices.tsv`](../config/piper-voices.tsv) (tab-separated; `-` in the speaker column means a single-speaker model). The scripts below read it.

## Download

```bash
scripts/download-piper-voices.sh
```

Fetches each model's `.onnx`, `.onnx.json` and model card into `~/piper-voices` (override with `PIPER_VOICES_DIR`). Existing files are skipped. About 650 MB in total.

## Pick a voice

In `uatp.config.yaml`:

```yaml
tts:
  engine: piper
  piperModel: ~/piper-voices/en_GB-vctk-medium.onnx
  piperSpeaker: p347        # multi-speaker models only: a name from the model's speaker_id_map, or a numeric id
```

Or per run, without editing the config (`render` and `all`):

```bash
uatp render UAT-DEMO-001 -p web --piper-model ~/piper-voices/en_US-norman-medium.onnx
uatp render UAT-DEMO-001 -p web --piper-model ~/piper-voices/en_GB-vctk-medium.onnx --piper-speaker p336
```

## Sample videos

```bash
export PATH=~/piper-venv/bin:$PATH
scripts/piper-voice-samples.sh [runId]
```

Re-narrates the TodoMVC demo recording once per voice and writes `examples/todomvc/evidence/voice-samples/NN-<label>.mp4` plus a `README.txt` summary. The `evidence/` folder is gitignored. The script re-renders into the recording's run folder, so that folder's own `*.stakeholder.mp4` ends up with the last voice in the list.

## Licences

Check each voice's model card (saved next to the model as `<voice>.MODEL_CARD.md`) before shipping videos. VCTK and alba (CC BY 4.0) and northern (CC BY-SA 4.0) require attribution; the others need none.
