# Music Video Workflow

This context describes the project-local workflow for turning songs into AI-generated music videos with scene-level generation, review, post-production, and final rendering.

## Language

**Approved clip**:
A scene video that has passed critic review and is represented by `scene.clip`, normally stored under `work/<song>/clips/`. It is the curated render source and may be replaced by a later polish pass while raw generation attempts remain preserved.
_Avoid_: final clip, good clip

**Raw video attempt**:
An original generated scene video stored under `work/<song>/attempts/scene-000N/attempt-M.mp4`. It is retained as fallback evidence and should not be overwritten by post-production edits.
_Avoid_: source of truth clip, approved copy

**Polish pass**:
A post-approval, per-clip FFmpeg editing step that enhances drama or hides fixable visual problems while preserving the scene’s intended subject and timing. It operates after all scene videos are approved and before final render.
_Avoid_: generation retry, critique pass, final assembly

**Polish attempt**:
A draft FFmpeg edit created during a polish pass and stored under `work/<song>/polish-attempts/scene-000N/`. A polish attempt is promoted only if extracted frames show the edit improved the approved clip without damaging the story-relevant content.
_Avoid_: generated attempt, LTX attempt

**Editorial-delta review**:
The self-check used by the polish pass to judge whether its edit improved the approved clip. It evaluates the change introduced by FFmpeg, not whether the clip should have passed the original critic review.
_Avoid_: full critique, prompt compliance review

**Polish outcome**:
The result category for a polish pass: `polished`, `unchanged-no-edit-needed`, `unchanged-not-fixable`, or `unchanged-attempts-rejected`. An unchanged outcome is successful workflow progress, not a failure.
_Avoid_: pass/fail only, render failure

## Example dialogue

Developer: “Scene 4 has an approved clip, but there is a second ship on the right edge.”
Domain expert: “That is a polish pass candidate. Keep the raw video attempt unchanged, create polish attempts, crop or reframe based on extracted frames, and only replace the approved clip if the new frames preserve the main ship and look better.”

Developer: “Should the critic re-score the whole clip?”
Domain expert: “No. The polish agent performs an editorial-delta review: did the crop, zoom, grade, or retime improve the approved clip without introducing new damage?”
