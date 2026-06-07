# Visual storycraft guide

This guide gives the director a storycraft layer before Flux/WAN prompt writing. It is adapted for music-video planning, not prose drafting: the goal is a sequence of images that feels emotionally caused, memorable, and watchable rather than a disconnected lyric slideshow.

Use this together with `docs/PROMPTING.md`. Prompting rules still win for model-facing wording: Flux image prompts remain natural-language cinematic still-frame descriptions, WAN prompts remain present-tense motion paragraphs, and Flux does not use image negative prompts.

## Viewer reward channels

Before finalizing a plan, check how the video rewards the viewer through four channels:

1. **Transportation** — The viewer can enter the world. Time period, materials, geography, weather, and spatial relationships are coherent from scene to scene.
2. **Aesthetic** — The images are visually pleasurable and varied. Composition, shot scale, lighting, silhouette, color, and texture create a strong visual rhythm.
3. **Character / social simulation** — When people or creatures appear, their posture, action, gaze, distance, and relationship to objects imply inner life. The viewer can infer fear, resolve, temptation, grief, triumph, or awe without captions explaining it.
4. **Flow** — The scene sequence matches the song's energy. Quiet beats, crescendos, climaxes, and releases are reflected in camera distance, movement, density, and image intensity.

A scene can be beautiful and still fail if it breaks geography, repeats the same emotional beat, or gives the viewer no reason to care about the next image.

## Every scene must change something

Each planned scene should earn its place. For every scene, know at least one concrete change:

- emotional state changes: fear to resolve, numbness to anger, isolation to hope
- story situation changes: a path opens, a light fails, a barrier appears, a shore is reached
- relationship changes: a figure turns away, reaches out, follows, leads, protects, betrays
- visual knowledge changes: the viewer discovers a symbol, danger, destination, wound, clue, or contradiction
- musical energy changes: the image moves from stillness to motion, density to emptiness, dark to bright, close to wide

If nothing changes, combine the scene with a neighboring beat, make it a symbolic insert, or cut it.

## Causation over sequence

Avoid planning as `lyric image, then lyric image, then lyric image`. Adjacent scenes should connect through a visible relationship:

- **therefore**: the previous image causes this one
- **but**: this image complicates or contradicts the previous one
- **meanwhile**: this image reveals another part of the same situation
- **because**: this image explains why the previous beat mattered
- **afterward**: this image shows consequence, cost, or release

When revising one rejected scene, reread the last few scenes and ask: what did the viewer just see, and what should this scene do in response?

## Motif ledger and setup/payoff

Track a small set of recurring visual motifs in `director-plan.md`. A motif should return with development, not repeat unchanged forever.

Good motif ledger fields:

```md
## Motif Ledger
- Lantern: introduced as fragile hope in scene 2; nearly extinguished in scene 6; replaced by dawn light in the finale.
- Red scarf: identifies the man and gives WAN a cloth-motion element; becomes a small flag of resolve during the climax.
- Broken pier: initial ruin and obstacle; later echoed by a stronger path or open water.
```

Rules:

- Use only a few motifs per video, usually 2-5. Too many symbols become visual noise.
- Introduce motifs clearly before asking them to carry meaning.
- Pay off major motifs later through transformation, loss, reversal, or echo.
- Make motifs generatable: simple objects, colors, weather states, gestures, locations, or props work better than abstract concepts.
- Do not overload Flux prompts with every motif in every scene. Use the motif that matters for that beat.

## Camera distance as emotional distance

Plan shot scale deliberately. The viewer's emotional distance from the subject should change with the song.

| Distance | Use for | Typical shot choices |
| --- | --- | --- |
| Far / mythic | world, stakes, destination, aftermath | establishing shot, high-angle wide, tiny figure in landscape |
| Medium | choice, action, confrontation, travel | full-body, medium-wide, tracking composition |
| Close | emotion, identity, fear, resolve, grief | close-up, medium close-up, face/hands/torso |
| Insert | symbol, clue, touch, cost, transition | extreme close-up of object, hand, flame, wound, rope, map, water |

A full video made only of heroic medium shots feels flat. Mix establishing shots, action shots, close-ups, and inserts so the viewer feels expansion and contraction.

## Tension and release

Sustained intensity becomes numb. Let the image rhythm breathe:

- after a chaotic storm scene, use a quiet close-up or empty aftermath
- before a climax, compress into close details or stillness
- during a chorus/climax, widen the frame, intensify motion, or reveal scale
- after a victory or loss, show consequence rather than immediately escalating again

The visual plan should have an energy curve, not just a list of individually dramatic scenes.

## Prompt economy

Every major prompt detail should do more than one job. Prefer details that simultaneously support lyric meaning, composition, continuity, motion potential, worldbuilding, and later payoff.

Examples:

- A red scarf identifies the recurring man, adds color contrast, gives WAN cloth motion, and can become a resolve motif.
- An oil lantern grounds the pre-electric world, creates warm/cool lighting contrast, represents hope, and gives WAN flame motion.
- Wet stone steps establish location, catch reflections, show danger, and provide a path through the frame.

Avoid one-purpose clutter. If a prop, creature, building, or extra person does not serve the beat, remove it. A focused prompt usually generates better than a crowded prompt.

## Literal lyrics vs emotional translation

Do not illustrate every lyric literally. Choose the strongest visual relationship:

- **literal** when the lyric names a concrete action, object, creature, place, or body state that belongs in the concept
- **metaphoric** when the lyric names an emotion, vow, memory, or impossible image
- **consequential** when the lyric is about what the previous scene caused
- **contrastive** when the lyric says one thing but the story beat gains power by showing its cost or opposite

Only include dragons, monsters, crowds, weapons, crowns, or genre-specific objects when the lyric, story concept, or approved world bible explicitly calls for them.

## Director planning procedure

Before writing final prompts for a new or revised plan:

1. Identify whether the song is `general` or `character/story` mode.
2. Write the central visual question or emotional arc in one sentence.
3. Define the world bible and recurring subject bible.
4. Draft or update the motif ledger.
5. For each scene, record the scene's purpose: what changes, how it connects to the previous scene, the main viewer reward channel, and the intended shot distance.
6. Check the whole sequence for shot-scale variety, tension/release, setup/payoff, and repeated beats.
7. Only then write Flux `imagePrompt` values and WAN `videoPrompt` values under the normal prompting rules.

Recommended compact scene-note shape for `director-plan.md`:

```md
### Scene 07
- Lyrics / beat: ...
- Purpose / change: ...
- Connection: therefore / but / meanwhile / because / afterward ...
- Viewer reward focus: transportation / aesthetic / character / flow
- Shot distance: wide / medium / close / insert
- Motif use: introduced / developed / paid off / absent
```

## Revision diagnosis

When a critic rejects an image or video, classify the failure before rewriting:

1. **Storycraft failure** — the scene concept does not clearly express the lyric/story beat, repeats a prior beat, lacks emotional change, or has no reason to exist. Fix the scene idea, motif use, or shot choice.
2. **Prompt failure** — the scene idea is good but the Flux/WAN wording is unclear, overloaded, contradictory, uses weak spatial relationships, or fails to state continuity. Rewrite the prompt.
3. **Model failure** — the prompt is sound but the model produced anatomy errors, unwanted artifacts, drift, text, speckles, or object deformation. Keep the concept, adjust seed/constraints, or use targeted video negatives for WAN.

Do not respond to every rejection by adding more objects or more exclusions. Often the right fix is a simpler composition, clearer foreground/midground/background, a different shot distance, or a stronger causal link to the previous scene.

## Final self-check

Before reporting a director update, answer these silently and fix obvious problems:

- Does every scene change something?
- Could any two adjacent scenes be swapped without hurting the story? If yes, add causation or reconsider order.
- Are there clear setup/payoff relationships for the main motifs?
- Does the sequence vary wide, medium, close, and insert shots?
- Does the visual energy curve follow the song's structure?
- Are prompts economical, concrete, and layer-organized?
- Are continuity traits repeated exactly when recurring subjects appear?
- Are all timing constraints still satisfied?
