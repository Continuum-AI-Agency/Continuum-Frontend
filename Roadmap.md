# Roadmap

Plans and forward-looking work tracked here. Each entry links to a plan file.

## AI Studio

### Conversational Canvas Agent
- **Status:** Approved plan, not started
- **Plan file:** [how-would-you-best-stateless-sky.md](/Users/duane/.claude/plans/how-would-you-best-stateless-sky.md)
- **Summary:** Bottom-dock conversational agent that builds and edits AI Studio canvas workflows from natural language. Custom SSE (no Vercel AI SDK), JSON-patch ops with symbolic IDs, compressed snapshot format, one undo snapshot per turn. Compose-only in v1 (no workflow execution).
- **Token budget:** ~500 tokens/turn system prompt, ~600 bytes per typical op batch.
- **Mount:** Bottom dock beneath canvas in `src/app/(post-auth)/ai-studio/`.
- **New surface area:** `src/lib/ai-studio/agent/*`, `src/components/ai-studio/agent/*`, `src/app/api/ai-studio/agent/route.ts`.
- **Build phases:** (1) protocol + snapshot, (2) validation + layout, (3) store extensions, (4) backend route, (5) client mutation engine, (6) hook + UI, (7) mount + polish, (8) Codex TDD audit.
