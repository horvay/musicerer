#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 AUDIO OUT_DIR [MODEL]" >&2
  exit 2
fi

AUDIO="$1"
OUT_DIR="$2"
MODEL="${WHISPERX_MODEL:-${3:-large-v3}}"
mkdir -p "$OUT_DIR"

BIN="${WHISPERX_BIN:-}"
if [ -z "$BIN" ]; then
  if command -v whisperx >/dev/null 2>&1; then
    BIN="$(command -v whisperx)"
  elif command -v uvx >/dev/null 2>&1; then
    BIN="uvx whisperx"
  else
    echo "Could not find WhisperX. Install it or set WHISPERX_BIN=/path/to/whisperx" >&2
    echo "Example: pipx install whisperx" >&2
    exit 1
  fi
fi

STEM="$(basename "$AUDIO")"
STEM="${STEM%.*}"

LANGUAGE_ARGS=()
if [ -n "${WHISPERX_LANGUAGE:-}" ]; then
  LANGUAGE_ARGS=(--language "$WHISPERX_LANGUAGE")
fi

DEVICE="${WHISPERX_DEVICE:-cuda}"
COMPUTE_TYPE="${WHISPERX_COMPUTE_TYPE:-float16}"
BATCH_SIZE="${WHISPERX_BATCH_SIZE:-16}"
CHUNK_SIZE="${WHISPERX_CHUNK_SIZE:-60}"

# WhisperX writes files named after the input stem into OUT_DIR.
# Output JSON is useful for word-level caption workflows; SRT/TXT feed the planner.
# shellcheck disable=SC2086
$BIN "$AUDIO" \
  --model "$MODEL" \
  --device "$DEVICE" \
  --compute_type "$COMPUTE_TYPE" \
  --batch_size "$BATCH_SIZE" \
  --chunk_size "$CHUNK_SIZE" \
  --output_dir "$OUT_DIR" \
  --output_format all \
  "${LANGUAGE_ARGS[@]}"

# Also write stable names consumed by music-video.config.json and agents.
if [ -f "$OUT_DIR/$STEM.txt" ]; then
  cp "$OUT_DIR/$STEM.txt" "$OUT_DIR/transcript.txt"
fi
if [ -f "$OUT_DIR/$STEM.srt" ]; then
  cp "$OUT_DIR/$STEM.srt" "$OUT_DIR/transcript.srt"
fi
if [ -f "$OUT_DIR/$STEM.json" ]; then
  cp "$OUT_DIR/$STEM.json" "$OUT_DIR/transcript.json"
fi

echo "transcript text: $OUT_DIR/transcript.txt"
echo "transcript srt:  $OUT_DIR/transcript.srt"
echo "transcript json: $OUT_DIR/transcript.json"
