# Grok Build Music Video Agents

Use the root `AGENTS.md` as the primary workflow contract.

Specialized project agents live in `.grok/agents/` and are symlinked from `.pi/agents/` so Pi and Grok Build share one source of truth. Use them for matching tasks:

- `music-video-orchestrator`: multi-role workflow sequencing
- `music-video-director`: plans, prompt revisions, continuity, quality gates
- `music-video-critic`: still/video/thumbnail review and approval decisions
- `music-video-clip-maker`: local Flux/WAN generation
- `openai-maker`: ChatGPT/OpenAI web stills and thumbnails via Playwright MCP
- `grok-maker`: Grok Imagine web image-to-video via Playwright MCP
- `music-video-polish-editor`: scene-level FFmpeg polish/conform
- `music-video-editor`: timeline assembly, final render, audio normalization, thumbnail intro edits
- `music-video-remaster`: full-video finishing before captions
- `music-video-captioner`: captions/subtitles/burn-in

Project skills live in `.grok/skills/` and mirror `.pi/skills/`.

Use `.mcp.json` for MCP server discovery. In this project, Playwright MCP is needed for `openai-maker` and `grok-maker` web workflows.
