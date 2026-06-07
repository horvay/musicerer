# Grok Build compatibility

This directory exposes the project-local Pi music-video workflow to Grok Build.

## Agents

Specialized agent definitions are symlinked from `.pi/agents/` into `.grok/agents/` so Pi remains the source of truth:

- `music-video-orchestrator`
- `music-video-director`
- `music-video-critic`
- `music-video-clip-maker`
- `openai-maker`
- `grok-maker`
- `music-video-polish-editor`
- `music-video-editor`
- `music-video-remaster`
- `music-video-captioner`

When using Grok Build, treat these markdown files as the role contracts for specialized subagents. If Grok cannot spawn one directly by name, open the matching file and follow its instructions for that task.

## Skills

Project skills are symlinked from `.pi/skills/` into `.grok/skills/` using the Anthropic-style `SKILL.md` layout that Grok Build expects.

## MCP

The project MCP configuration is in `.mcp.json`. Run `grok inspect` from this repository root to verify Grok sees the skills, agents, and MCP servers.
