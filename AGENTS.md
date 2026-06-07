# Music Video Workspace Agents

This project is a Pi-controlled autonomous workflow for turning WAV songs into AI-generated music videos.

## Core rules

- Keep agents project-local in `.pi/agents/`; do not add these music-video agents to global Pi config. For Grok Build compatibility, `.grok/agents/` may symlink to `.pi/agents/`, and `.grok/skills/` may symlink to `.pi/skills/`, but `.pi/` remains the source of truth.
- Prefer Bun + TypeScript for project code.
- Do not add Python project code. External tools may exist, but transcription should prefer the external `whisperx` CLI with the `large-v3` model.
- Default local still-image generation uses `flux_klein.json` as the only local still-image workflow. Do not use old local image workflows and do not fall back to them.
- When the user explicitly asks for OpenAI/ChatGPT/web still generation, delegate it to the project-local `openai-maker` subagent. The `openai-maker` agent uses Playwright MCP and the user's logged-in ChatGPT/OpenAI subscription through the chat interface, not local image models or API keys.
- Never generate still images directly from the main assistant context. Local Flux still-image generation must be delegated to `music-video-clip-maker`; OpenAI/ChatGPT web still-image generation must be delegated to `openai-maker`. During the still-image pass, generate 3 still attempts per scene, and the selected maker may queue up to 10 scenes at a time for still generation only (30 still images total).
- Default local image-to-video generation uses `video_wan2_2_14B_i2v_default_remix_gguf_4step_lora_eulera_landscape.json` for WAN 2.2 from approved stills. Do not use the old LTX video workflow unless the user explicitly asks for an LTX comparison.
- When the user explicitly asks for Grok Imagine animation/video, delegate image-to-video generation to the project-local `grok-maker` subagent. The `grok-maker` agent uses Playwright MCP and the user's logged-in Grok/xAI account through the web interface, not local video models or API keys.
- Final output must be 1080p (`1920x1080`).
- Scene and clip durations must follow the user's stated range exactly. If the user says clips should be `4-12 seconds`, every planned scene `clipDuration` must be at least 4.0 seconds and at most 12.0 seconds; do not silently substitute a narrower/default range such as 8-12 seconds, and do not allow 12+ padding to push a clip over the maximum.
- Final MP4 audio should be YouTube-safe normalized: target about `-14 LUFS` integrated loudness with true peak ceiling around `-1.5 dBTP`.
- Full-video remastering/post-processing belongs after the clean final render and before burned-in captions.
- Keep only these important artifacts long-term:
  - `work/.../transcript.txt`
  - approved/polished clips in `work/.../clips/`
  - final, remastered, captioned, and thumbnail-intro MP4s in `output/`
  - selected thumbnails in `work/.../thumbnails/` and/or `output/`
  - critic reports, polish reports/attempts, thumbnail attempts, and remaster reports/previews are okay to keep during iteration.

## Prompting rules

Read `docs/PROMPTING.md` before creating or revising prompts.

- Flux Klein image prompts (`imagePrompt`, node `6.inputs.text`) must be natural-language cinematic still-frame descriptions, not tag soup. Do not specify style in Harbor image prompts; the image workflow supplies style separately. Focus on a prose explanation of the scene and define the recurring man clearly whenever he appears.
- Flux Klein does not support a meaningful image negative prompt in this workflow. Do not write or rely on `imageNegativePrompt`. Put important constraints in positive natural language, e.g. `a deserted empty frame` or `The world contains only candles, oil lamps, wood, stone, brass, rope, and canvas.`
- If the image maker keeps adding an unwanted object, stop naming that object in the prompt. Replace it with the desired visible alternative: `empty wet quay`, `splintered timbers`, `blank unmarked walls`, `period-accurate hand-built materials`, etc. Do not mention `lighthouse` in prompts for scenes where a lighthouse should not appear; use alternatives like `distant warm point`, `amber beacon glow`, `stone tower` only when that object should be visible.
- Directors should describe one exact still frame in organized layers: subject/action, foreground, midground, background, camera angle/shot scale, lighting, weather, mood, era, and composition. Put the most important visual elements early and keep each layer internally consistent.
- Avoid old image-model tokens: no `masterpiece`, `best quality`, `1man`, `1girl`, `solo`, Danbooru tags, weighted parentheses, or comma-keyword piles.
- WAN video prompts (`videoPrompt`, node `129:93.inputs.text`) remain one flowing present-tense cinematic paragraph focused on what changes over time: camera movement, character action, weather/cloth/hair/environment motion, light changes, and emotional beat.
- Use one central foreground figure per image prompt unless the scene explicitly needs an environment-only or object-detail shot. Multi-person foreground scenes require explicit user/director reason.
- Do not use invented character names inside actual generation prompts. Use `the man`, `the girl`, or `the woman` plus concrete visual descriptors. Names may exist only in director notes.
- Only include dragons or other creatures when the lyric or scene explicitly calls for them.
- Every central figure must have explicit gender presentation, hair length/style, core clothing, and era-appropriate costume.
- Gender presentation, hair length/style, facial hair, core clothing, and era must stay stable across extracted frames.
- Prominent hands must have acceptable anatomy. Missing/fused/extra fingers on foreground hands are retry-level failures.
- WAN videos with persistent white speckles/dots, snow-like flecks, salt-and-pepper artifacts, bright point-noise, or mosaic/block breakup across frames are reject-level failures.
- Cats or other animals with human hands, fingers, arms, feet, or humanoid limbs are reject-level failures.
- Diegetic in-world text or markings on signs, maps, compass faces, books, plaques, storefronts, sails, hulls, or props are acceptable if they fit the scene. Only watermarks, creator signatures, Patreon/artist marks, UI overlays, captions/subtitles, and logos are automatic text/mark failures.
- Do not depend on specialized labels alone. Describe old or unusual settings with simple visible parts.
- Establish the time frame in plans and prompts when needed. For Harbor, use old pre-electric / 19th-century-inspired maritime fantasy: candles and oil lamps only; wood, wet stone, brass, rope, canvas; no modern machinery or electric fixtures visible.
- Sexy heroic fantasy styling is allowed for adult women when clothed and non-explicit; avoid nudity or explicit sexual framing.

## Subagent usage for one-off requests

Prefer reusing project-local Pi subagents in `.pi/agents/` whenever a user request matches an existing specialty, even if the request is a small one-off rather than the full autonomous workflow.

- Use `music-video-editor` for final rendering, timeline assembly, audio normalization, output fixes, and direct edit requests like cropping/reframing/exporting a clip or final video.
- Use `music-video-polish-editor` for scene-level polish on existing clips: crop/reframe, zoom, retime, grade, repair edges, and editorial cleanup before replacing `work/.../clips/000N.mp4`.
- Use `music-video-remaster` for full-video FFmpeg/similar finishing after the clean final render and before captions: overall color story, film grain, flicker, print looks, dynamic mood arcs, and output-level enhancement.
- Use `music-video-director` for visual plans, prompt revisions, scene concepts, continuity, and responding to critic feedback.
- Use `music-video-clip-maker` for generating Flux stills or WAN video attempts through the approved local workflows.
- Use `openai-maker` for generating ChatGPT/OpenAI web still-image attempts and YouTube thumbnail attempts through Playwright MCP when the user explicitly chooses the web/subscription route instead of local image models.
- Use `grok-maker` for generating Grok Imagine web image-to-video attempts through Playwright MCP when the user explicitly chooses the Grok/web animation route instead of local WAN.
- Use `music-video-critic` for inspecting generated stills/videos, scoring, approvals, failure reports, and frame-based review.
- Use `music-video-captioner` for transcript/caption/subtitle-related tasks, normally using the remastered clean MP4 as input when it exists.
- Use `music-video-orchestrator` when the request spans multiple workflow roles or needs sequencing across agents.

Only handle the request directly when no existing project subagent fits, when the user explicitly asks not to use subagents, or when a trivial file/documentation edit is faster and clearly outside those specialties.

## Intended autonomous flow

0. **Always run WhisperX before planning.** Extract the song audio timing with WhisperX `large-v3` and preserve word-level JSON timing data in `work/<song>/transcript.json` before creating or revising the scene plan. Do not rely on guessed, interpolated, or manually estimated lyric timings when word timings can be obtained. If the displayed lyrics are corrected by hand, align the corrected lyric text to WhisperX word timings and document any interpolated/missing words.
1. Transcribe the song with local WhisperX.
2. Before finalizing the plan or generating assets, ask the user which generation methods to use for both still images and image-to-video: local Flux vs ChatGPT/OpenAI web stills, and local WAN vs Grok Imagine web animation. Store the accepted choices in `work/<song>/director-plan.md` and in `plan.json` under `generationMethods` so the orchestrator and makers use the intended route.
3. Also ask the user for song-specific failure conditions / quality gates. Provide 5 concrete suggestions based on the current song, such as wrong eye color, too many legs, unwanted human faces, wrong costume, unreadable anatomy, unwanted objects, or continuity breaks. Store the accepted failure conditions in `work/<song>/director-plan.md` and/or `plan.json` `qualityGates` so the critic can enforce them.
4. Director agent creates/updates a visual plan from lyrics and song structure using the WhisperX word-level timing grid as the timing source, including natural-language `imagePrompt` values for still generation. The director must validate scene timings against any user-specified clip duration range before generation begins.
5. Still-image pass first: work scene by scene in order. Use the explicit still source recorded in `generationMethods`: default local Flux via `music-video-clip-maker`, or ChatGPT/OpenAI web generation via `openai-maker`.
6. For still generation, the selected maker generates 3 still-image attempts per scene. It may queue up to 10 scenes in one invocation during the still-image pass, for a maximum of 30 still images total, while still keeping attempts grouped by scene.
7. The critic inspects each scene's 3 generated stills directly and scores each 1-10. Image score is based primarily on how well each still illustrates that scene's lyrics/story beat, not strict prompt compliance. Image approval threshold is normally `9+`; approve the best scoring still for a scene when at least one of its attempts reaches `9+`.
8. If all 3 stills for a scene score below `9`, the critic writes a detailed comparative failure report tied to that scene's lyrics/story beat. The director revises that scene prompt using the report, then the selected still maker generates the next 3 attempts for that same scene.
9. Hard cap: after 30 image attempts for a scene, stop retrying that scene. Pick the highest-scored image attempt for that scene, run `approve-image` with that score/report, and move forward even if it is below `9`.
10. Move to the next scene's still image only after the critic has approved the current scene image or the 30-attempt cap has selected the best available image. Do not generate any videos until **all scenes** have approved/selected still images.
11. Video pass second: generate image-to-video attempts scene by scene in order from the approved still images. Use the explicit video route recorded in `generationMethods`: default local WAN via `music-video-clip-maker`, or Grok Imagine via `grok-maker`.
12. Critic extracts 5 frames from each video attempt and approves video at `8+`; retry the same scene until its video is approved.
13. After all scenes have approved video clips, run the polish editor scene by scene. It must inspect 8 extracted frames, optionally use FFmpeg to crop/reframe, zoom, retime, grade, repair edges, or add filter-based polish, and only replace `work/.../clips/000N.mp4` when its edited output passes editorial-delta review and technical validation.
14. Editor agent renders approved/polished clips into a clean final 1080p MP4 and normalizes final audio for YouTube-style delivery.
15. Remaster agent applies any story-aware full-video FFmpeg/similar finishing pass to the clean final MP4, producing a clean remastered MP4 before captions.
16. Captioner agent burns captions into the remastered MP4 when a remaster exists; otherwise it uses the clean final MP4.
17. Thumbnail pass: after the final video story/look is locked, generate 3 YouTube thumbnail still attempts. Default to the same still-image route recorded in `generationMethods`; if the user asks for ChatGPT/OpenAI thumbnails, delegate to `openai-maker`. Thumbnails must be 16:9, readable at small size, story-accurate, and free of text/logos/watermarks unless the user explicitly asks for title text.
18. Critic reviews thumbnail attempts directly and selects the best one. Thumbnail score should prioritize click-readability, emotional/story clarity, protagonist/continuity accuracy, clean composition, and no hard failures such as glowing eyes, malformed hands, malformed sword/lantern, modern artifacts, text/logos/watermarks, or misleading imagery.
19. Editor agent may add the selected thumbnail as a short visual intro when requested or as the default YouTube packaging pass: hold the thumbnail for 5 frames at 24fps, then crossfade smoothly into the first clip. If editing a captioned/remastered final, preserve 1080p, H.264/yuv420p, normalized audio, and caption/audio sync by adding the same silent/audio offset as the visual pre-roll. Output clearly named `*-thumbintro.mp4` variants in `output/`.

## Current ComfyUI workflow wiring

- Image workflow: `flux_klein.json`
- Video workflow: `wan_hardcoded.json`
- WAN video model: high `wan22RemixI2VGGUFV30_highQ6K.gguf`, low `wan22RemixI2VGGUFV30_lowQ6K.gguf`
- WAN 4-step LoRAs: `wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors`, `wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors`
- WAN SmoothMix LoRAs: `SmoothMixAnimation_High.safetensors`, `SmoothMixAnimation_Low.safetensors` at `0.7`
- WAN VAE / CLIP: `wan_2.1_vae.safetensors`, `umt5_xxl_fp8_e4m3fn_scaled.safetensors`
- WAN sampler: `euler`, 4-step LightX2V mode enabled, split step `2`, CFG `1`
- WAN generation size: `832x480`, 81 frames at 16 fps, then RIFE interpolation / output handling in `wan_hardcoded.json`; editor/polish conforms approved clips to final `1920x1080` and planned scene duration
- Flux Klein image prompt: `6.inputs.text`
- Flux Klein image output node: `9` (`SaveImage`)
- Flux Klein image seeds: `151.inputs.seed`, `145.inputs.noise_seed`, `41.inputs.seed`
- Flux Klein image size: `148.inputs.width`, `148.inputs.height`, `149.inputs.width`, `149.inputs.height`
- Video prompt: `452.inputs.text`
- Video negative prompt: `451.inputs.text`
- Approved image input to video workflow: `484.inputs.image` and `174.inputs.image`
- Video output node: `63` (`VHS_VideoCombine`)
- FPS: hardcoded in `wan_hardcoded.json`

## Important commands

```bash
bun run check
bun run video transcribe
bun run plan
curl -s -X POST http://127.0.0.1:3030/image -H 'content-type: application/json' -d '{"scene":1,"attempt":1}'
bun run scripts/register-web-image-attempt.ts -- --scene 1 --attempt 1 --image work/<song>/attempts/scene-0001/image-attempt-1.png
curl -s -X POST http://127.0.0.1:3030/approve-image -H 'content-type: application/json' -d '{"scene":1,"attempt":1,"score":9,"report":"accepted image"}'
curl -s -X POST http://127.0.0.1:3030/clip -H 'content-type: application/json' -d '{"scene":1,"attempt":1}'
bun run scripts/register-grok-video-attempt.ts -- --scene 1 --attempt 1 --clip work/<song>/attempts/scene-0001/grok-video-attempt-1.mp4 --image work/<song>/images/0001.png --post-url https://grok.com/imagine/post/<id>
curl -s -X POST http://127.0.0.1:3030/extract-frames -H 'content-type: application/json' -d '{"scene":1,"attempt":1}'
curl -s -X POST http://127.0.0.1:3030/approve -H 'content-type: application/json' -d '{"scene":1,"attempt":1,"score":8,"report":"accepted video"}'
bun run render -- --force
bun run scripts/wait-for-new-file.ts <folder> [--timeout <seconds>]
```

`bun run all` is useful for non-agent simple runs, but the preferred workflow uses project-local Pi subagents for planning, generation, critique, and editing. During still-image generation only, the selected still maker may queue up to 10 scenes at a time with 3 still attempts per scene. Video generation, critique retries, polish, render, remaster, and captions remain ordered and controlled by the agents.
