# Prompting guide

This project now uses Flux for still images and WAN 2.2 for image-to-video.

## Prompt fields

- **Flux Klein image prompt**: `imagePrompt`, wired to `6.inputs.text` in `flux_klein.json`.
- **WAN video prompt**: `videoPrompt`, wired to `129:93.inputs.text` in `video_wan2_2_14B_i2v_default_remix_gguf_4step_lora_eulera_landscape.json`.
- **Video negative prompt**: `videoNegativePrompt`, wired to `129:89.inputs.text` for WAN video.

Flux image generation does **not** use image negative prompts in this project. Do not create or rely on `imageNegativePrompt`.

## Workflow responsibility

- The director writes/revises Flux image prompts and WAN video prompts.
- The clip-maker generates exactly one requested image or video attempt and does not judge quality.
- The critic inspects the generated asset, scores it, and writes detailed retry guidance when below threshold.
- Generate and approve all Flux still images first, scene by scene in order. Image attempts are judged primarily by how well they illustrate the scene lyrics/story beat; `imagePrompt` is guidance, not a strict checklist. Images require `9+` approval unless the 30-attempt cap selects the best available attempt.
- After every scene has an approved still image, generate WAN video attempts scene by scene in order from those approved stills. Video attempts require `8+` approval.

## Flux Klein image prompt best practices

Flux Klein follows natural language better than old tag-based image models. Write a clear cinematic paragraph or two that describes one exact frame. For Harbor still images, do **not** specify style in the prompt; the ComfyUI workflow supplies style separately. Focus the prompt on a prose explanation of the scene, the story beat, the subject, the setting, and the recurring man's exact identity whenever he appears.

Use this structure:

```text
Describe the image as a cinematic still frame. State the subject and action. State the camera angle and shot scale. Describe the foreground, midground, and background. Describe the era/materials and any absence constraints. Describe the lighting, weather, mood, color palette, and composition.
```

Rules:

- Use natural language. Do not use comma-tag soup. Do not include style directives in Harbor image prompts.
- Do not use old quality tags such as `masterpiece`, `best quality`, `absurdres`, `1man`, `solo`, `1girl`, or model-specific score/source tags.
- Do not use parenthesis weighting like `((lantern))`; Flux does not use that weighting syntax here.
- Because this Flux Klein workflow has no meaningful image negative prompt, put essential constraints in positive visual language. Prefer `a deserted empty frame`, `blank unmarked surfaces`, or `period-accurate hand-built materials` over long `no ...` lists.
- If Flux keeps adding an unwanted object, stop naming the unwanted object repeatedly. Ask what should visually replace it, then describe that replacement in detail. Example: instead of repeating `no intact boats, no sails, no flags`, describe `black tidal water filled only with splintered pier beams, exposed low wooden ribs, loose planks, torn canvas scraps, frayed rope, seaweed, cork floats, and rusted iron rings`.
- Avoid huge lists of exclusions. Prefer affirmative era/material constraints: `The world is old pre-electric maritime fantasy, built from wet stone, dark wood, brass, rope, canvas, candles, and oil lamps only.`
- Organize prompts by visual layers. Define the foreground first, then midground, then background; do not tack important constraints onto the end in a disorganized list.
- Be explicit about spatial relationships: `A collapsed pier fills the lower foreground; behind it, a flooded quay runs diagonally toward shuttered warehouses; far beyond, a narrow harbor mouth opens to white surf.`
- Be explicit about camera and composition: `high-angle establishing shot`, `low wide shot near the water`, `medium close-up`, `extreme close-up insert`, `rule-of-thirds composition`, `the subject stands left of center`.
- For empty scenes, say exactly what occupies the frame and that it is empty of people.
- For recurring characters, repeat the concrete identity every time: gender presentation, age range, build, face, exact hair length/style/color, facial hair, clothing, and key props.
- Use one central foreground figure unless the scene explicitly requires an environment-only or object-detail shot.
- Do not use invented character names inside actual generation prompts. Use `the man`, `the girl`, or `the woman` plus concrete visual descriptors.
- Keep prompts focused. Flux can follow detail well, but too many competing objects can dilute the composition.

## Harbor continuity

For Harbor, keep this world consistent unless the user changes it:

- Style is supplied by `flux_klein.json`; do not repeat style terms in image prompts.
- Old pre-electric / 19th-century-inspired maritime fantasy.
- Wet stone quays, dark hand-built wood, brass mechanisms, rope, canvas, salt-stained glass, candles, and oil lamps.
- No modern machines, electric lights, neon, asphalt roads, road markings, power lines, plastic, modern clothing, or modern signage visible.
- Recurring man when present: heroic young man with masculine presentation, muscular build, short dark wavy hair, short dark beard, navy blue raincoat, faded red scarf, off-white shirt, dark trousers, black boots.

## WAN video prompt best practices

WAN prompts describe motion over time from the approved still image. Use one flowing present-tense cinematic paragraph. Current WAN generation uses the Remix GGUF high/low models with 4-step LightX2V LoRAs, `euler_ancestral`, split step `2`, CFG `1`, and `832x480` landscape output before editorial conforming.

Include:

- camera movement: slow push-in, drift, pan, tilt, handheld sway, tracking shot
- environmental motion: rain, fog, waves, lantern flame, cloth, hair, ropes, clouds, reflected light
- character/object action: what changes visibly over the clip
- emotional beat: dread, resolve, hope, grief, awe

Avoid turning WAN prompts into still-image descriptions. Recap identity only enough to keep continuity. For Trinket, explicitly prevent confident walking, high-tail curiosity, humanoid limbs, visible human faces, text, watermarks, white speckles, and mosaic/block breakup when relevant.

## Director / critic retry loop

When an image fails:

1. The critic writes a detailed report: exact lyrics/story beat, score, retry-level failures, minor imperfections, and next prompt guidance.
2. The director revises the Flux natural-language `imagePrompt` using the critic report.
3. The clip-maker generates one new Flux image attempt.
4. The critic reviews again.

If the layout is fundamentally wrong, change/remove `imageSeed` for a fresh composition. If the image is close, the director may keep the seed and make targeted natural-language revisions.

After 30 image attempts for one scene, stop retrying. Select the highest-scored attempt for that scene, approve/select it with its actual score and report, and move forward to keep the overall video progressing.

## Examples

Good Flux image prompt:

```text
A cinematic high-angle establishing still of a deserted ruined harbor town at gray dawn. The lower foreground is dominated by a violently collapsed wooden pier: jagged snapped planks, broken support beams, frayed rope, rusted iron rings, torn beige canvas scraps, folded fishing nets, seaweed, ash, and cork floats wrapped in rope. The flooded midground contains black tidal water, a crooked wet stone quay, empty mooring posts, exposed low wooden ribs, loose planks, and broken mast-like timbers lying flat in the water. On both sides, the waterfront town is uninhabitable: soot-black warehouse shells, caved-in roofs, charred beams, shuttered dark windows, sagging balconies, and flooded stone steps. Far in the background, a small separate round stone beacon tower stands on jagged wet rocks at the harbor mouth, with one tiny amber oil flame visible through its glass. The world is old pre-electric maritime fantasy made only of wet stone, dark wood, brass, rope, canvas, cork, iron, candles, and oil lamps. Cold blue-gray rain haze and storm clouds fill the scene, while the single tiny amber beacon and one small foreground oil lantern create fragile hope in the ruin.
```

Bad Flux image prompt:

```text
masterpiece, best quality, 1man, solo, harbor, no cars, no text, ((lantern)), dramatic lighting, highres
```

Why it fails: it is old tag-model syntax, relies on unsupported weighting and negative prompting habits, and does not describe one precise cinematic frame.

## References used for Flux prompting

- ComfyUI Flux.1 Text-to-Image docs: Flux has strong prompt following; Flux Klein is designed for fast 4-step generation; official examples state negative prompts are not needed for Flux.
- Flux prompting community guidance: natural language prompts generally work better than old tag strings; explicit subject/background/style/camera relationships improve control; Flux Klein does not meaningfully support native negative prompts, so constraints should be phrased in the positive prompt.
