# AI Studio Gap Analysis (MVP vs. Flow PRD)

Last updated: 2025-11-25  
Author: Codex assistant

## Executive Summary
We shipped a canvas-first, toolbar-driven AI Studio that replaces the old card UI and removes mock data. The newest iteration now uses a full-viewport React Flow canvas with Prompt, Attachment, and Generator nodes; per-node generate triggers backend jobs and updates previews. The PRD still calls for a richer Flow-style builder (ports, validation, smart spawn, advanced controls). This document tracks what is done, what is missing, and the next steps.

**Current state (delta):**
- Full React Flow canvas; old prompt bar removed.
- Node types: Prompt, Attachment (image/video), Generator (Nano/Veo/Sora) with inline preview, status badge, per-node Generate.
- Library sidebar (right) supports upload/rename/delete/create-folder and drag-out; dragging creates Attachment nodes on canvas.
- Polling ties job updates back to generator nodes; previews update when artifacts arrive.

## Scope Reference
- **Sources:** PRD (Flow-based generative workspace), Google Labs Flow reference screenshot, Radix UI-first design requirements, Supabase storage integration requirements, testing mandate for generation permutations.
- **Current Surface:** `src/app/(post-auth)/ai-studio/AIStudioClient.tsx`, `src/components/ai-studio/LibraryStrip.tsx`, API routes in `src/app/api/ai-studio/*`, schemas in `src/lib/schemas/aiStudio.ts`, storage primitives in `src/lib/creative-assets/*`, tests in `tests/ai-studio/*`.

## What’s Implemented Now
- Full React Flow canvas (entire viewport); old prompt bar removed.
- Node types: Prompt, Attachment (image/video), Generator (Nano/Veo/Sora) with inline preview, status badge, per-node Generate.
- Drag from library creates Attachment nodes; per-node generate triggers backend jobs and updates node artifacts via polling.
- Library sidebar (right) supports upload, rename, delete, create-folder; drag payload includes signed/public URL.
- Error logging improved in `/api/ai-studio/generate`; aspect ratio validation remains in schemas.

## Gaps vs. PRD (Detailed)
### Core Interaction Model
- Ports/typed edges missing. Nodes render and run but data isn’t flowing via connections; no port validation/type checking yet.
- Smart spawn / dependency chains absent (no auto-added prompt/ghost nodes for model requirements).

### UI Layers & Chrome
- Minimap/controls present via React Flow, but **context menu** (Add/Reset) still missing.
- Hover-driven selectors/model tags on nodes still TBD (current node shows provider/medium badges only).

### Asset Library
- Placement upgraded: right-side floating drawer with upload/rename/delete/create-folder + drag-out.
- Still needed: move between folders, infinite scroll/virtualization for large folders; ensure signed URL/public URL coverage for private buckets.

### Attachments & Frames
- Generator nodes show ref/first/last tags and previews, but:
  - No dedicated frame picker dialog; relies on attaching assets manually.
  - No multi-ref ordering or max-ref enforcement per model.

### Generation Controls
- No contextual menu/advanced popover on nodes yet (negative prompt, seed/guidance, temp/top-k future).
- Model/aspect validation per provider not enforced in-node (only defaults).

### Canvas Experience & Feedback
- Node-level status badge exists, but no progress bar/edge glow or streaming preview.
- No undo/redo, duplicate, or smart “Add node here” context actions.

### Sidebar / Navigation
- **Global sidebar cleanup** requested (Dashboard, Organic Content, Creative Studio, Paid Media only). Current code doesn’t touch the app shell; sidebar clutter may persist.

### Testing
- **Unit coverage gaps**: No tests for toolbar behaviors, attachment handler logic, library attach flows, or polling resilience.
- **Runner failing** locally because `tsconfig-paths/esm` dependency is missing (node --test config). Tests aren’t executed in CI until that is fixed.

### Performance & Accessibility
- **Next/Image** optimization disabled (eslint suppression); could hurt LCP for large previews.
- **Keyboard navigation** for toolbar/library not verified; no shortcuts for mode switching, attach, or generate.
- **Pan/zoom performance** unknown (not implemented yet).

### Backend Contract
- **Metadata passthrough**: Frontend sends attachment paths via `metadata`, but backend schema/consumers aren’t documented here; risk of drift.
- **Storage paths**: No distinction for public/private paths or brand folder scoping beyond default root.

## Quick Wins (High-Impact, Low-Risk)
1) **Fix test runner deps**: add `tsconfig-paths` dev dep; wire CI to run `tests/ai-studio/*`.
2) **Ports + validation**: Add typed handles on nodes; block Generate when prompt/aspect missing; basic compatibility highlighting.
3) **Context menu + advanced popover**: Duplicate/delete, plus advanced inputs (negative prompt, seed/guidance, temp/top-k placeholder).
4) **Library move + virtualization**: Enable move between folders; virtualize grid for large buckets; keep signed/public URL resolution.
5) **Progress UI**: Add node-level progress bar/glow and completion/failure toasts; optional streaming placeholder.

## Next Chunk (Medium Effort)
- Implement **typed edges**: prompt → generator, attachment → generator (ref/first/last) with compatibility highlights and ghost inputs.
- Add **inline First/Last frame chooser** dialog for video generators and enforce ref limits per model.
- Add **model/aspect validation UI** on generator node (chips for allowed ratios).
- Add **undo/redo + duplicate node** via context menu; optional grid snapping.

## Strategic Work (Larger Scope)
- Build **Flow canvas** with React Flow (@xyflow/react): pan/zoom viewport, node components using Radix (Toolbar/Popover/Collapsible), ports with type-aware validation, ghost nodes for frame inputs, smart spawn for Nano/Veo/Sora nodes.
- **Connection logic**: Type matching + toast on mismatch; auto-run switch; edge animations.
- **Streaming**: Prepare hook for SSE/token stream; keep streamed text local state until completion commit.
- **Undo/redo & layout save**: introduce Zustand store with history middleware; optional layout persistence per brand.

## Risks & Assumptions
- Storage ACLs may block public previews; need signed URL strategy and CORS for drag-out.
- Backend metadata schema for attachments must be finalized to avoid silent drops.
- React Flow integration can increase bundle size; should lazy-load the editor shell.
- Streaming could require backend SSE/WebSocket; current API is polling-only.

## Test Plan Additions
- Form: provider/medium switch auto-adjusts aspect ratios; duration preset applies only to video.
- Attachments: upload vs. library attach for ref/first/last; failure surfaces toast; badges reflect state.
- Library: folder navigation, upload, rename/delete/move (once implemented), drag-to-canvas event emits correct kind.
- Polling: pending job transitions, abort on unmount, jitter handling for failures.
- Canvas: drag/drop image seeds sets correct attachment kind order (first → last → ref).

## Tracking & Ownership
- **Owner:** Frontend Feature Team (AI Studio)
- **Related files:** `src/app/(post-auth)/ai-studio/*`, `src/components/ai-studio/LibraryStrip.tsx`, `src/lib/creative-assets/*`, `src/lib/ai-studio/*`, `tests/ai-studio/*`
- **Open dependency:** Install `tsconfig-paths` for node --test; align backend metadata contract for attachments/frames.
