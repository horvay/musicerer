# Transcription models

The current transcription path uses the external `whisperx` CLI, defaulting to the `large-v3` model. WhisperX downloads/caches model files outside this project according to its own Hugging Face/PyTorch cache settings.

This directory is intentionally not used for committed model weights. Large local model files such as `*.bin` and `*.gguf` are ignored by Git.

Useful overrides:

```bash
export WHISPERX_MODEL=large-v3
export WHISPERX_DEVICE=cuda
export WHISPERX_COMPUTE_TYPE=float16
```
