#!/usr/bin/env bash
# Download every Piper voice listed in config/piper-voices.tsv (model, config and model card) into ~/piper-voices.
# Files that already exist are skipped. Override the target with PIPER_VOICES_DIR.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="${PIPER_VOICES_DIR:-$HOME/piper-voices}"
base="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en"
mkdir -p "$dest"

fetch() { # url, file
  [ -s "$2" ] && return 0
  curl -fL --retry 3 -sS -o "$2.part" "$1" && mv "$2.part" "$2"
}

tail -n +2 "$root/config/piper-voices.tsv" | cut -f2 | sort -u | while read -r model; do
  IFS=- read -r locale name quality <<<"$model" # en_GB-northern_english_male-medium
  url="$base/${locale}/${name}/${quality}"
  echo "== $model"
  fetch "$url/$model.onnx" "$dest/$model.onnx"
  fetch "$url/$model.onnx.json" "$dest/$model.onnx.json"
  fetch "$url/MODEL_CARD" "$dest/$model.MODEL_CARD.md"
done
echo "Voices are in $dest"
