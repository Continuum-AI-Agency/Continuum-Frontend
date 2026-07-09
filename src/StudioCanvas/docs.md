# StudioCanvas

React Flow-based visual workflow editor for AI generation pipelines.

## Node types

| Type | Data interface | Purpose |
|------|---------------|---------|
| `nanoGen` | `NanoGenNodeData` | Image generation (Gemini, GPT-Image-2, FLUX) |
| `veoDirector` | `VideoGenNodeData` | Video generation (Veo, Kling, Pixverse, Seedance) |
| `extendVideo` | `ExtendVideoNodeData` | Video extension |
| `videoEditor` | `VideoEditorNodeData` | Clip splice/trim |
| `string` | `StringNodeData` | Prompt text / LLM enrichment |
| `image` | `ImageNodeData` | Reference image upload |
| `video` | `VideoNodeData` | Reference video upload |
| `audio` | `AudioNodeData` | Reference audio upload |
| `document` | `DocumentNodeData` | PDF/text context |

## Execution model

`executeWorkflow` builds a dependency graph, runs nodes in topological order, and resolves each node's inputs from upstream outputs before calling `executeGeneration`.

Node outputs are stored in a local `resolvedOutputs` map (scoped to one workflow run) and written to the Zustand store via `updateNodeData` for UI updates.

### NodeOutput union

```ts
type NodeOutput =
  | { type: 'text'; value: string }
  | { type: 'image'; base64: string; mimeType: string; url?: string }
  | { type: 'images'; items: Array<{ base64: string; mimeType: string; url?: string }> }
  | { type: 'video'; url: string; posterBase64?: string }
```

`images` is produced when a nanoGen node runs with `variationCount > 1`. Downstream nodes select a specific item via the edge's `sourceHandle` (`'image'` → index 0, `'image-N'` → index N). See `resolveInputValue` in `buildNodePayload.ts`.

## Variation generation

`NanoGenNodeData.variationCount` is either `1` or `4`. When set to 4:

- **Backend**: `num_images: 4` is sent in the request. Gemini models make 4 parallel `generateContent` calls; Fal.ai models use the native `num_images` parameter.
- **SSE**: Multiple `image` events arrive; the frontend accumulates them into `imageAccumulator` in `useWorkflowExecution.ts`. On `complete`, if >1 image was received the output type is `images`; if exactly 1 it stays `image` (backward-compatible).
- **UI**: Quadrant grid layout. Handles for row 1 (indices 0–1) sit at `Position.Top`; handles for row 2 (indices 2–3) sit at `Position.Bottom`, each centered above/below its quadrant column.
- **Edge rerouting**: Switching from 4 → 1 remaps all edges on removed handles to handle `'image'` (index 0) via `handleVariationCountChange`.

### Handle ID convention

`variationHandleId(0)` → `'image'` (legacy, backward-compatible)
`variationHandleId(N)` → `'image-N'` for N ≥ 1

## Serialization and persistence

`workflowSerialization.ts` strips all base64/encoded data before saving to Supabase. This means:

- `generatedImage` (base64 or Blob) is always deleted on save.
- `generatedImages[].dataUrl` fields are stripped.
- `generatedImageUrl` and `generatedImages[].url` (cloud signed URLs) survive — but signed URLs expire, so images do not persist across long sessions.
- Reference images uploaded from disk (`image` field in `ImageNodeData`) are stripped entirely since they have no server-side URL.

This is intentional: storing multi-megabyte base64 blobs in Supabase JSONB is impractical. Persistent image display requires uploading reference images to object storage and using non-expiring URLs for generated outputs.
