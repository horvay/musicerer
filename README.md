# music_vids

Project-local Pi-agent workspace for making AI music videos from WAV files.

This repo uses Bun/TypeScript for orchestration, ComfyUI for generation, ffmpeg for editing, and project-local Pi subagents for autonomous direction/review.

## Important files

```text
AGENTS.md                         workspace rules
.pi/agents/                       project-local music-video agents only
music-video.config.json           active config
flux_klein.json                   Flux Klein still-image workflow
music_vid_comfyui_video.json      LTX image-to-video workflow
docs/PROMPTING.md                 Flux image + LTX video prompt guide
src/cli.ts                        Bun/TypeScript helper CLI
scripts/transcribe-whisperx.sh    WhisperX transcription wrapper
work/                             transcript, plans, attempts, approved clips, polish/remaster reports
output/                           final, remastered, and captioned MP4s
deprecated-workflows/             old workflows not used by current config
```

## Local transcription with WhisperX

Preferred transcription uses the external `whisperx` CLI. The wrapper defaults to the `large-v3` model and WhisperX's default VAD chunking, writes SRT/TXT/JSON outputs into the song work directory, and copies stable names used by the rest of the workflow:

```text
work/<song>/transcript.srt
work/<song>/transcript.txt
work/<song>/transcript.json
```

```bash
bun run transcribe
```

Useful overrides:

```bash
WHISPERX_MODEL=large-v3 WHISPERX_DEVICE=cuda WHISPERX_COMPUTE_TYPE=float16 bun run transcribe
```

## Prompt style

See `docs/PROMPTING.md` for the detailed Flux/LTX prompting guide.

- Flux Klein image prompts are `imagePrompt` values. They are natural-language cinematic still-frame descriptions: subject, action, camera, foreground, midground, background, lighting, weather, mood, era, and composition. For Harbor, do not put style directives in the image prompt because `flux_klein.json` supplies style separately.
- Flux Klein image generation does not use an image negative prompt in this project. Do not create or rely on `imageNegativePrompt`; phrase essential constraints positively in `imagePrompt`. If Flux keeps adding an unwanted object, stop naming that object and instead describe the desired visible replacement in the relevant foreground/midground/background layer.
- LTX video prompts are `videoPrompt` values. They are one flowing present-tense cinematic paragraph focused on motion: camera behavior, character action, atmosphere, weather, cloth/hair/environment movement, light changes, and emotional action.
- Dragons appear only when a lyric or scene explicitly calls for dragons.
- Central figures must state gender presentation, exact hair length/style, facial hair when relevant, and setting-appropriate clothing.

## Agent workflow

The intended flow is Pi-controlled and autonomous:

1. `music-video-director` creates or revises a lyric-aware visual plan and Flux prompts.
2. Still-image pass first: work scene by scene in order.
3. `music-video-clip-maker` generates exactly one Flux image attempt for the current scene.
4. `music-video-critic` reviews the still image. It normally approves only at 9+; below 9 sends a detailed report back to the director.
5. `music-video-director` revises the scene prompt from the critic report, then clip-maker tries the next attempt.
6. After 30 image attempts for a scene, select the highest-scored attempt and move forward even if it is below 9.
7. Move to the next scene's still image only after the current scene has a critic-approved or 30-attempt-selected Flux still.
8. After **all scenes** have approved/selected still images, start the video pass.
9. `music-video-clip-maker` creates one LTX video attempt at a time from the approved image, scene by scene in order.
10. `music-video-critic` extracts 5 frames and approves video attempts at 8+; retry that scene until its video is approved.
11. After every scene has an approved video, `music-video-polish-editor` runs one scene at a time. It extracts 8 frames, optionally uses FFmpeg to crop/reframe, zoom, retime, grade, repair edges, or add filter-based polish, validates the result, and replaces `work/<song>/clips/000N.mp4` only when the edit improves the clip.
12. `music-video-editor` renders the clean final 1080p MP4 from approved/polished clips and normalizes audio for YouTube-style delivery.
13. `music-video-remaster` optionally applies the story-aware full-video FFmpeg/similar finishing pass before captions, producing a clean remastered MP4.
14. `music-video-captioner` burns captions after remastering when captions are requested, using the remastered MP4 as input if it exists.

The final output is upscaled/cropped to `1920x1080`. Per-clip polish outputs must also be `1920x1080`, project fps, H.264 MP4, `yuv420p`, and duration-matched to the approved source clip within one frame. Remastered outputs must remain clean/un-captioned until the captioner step. Final MP4 audio should be around `-14 LUFS` integrated loudness with true peak ceiling around `-1.5 dBTP`.

## Background job server

For a warmer ComfyUI workflow, run the project HTTP job server:

```bash
bun run server
```

The server listens on `http://127.0.0.1:3030` by default, keeps ComfyUI running when `comfy.launch` is enabled, serializes jobs, and exposes endpoints for agents or scripts:

```bash
curl http://127.0.0.1:3030/status
curl -X POST http://127.0.0.1:3030/comfy/start
curl -X POST http://127.0.0.1:3030/image -H 'content-type: application/json' -d '{"scene":1,"attempt":1}'
curl http://127.0.0.1:3030/jobs/1
```

Main endpoints: `POST /transcribe`, `/plan`, `/image`, `/approve-image`, `/clip`, `/extract-frames`, `/approve`, and `/render`.
Set `MUSIC_VIDEO_SERVER_PORT` or `MUSIC_VIDEO_CONFIG` to override defaults.

## Manual helper commands

```bash
bun run check
bun run transcribe
bun run plan
bun run image -- --scene 1 --attempt 1
bun run approve-image -- --scene 1 --attempt 1 --score 9 --report "accepted image"
bun run clip -- --scene 1 --attempt 1
bun run frames -- --scene 1 --attempt 1
bun run approve -- --scene 1 --attempt 1 --score 8 --report "accepted video"
bun run render -- --force
```

## ComfyUI wiring

```text
6.inputs.text          Flux image prompt
9                     Flux SaveImage output
151.inputs.seed        Flux Klein seed
145.inputs.noise_seed  Flux Klein noise seed
41.inputs.seed         Flux upscale seed
148.inputs.width       Flux Klein scheduler width
148.inputs.height      Flux Klein scheduler height
149.inputs.width       Flux latent width
149.inputs.height      Flux latent height
3305.inputs.text       LTX video prompt
2197.inputs.image      approved image input for LTX video workflow
2196                  VHS_VideoCombine video output
2277:2249.inputs.value clip seconds
2277:2506.inputs.value FPS
```

See `docs/WORKFLOW.md` for the autonomous loop details. Do not use shell loops to generate unreviewed assets. First approve still images for all scenes one by one, then approve videos for all scenes one by one. After all videos are approved, run the polish editor scene by scene before clean final render. Apply any full-video remaster before burned-in captions.
