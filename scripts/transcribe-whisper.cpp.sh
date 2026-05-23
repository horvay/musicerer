#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 AUDIO OUT_DIR [MODEL]" >&2
  exit 2
fi

AUDIO="$1"
OUT_DIR="$2"
MODEL="${WHISPER_MODEL:-${3:-./models/ggml-distil-large-v3.bin}}"
mkdir -p "$OUT_DIR"

BIN="${WHISPER_CPP_BIN:-}"
if [ -z "$BIN" ]; then
  for candidate in \
    whisper-cli \
    whisper-cpp \
    main \
    /home/horvay/whispererer/vendor/whispercpp/bin/whisper-cli-local \
    /home/horvay/whispererer/vendor/whispercpp/bin/whisper-cli; do
    if command -v "$candidate" >/dev/null 2>&1; then
      BIN="$(command -v "$candidate")"
      break
    elif [ -x "$candidate" ]; then
      BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$BIN" ] || [ ! -x "$BIN" ]; then
  echo "Could not find whisper.cpp CLI. Set WHISPER_CPP_BIN=/path/to/whisper-cli" >&2
  exit 1
fi

if [ ! -f "$MODEL" ]; then
  echo "Missing model: $MODEL" >&2
  echo "Use a small local model such as distil-whisper small.en ggml and set WHISPER_MODEL=/path/to/ggml-distil-small.en.bin" >&2
  exit 1
fi

STEM="$(basename "$AUDIO")"
STEM="${STEM%.*}"
PREFIX="$OUT_DIR/$STEM"

"$BIN" -m "$MODEL" -f "$AUDIO" -otxt -osrt -of "$PREFIX"

# Also write stable names consumed by music-video.config.json and agents.
if [ -f "$PREFIX.txt" ]; then
  cp "$PREFIX.txt" "$OUT_DIR/transcript.txt"
fi
if [ -f "$PREFIX.srt" ]; then
  cp "$PREFIX.srt" "$OUT_DIR/transcript.srt"
fi

echo "transcript text: $OUT_DIR/transcript.txt"
echo "transcript srt:  $OUT_DIR/transcript.srt"
