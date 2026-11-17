#!/usr/bin/env bash
# Render the TodoMVC demo once per voice in config/piper-voices.tsv, so the narrators can be compared side by side.
# Re-narrates an existing recording (no re-recording). Usage: scripts/piper-voice-samples.sh [runId]
# Output: examples/todomvc/evidence/voice-samples/NN-<label>.mp4
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
voices="${PIPER_VOICES_DIR:-$HOME/piper-voices}"
project="$root/examples/todomvc"
out="$project/evidence/voice-samples"
id=UAT-DEMO-001
runflag=()
[ $# -ge 1 ] && runflag=(--run "$1")
mkdir -p "$out"

n=0
tail -n +2 "$root/config/piper-voices.tsv" | while IFS=$'\t' read -r label model speaker gender character license; do
  n=$((n + 1))
  nn=$(printf '%02d' "$n")
  [ -s "$voices/$model.onnx" ] || { echo "missing $voices/$model.onnx; run scripts/download-piper-voices.sh" >&2; exit 1; }
  [ "$speaker" = "-" ] && speaker=""
  spk=()
  [ -n "$speaker" ] && spk=(--piper-speaker "$speaker")
  echo "== $nn $label ($model${speaker:+ / $speaker})"
  node "$root/engine/bin/uatp.ts" render "$id" -p web --profile stakeholder --project "$project" \
    ${runflag[@]+"${runflag[@]}"} --piper-model "$voices/$model.onnx" ${spk[@]+"${spk[@]}"} > /dev/null
  run="${1:-$(ls "$project/evidence" | grep -v '^voice-samples$' | sort | while read -r r; do [ -f "$project/evidence/$r/$id/web/timeline.json" ] && echo "$r"; done | tail -1)}"
  cp "$project/evidence/$run/$id/web/$id.web.stakeholder.mp4" "$out/$nn-$label.mp4"
  printf '%s\t%s\t%s\t%s\t%s\n' "$nn-$label.mp4" "$gender" "$character" "$license" "$model${speaker:+/$speaker}" >> "$out/.summary.tmp"
done
{ printf 'file\tgender\tcharacter\tlicense\tvoice\n'; cat "$out/.summary.tmp"; } | column -t -s $'\t' | tee "$out/README.txt"
rm -f "$out/.summary.tmp"
