# Music video workflow

## Agents

- `music-video-director` — creates/revises the lyric-aware visual plan and Flux/WAN prompts.
- `music-video-clip-maker` — generates still-image batches of 3 Flux attempts per scene, optionally queued for up to 10 scenes at a time during the still pass; generates exactly one requested WAN video attempt.
- `music-video-critic` — reviews generated images/videos, scores them, approves accepted attempts, and writes retry guidance.
- `music-video-polish-editor` — after all scene videos are approved, optionally polishes one approved clip at a time with FFmpeg by inspecting frames, cropping/reframing, grading, retiming, and validating the result.
- `music-video-editor` — renders approved/polished clips into the clean final MP4.
- `music-video-remaster` — applies a story-aware full-video FFmpeg/similar finishing pass to the clean final MP4 before captions.

## Current generation stack

- Still images: `flux_klein.json` using Flux Klein.
- Image-to-video: `video_wan2_2_14B_i2v_default_remix_gguf_4step_lora_eulera_landscape.json` using WAN 2.2 from the approved Flux still.
- WAN video stack: Remix GGUF high/low models, 4-step LightX2V LoRAs enabled, `euler_ancestral`, split step `2`, CFG `1`, and `832x480` generation before polish/editor conforming.
- Flux image prompts are natural-language `imagePrompt` values at `6.inputs.text`.
- There is no image negative prompt for Flux. Do not use `imageNegativePrompt`.
- WAN video prompts remain `videoPrompt` values at `129:93.inputs.text`; video negatives are patched at `129:89.inputs.text`.

## Autonomous loop

Work in controlled agent batches. During still-image generation only, the clip-maker may queue up to 10 scenes in one invocation, generating 3 still attempts per scene for a maximum of 30 still images total. Video generation, retries after critique, polish, rendering, remastering, and captions remain ordered agent-controlled work; do not use ad hoc shell loops outside the clip-maker's documented still queue.

The director should validate new plans against any user-stated clip-duration range. The range is literal and inclusive when creating or revising a plan: if the user requests `4-12 second clips`, aim for `clipDuration >= 4.0` and `clipDuration <= 12.0`, and do not substitute defaults such as 8-12 seconds. However, do not block generation solely because an existing plan has longer clips; assume the user may have intentionally allowed or accepted them unless they explicitly ask for a timing fix.

### Phase -1 — required WhisperX word timing pass

Before any scene planning, always run WhisperX with the `large-v3` model against the source song and keep the JSON word timings. For final caption timing, the preferred high-accuracy pass is full-song WhisperX `large-v3` on CPU with `float32` and `batch_size 4`; if a passage is dropped, run additional WhisperX passes with different model/compute settings and use the best AI-derived timing before falling back to interpolation:

```bash
bun run video transcribe
# or explicitly:
WHISPERX_MODEL=large-v3 bun run video transcribe
# caption timing high-accuracy example:
# uvx --from whisperx whisperx <final-audio.wav> --model large-v3 --language en --device cpu --compute_type float32 --batch_size 4 --output_format json
```

Required artifacts:

```text
work/<song>/transcript.txt
work/<song>/transcript.srt
work/<song>/transcript.json
```

The plan must use `transcript.json` word timings, aligned to the corrected/trusted lyric text when WhisperX mishears words. Before planning, compare the WhisperX transcript against the user-provided/canonical lyrics and create corrected alignment artifacts when they differ. When important words or phrase endings are missing/low-confidence, run targeted WhisperX retries on short clipped time ranges around the expected words, optionally with alternate compute/batch settings or boosted audio, then merge any recovered word timings into the corrected alignment before falling back to interpolation. Scene starts/ends should be derived from real word/phrase timings, not guessed from rough song sections or later interpolated caption timings. If WhisperX drops, merges, or misrecognizes words even after targeted retries, locally interpolate only those missing words between adjacent aligned words and document the caveat in `director-plan.md` or a dedicated transcript-alignment report.

### Phase 0 — user concept, scene outline, and song-specific failure conditions

Every project must include these universal quality gates before any song-specific gates are added:

1. Reject non-diegetic text or marks: watermarks, creator signatures, UI overlays, captions/subtitles, logos, random readable text, or unintended labels.
2. Reject bad anatomy on prominent subjects: malformed foreground hands, fused limbs, extra limbs, impossible body structures, or unreadable creature/human anatomy.
3. Reject bad hand-object contact: hands melded into, fused with, swallowed by, or growing out of ropes, wood, railings, chains, staffs, sword handles, maps, tools, instruments, or other held/touched objects; if holding something, fingers and palm must visibly grip or rest on it with readable separation.
4. Reject key prop deformation: important props must be structurally readable and not melted, duplicated, bent, warped, rubbery, or proportionally impossible; swords specifically must not have bent/warped/rubbery blades, duplicated hilts, extra-long polearm-like handles, or unreadable hilt/blade proportions.
5. Reject unreadable central action: if an action is central to the scene — breaking chains, holding a sword, opening a gate, playing an instrument, climbing, rowing, steering, carrying, fighting, embracing, etc. — the action must be visually understandable.
6. Treat user-called-out defects as hard fails: once the user, director, or critic identifies a specific failure mode to watch for in a song, any visible occurrence is an automatic reject, not a minor issue.
7. Reject continuity disappearance: central characters, allies, weapons, staffs, crowns, held objects, and key props must not randomly disappear, pop in/out, detach, float unsupported, or transform into unrelated objects during a clip.
8. Reject held-object failures: if someone is meant to hold a sword, staff, map, railing, chain, tool, or other prop, the prop must remain present and the hand must visibly grip or rest on it with readable separation.
9. Reject identity drift on recurring subjects: recurring characters must not unexpectedly change species, age, hairstyle, baldness, head proportions, facial identifiers, costume language, or other approved continuity traits.

Before finalizing prompts or generating assets for a new song, ask the user what should be in the video in general: the desired story, recurring characters, setting, mood, symbols, things to emphasize, and things to avoid. Use the user's answer as the creative brief.

Then create a simple scene-by-scene breakout for user approval before writing the full generation plan. This breakout should be concise bullets in order, describing what each scene shows at a story/visual level without final Flux/WAN prompt detail. Do not proceed to full prompts, still generation, or video generation until the user approves or revises this outline.

Also ask the user for a short list of song-specific failure conditions / quality gates. Give exactly 5 concrete suggestions tailored to the current song so the user can accept, reject, or edit them. Examples include wrong eye color, too many legs, incorrect species/markings, unwanted human faces, modern artifacts, bad foreground hands, unwanted text/logos, or continuity breaks.

Record the approved creative brief, approved scene breakout, and accepted quality gates in `work/<song>/director-plan.md` and, when practical, in `work/<song>/plan.json` under `qualityGates`. The critic must read and enforce these conditions during still and video review.

### Phase 1 — still-image pass

1. Director writes or revises the scene's Flux `imagePrompt`, with scene timing already validated against the user's requested clip-duration range.
2. Clip-maker generates 3 Flux still-image attempts per scene. It may queue up to 10 scenes in one invocation during the still pass, for a maximum of 30 still images total. Attempts should be created sequentially and tracked per scene.
   ```bash
   bun run video image -- --scene <N> --attempt <A>
   ```
3. Critic inspects each scene's 3 still images directly and scores each 1-10, primarily by how well each still illustrates the scene lyrics/story beat. The prompt is guidance, not a strict checklist.
4. If any still for a scene scores `9+`, critic runs `approve-image` for the best accepted still and the workflow advances that scene.
5. If all 3 stills for a scene score below `9`, critic writes a detailed comparative failure report tied to the lyrics/story beat. Director revises that scene's Flux prompt using the report, then clip-maker generates the next 3 attempts for that scene.
6. Hard cap: after 30 image attempts for a scene, stop retrying. Select the highest-scored image attempt for that scene, run `approve-image` with its actual score/report, and advance even if the score is below `9`.
7. Do not generate any WAN videos until every scene has a critic-approved or 30-attempt-selected Flux still, except when the user explicitly authorizes a one-off WAN test animation for a scene that already has an approved still. One-off tests must still be generated by `music-video-clip-maker`, must not be treated as opening the full video pass, and must not be approved as final unless/until the normal full still pass is complete.

### Phase 2 — video pass

0. Optional user-authorized one-off test: before the full video pass, the user may explicitly request a single WAN test animation for a scene that already has an approved still. The clip-maker generates exactly one requested test attempt; the critic may inspect it for learning, but it must not be approved as final and the workflow must return to the still-image pass until all scenes have approved images.
1. After all scenes have approved images, clip-maker generates one WAN video attempt for scene 1 from its approved image.
2. Critic extracts frames and scores the video 1-10. Reject videos with persistent white speckles/dots, snow-like flecks, salt-and-pepper artifacts, bright point-noise, or mosaic/block breakup across frames.
3. If score is `8+`, critic approves the video and the workflow advances to the next scene.
4. If score is below `8`, director revises the `videoPrompt` / `videoNegativePrompt`, clip-maker retries the same scene, and critic reviews again.
5. Continue until every scene has an approved video.

### Phase 3 — per-clip polish pass

After every scene has an approved video clip, the orchestrator calls `music-video-polish-editor` one scene at a time before final render. This pass is FFmpeg-only post-production: it may crop/reframe, zoom, retime while preserving source duration, color grade, sharpen/blur, add vignette/grain/glow-style filter effects, or repair bad edges/artifacts.

Rules for the polish pass:

1. Work on exactly one approved scene clip per invocation.
2. Use the scene number plus optional directive from the orchestrator; if lyrics/prompts/context are not supplied in the task, read them from `work/<song>/plan.json`.
3. Extract 8 source frames with FFmpeg and inspect the frames directly before deciding whether any edit is needed.
4. Default to do no harm. `unchanged-no-edit-needed` and `unchanged-not-fixable` are successful outcomes.
5. Write draft edits under `work/<song>/polish-attempts/scene-000N/` and extract 8 frames after each attempt.
6. Compare source frames against edited frames using an editorial-delta review: accept only if the edit improves drama or hides a fixable flaw while preserving the primary subject/emotional beat.
7. Try at most 5 polish attempts per clip. If all attempts are rejected, keep the approved clip unchanged and report `unchanged-attempts-rejected`.
8. Before the first overwrite, save `work/<song>/polish-attempts/scene-000N/original-approved.mp4`; on explicit repolish directives, preserve the previous polished clip and restart from that original approved backup.
9. Accepted polished clips replace `work/<song>/clips/000N.mp4`; raw generated attempts under `work/<song>/attempts/scene-000N/` are never overwritten.
10. Polished output must be final-render-ready: `1920x1080`, project fps, H.264 MP4, `yuv420p`, no introduced audio, and duration drift less than one frame compared with the approved source clip's `ffprobe` duration.
11. Letterbox or pillarbox bars are allowed only as a last-resort repair while still producing a `1920x1080` file.
12. Update the relevant scene's polish metadata in `plan.json` and write `work/<song>/polish-attempts/scene-000N/report.md`.

The final renderer uses `scene.clip` first, so replacing `work/<song>/clips/000N.mp4` makes the accepted polish version the render source while preserving raw video attempts as fallback artifacts.

### Phase 4 — clean render

Editor renders the clean final MP4 at 1920x1080 from approved/polished clips and normalizes audio to YouTube-style delivery around `-14 LUFS` integrated loudness with true peak ceiling around `-1.5 dBTP`.

### Phase 5 — full-video remaster before captions

When the project or user wants output-level finishing, call `music-video-remaster` on the clean final MP4 before any burned-in captions are created. This pass is FFmpeg/similar post-production over the whole video: it may add story-aware color arcs, film grain, flicker, print diffusion, halation, vignette, noir/bleach-bypass, sepia, saturation/contrast transitions, or other local filter effects.

Rules for the remaster pass:

1. Input is the clean final MP4 from `music-video.config.json`, for example `output/harbor.mp4`, unless the user supplies another clean source.
2. Output is a clean uncaptioned sibling such as `output/harbor-remastered.mp4`.
3. Read the lyrics and `work/<song>/plan.json`; choose effects that support the story rather than applying a fixed preset.
4. Combine effects only when each improves the whole-video mood or narrative arc.
5. Keep audio copied/preserved by default; the clean render already handles loudness.
6. Validate 1920x1080, H.264, `yuv420p`, project fps, duration, and audio presence.
7. Write `work/<song>/remaster/report.md` with the concept, commands, validation, and review frame/preview paths.
8. Captioning, when requested, uses the remastered MP4 as input so captions sit on top of the final look.

Example style only, not a default: for Harbor, the user liked an old-film/noir bleach-bypass treatment that starts fairly strong and gradually fades toward a brighter warmer hopeful ending. The remaster agent may use that idea when it matches the plan, but should adapt or choose another style for other songs.

### Phase 6 — captions when requested

When captions are requested, call `music-video-captioner` after remastering. If `output/<song>-remastered.mp4` exists, use that as the clean caption input and write a captioned sibling such as `output/<song>-remastered-captioned.mp4`. If no remaster exists, caption the clean final render directly.

## Commands

```bash
bun run video transcribe
bun run plan
bun run video image -- --scene 1 --attempt 1
bun run video approve-image -- --scene 1 --attempt 1 --score 9 --report "accepted image"
bun run video clip -- --scene 1 --attempt 1
bun run video extract-frames -- --scene 1 --attempt 1
bun run video approve -- --scene 1 --attempt 1 --score 8 --report "accepted video"
bun run render -- --force
# optional/manual: call the music-video-remaster subagent after render and before captions
```
