# Studio Workflow Orchestrator (Engineering Spec)

Date: 2026-01-12
Owner: Studio/AI Canvas
Status: Draft

## 1) Purpose
Define a deterministic, parallel workflow runner for StudioCanvas that interprets the canvas as a dependency graph and executes generator nodes only when all connected inputs are ready. This spec aligns input validation and payload construction with the API endpoints:
- Image generation: `src/app/api/ai-studio/generate/route.ts`
- Video generation: `src/app/api/ai-studio/generate-video/route.ts` (confirm exact path)

## 2) Scope
In scope:
- Graph construction and execution scheduling
- Readiness rules and edge-to-parameter mapping
- Concurrency control (max 3 in flight)
- Base64-first input/output handling
- Error propagation and blocked downstream behavior

Out of scope:
- UI polish and edge styling (handled separately)
- New API contracts or model changes
- Auto-run on canvas changes (explicit user-triggered runs only)

## 3) Source of truth
- Canvas nodes and edges in `useStudioStore`
- Node payload assembly via `buildNodePayload` and `buildDependencyGraph`
- Execution lifecycle via `executeWorkflow` (to be refactored into orchestrator)

## 4) Node types and roles
Toolbox nodes (from `DRAG_ITEMS` in `src/StudioCanvas/components/StudioCanvas.tsx`):
- `string` (Text Block) — Source node
- `image` (Image Reference) — Source node (preloaded base64)
- `video` (Video Reference) — Source node (preloaded base64)
- `nanoGen` (Image Generator) — Generator node
- `veoDirector` (Video Generator) — Generator node

### 4.1 Outputs (base64-first)
All outputs are stored as base64 + mimeType in memory/state, even for references:

```
TextOutput  = { type: "text", value: string }
ImageOutput = { type: "image", base64: string, mimeType: string }
VideoOutput = { type: "video", base64: string, mimeType: string }
```

Note: If the API returns a URL for video, we still prefer base64 storage; if base64 is not available, store URL + mimeType and mark output source.

## 5) Edge semantics: handle → payload mapping
Edges bind a source output to a target handle; these define payload fields.

### 5.1 Image generator (nanoGen) inputs
Required:
- `prompt` (text)

Optional:
- `ref-image` / `ref-images` (image list, max 14)

### 5.2 Video generator (veoDirector) inputs
Required:
- `prompt-in` (text)

Optional:
- `ref-images` (image list, max 3)
- `ref-video` (video, max 1)
- `first-frame` (image, max 1)
- `last-frame` (image, max 1)

## 6) Required vs optional rules
A generator node is **ready** if:
1) Required prompt is available (edge OR inline field).
2) Every connected optional edge has a populated output.
3) Node is not already running in this run.

Optional handles that are **not connected** are ignored.

## 7) Graph construction
Build a directed graph from nodes + edges:
- Vertex: node
- Edge: source → target, with `targetHandle` metadata

### 7.1 Cycle detection
Cycles are invalid. If detected:
- abort run
- surface error to user: "Cycle detected in workflow graph"

## 8) Execution lifecycle
### 8.1 Trigger
Workflow execution starts only from explicit user action (Run button).
No auto-run on edits.

### 8.2 Initialization
1) Snapshot current nodes/edges.
2) Build graph + validate edges.
3) Create `outputMap` for node outputs.
4) Populate outputs for source nodes immediately:
   - `string`: text output from data.value
   - `image`: image output from preloaded base64
   - `video`: video output from preloaded base64

### 8.3 Scheduler (parallel)
- Maintain queue of ready generator nodes.
- Concurrency limit: **3** in flight.
- Execute ready nodes in parallel, FIFO by ready time.

### 8.4 Completion
On success:
- Store output in `outputMap`.
- Mark node `completed`.
- Re-evaluate readiness of downstream nodes.

On failure:
- Mark node `failed`.
- Downstream nodes that depend on it remain blocked.

### 8.5 Termination
Stop when:
- No runnable nodes remain, and
- All in-flight executions are complete.

## 9) Payload construction
### 9.1 Image generation payload
Endpoint: `src/app/api/ai-studio/generate/route.ts`

Required:
- `prompt`

Optional:
- `reference_images` (max 14)

Mapping:
- `prompt` ← prompt edge text OR inline `positivePrompt`
- `reference_images` ← list of base64 images from `ref-image` and `ref-images` edges

### 9.2 Video generation payload
Endpoint: `src/app/api/ai-studio/generate-video/route.ts` (confirm)

Required:
- `prompt`

Optional:
- `reference_images` (max 3)
- `first_frame`
- `last_frame`
- `reference_video`

Mapping:
- `prompt` ← `prompt-in` edge text OR inline `prompt`
- `reference_images` ← list of base64 images from `ref-images` edges
- `first_frame` ← base64 image from `first-frame` edge
- `last_frame` ← base64 image from `last-frame` edge
- `reference_video` ← base64 video from `ref-video` edge

## 10) Validation alignment (current + target)
All validation layers should align to these caps:
- Image generator: max 14 reference images
- Video generator: max 3 reference images, max 1 ref-video/first-frame/last-frame

To enforce alignment:
- Canvas-level validation (`StudioCanvas.tsx`)
- Store-level validation (`useStudioStore.ts`)
- Per-node UI caps (`ImageGenBlock`, `VideoGenBlock`)

## 11) Execution state model
Each node tracks:
- `status`: idle | queued | running | completed | failed
- `output`: output object (if completed)
- `error`: error message (if failed)

Downstream nodes become **stale** if upstream nodes change, but **do not auto-run**.

## 12) Observability
- Log each execution start/end with node id + type + duration.
- Expose error details in node UI and event log.

## 13) Implementation outline
Suggested module structure:
- `src/StudioCanvas/utils/orchestrator.ts` (new)
  - `buildGraph`
  - `evaluateReadiness`
  - `runWorkflow`
- Refactor `executeWorkflow` to call orchestrator.

Pseudo flow:
1) Build graph
2) Initialize outputMap
3) Ready queue
4) Execute with concurrency=3
5) Save outputs and update node state

## 14) Edge cases
- Missing prompt → node never becomes ready
- Connected optional edge with missing output → node blocked
- Cycle detected → abort
- API failure → node failed, downstream blocked

## 15) Open items
- Confirm video endpoint path and response shape
- Confirm if video output must always be base64 or can remain URL
- Decide stale output UX (badge / warning) without auto-run
