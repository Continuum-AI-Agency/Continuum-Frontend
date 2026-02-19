# AI Studio Canvas V1.2 Node and Edge Spec

## Scope
V1.2 applies to the live AI Studio canvas rendered by `src/StudioCanvas/components/StudioCanvas.tsx`.

This version standardizes the canvas shell on `ai-elements` primitives:
- `src/components/ai-elements/canvas.tsx`
- `src/components/ai-elements/controls.tsx`
- `src/components/ai-elements/panel.tsx`
- `src/components/ai-elements/edge.tsx`

## V1.2 Changes
- Replaced left node sidebar with canvas-first context menu actions.
- Context menu now drives node creation and view controls.
- Canvas rendering moved to `ai-elements` `Canvas` and `Controls` wrappers.
- Data-type edges use the shared `ai-elements` edge implementation (`Edge.DataType`).
- Image reference media renders cleaner: no inner wrapper chrome, aspect ratio preserved with `object-contain`.
- Generation previews also preserve aspect ratio (`object-contain`) instead of cropping.
- Generator/extension node toolbars now use `ai-elements` `Toolbar` and only appear on active/hover, floating above the node.
- Reference nodes (image/audio/document/video) follow the same clean media-first visual treatment as Campaign `CreativeNode`.
- Generator nodes now render as preview-first cards with a compact descriptor chip floating below the node.
- Remaining utility nodes (`string`, `nanoGen` legacy, `extendVideo`) now share the same low-chrome visual language and iconography (no emoji icons).

## Live Node Types

### `string`
Purpose: prompt, negative prompt, enrichment instructions.

Source handles:
- `text`

Target handles:
- `image`
- `audio`
- `video`
- `document`

### `image`
Purpose: image reference input.

Source handles:
- `image`

### `audio`
Purpose: audio reference input.

Source handles:
- `audio`

### `document`
Purpose: document context input.

Source handles:
- `document`

### `video`
Purpose: video reference input.

Source handles:
- `video`

### `nanoGen`
Purpose: image generation block.

Target handles:
- `prompt`
- `ref-image`

Source handles:
- `image`

### `veoDirector`
Purpose: Veo 3.1 video generation.

Target handles:
- `prompt-in`
- `negative`
- `ref-images`

Source handles:
- `video`

### `veoFast`
Purpose: Veo 3.1 Fast video generation.

Target handles:
- `prompt-in`
- `negative`
- `first-frame`
- `last-frame`

Source handles:
- `video`

### `extendVideo`
Purpose: extend an existing video with prompt guidance.

Target handles:
- `prompt`
- `video`

Source handles:
- `video`

## Connection Validation
Validation source of truth remains:
- `src/StudioCanvas/utils/isValidConnection.ts`

Rules preserved in V1.2:
- Type-safe source/target handle matching.
- Single-connection constraints for text-like handles.
- Reference limits (for example `nanoGen` ref image capacity).
- Frame-only constraints for Veo Fast (`first-frame`, `last-frame`).

## Edge Model
Edge rendering in V1.2:
- Edge component: `Edge.DataType` from `src/components/ai-elements/edge.tsx`
- Edge class: `studio-edge`
- Data payload: `{ dataType, isActive, isDotted, pathType }`

Supported data types:
- `text`
- `image`
- `video`
- `audio`
- `document`

Token source:
- `src/components/ai-studio/canvas/canvas.css`
- `src/app/globals.css`

## Canvas Interaction Model
Workspace actions are context-menu first (`src/components/ui/context-menu.tsx`):
- Add node (all supported node types)
- Switch interaction mode (pan/select)
- Zoom in/out
- Fit view
- Clear canvas

Drag-create remains supported:
- Connection drag from a handle to empty pane creates a compatible node via `useEdgeDropNode`.

Drop ingestion remains supported:
- Node payload drops via `application/reactflow`
- Asset drops via creative asset payload and text/data fallback

## Reference Media Rendering Rules
V1.2 reference media rules:
- Preserve source aspect ratio.
- Avoid extra inner cards/wrappers around the media plane.
- Render image references with `object-contain`.
- Keep replace affordance minimal and non-blocking.

Relevant files:
- `src/StudioCanvas/nodes/ImageNode.tsx`
- `src/StudioCanvas/nodes/ImageGenBlock.tsx`

## Runtime/Reactivity
Realtime and execution semantics are unchanged by V1.2:
- Realtime sync: `src/components/ai-studio/hooks/useCanvasRealtime.ts`
- Merge strategy: `src/components/ai-studio/hooks/merge-strategy.ts`
- Workflow execution: `src/StudioCanvas/utils/executeWorkflow.ts`

## Follow-ups
Potential V1.3 items:
- Add node-level context actions to match workspace menu polish.
- Unify remaining node cards on shared `ai-elements/node.tsx` composition primitives.
- Introduce run-id/timestamp merge freshness for long-running concurrent sessions.
