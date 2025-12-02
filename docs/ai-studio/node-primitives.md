# AI Studio Node Primitives Guide
Version: Draft • Date: 2025-11-27

This document defines the core node types for the Flow-based creative workspace, their inputs/outputs, validation rules, and advanced options. It is intended to keep the editor, backend payloads, and UX in sync as we add more models and capabilities.

## Common Concepts
- **Ports:** Typed connection points. We support `text`, `image`, `video`, `aspect`, and `control` (booleans/numbers) types. Connections must match type; otherwise the edge is blocked and a toast should warn the user.
- **Context Menu:** Every node exposes Duplicate, Delete, and “Advanced” (collapsible) settings. Advanced values are optional and must not be sent if empty.
- **Attachments:** Assets from the library or uploads. For Nano Banana, treat attachment as a “reference image”; for video models, attachments can map to `first_frame` or `last_frame`.
- **Validation:** Nodes with missing required fields display a red badge and block Generate. Required fields are called out per node below.

## Node Types

### 1) Prompt Node
- Purpose: Reusable text source.
- Inputs: none
- Outputs: `text`
- Required fields: `prompt` (non-empty)
- Advanced: none
- UI: Textarea

### 2) Attachment Node
- Purpose: Represent a single asset dropped from library/upload.
- Inputs: none
- Outputs: `image` or `video` (typed from MIME)
- Required fields: `asset.path`
- Advanced: none
- UI: Thumbnail/preview, label

### 3) Aspect Node
- Purpose: Provide a validated aspect ratio.
- Inputs: none
- Outputs: `aspect`
- Required fields: `aspect_ratio` (selected from allowed list)
- Advanced: none
- UI: Chip group of allowed ratios; list determined by downstream model if connected, otherwise full union.

### 4) Image Generator (Nano Banana / Gemini Image)
- Purpose: Generate an image from prompt + optional refs.
- Inputs:
  - `text` (prompt) – required
  - `image` (reference) – optional (<=3 Flash; <=14 Pro)
  - `aspect` – optional (defaults to model-specific)
- Outputs: `image`
- Required fields: prompt, provider, aspect_ratio (must be in allowed set)
- Model options: `nano-banana` (Gemini 2.5 Flash Image), `nano-banana-pro` (Gemini 3 Pro Image preview)
- Basic settings: model select, aspect ratio, preview of refs.
- Advanced: negative_prompt, seed, guidance_scale, image_size (1K/2K/4K where supported), response_modalities (Image / Image+Text).
- Validation: Enforce ref count limits; aspect must be in allowed list.

### 5) Video Generator (Veo 3.1 / Sora 2)
- Purpose: Generate video from prompt with optional frame conditioning.
- Inputs:
  - `text` (prompt) – required
  - `image` (first_frame) – optional
  - `image` (last_frame) – optional
  - `aspect` – optional (provider-validated)
- Outputs: `video`
- Required fields: prompt, provider, aspect_ratio
- Model options: `veo-3-1`, `sora-2`
- Basic settings: model select, aspect ratio, duration preset (short/long), first/last frame slots.
- Advanced: negative_prompt, seed, guidance_scale, future: temperature/top-k if backend exposes.
- Validation: Only allow first/last frame inputs of type `image`; aspect must be in allowed list per provider.

### 6) Control / Settings Node (future)
- Purpose: Shared advanced parameters for downstream nodes.
- Inputs: none
- Outputs: `control` (object: {seed, guidance, temp, top_k})
- Used to feed multiple generators for consistent settings.

## Allowed Aspect Ratios (current)
- Nano Banana (image): 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
- Veo 3.1 (video): 16:9, 9:16
- Sora 2 (video): 16:9, 9:16, 1:1

## Mapping to Backend Payloads
- Image Generator → `createAiStudioJob` payload:
  - provider: nano-banana / nano-banana-pro
  - medium: image
  - prompt: prompt input
  - aspect_ratio: aspect input or default
  - metadata: referenceAssetPath[] (first ref), future: array
  - advanced: negativePrompt/seed/guidanceScale/image_size/response_modalities (only send if supported)
- Video Generator → payload:
  - provider: veo-3-1 / sora-2
  - medium: video
  - prompt, aspect_ratio, durationSeconds (derived from preset), metadata: firstFramePath, lastFramePath
  - advanced: negativePrompt/seed/guidanceScale (when backend accepts)

## UX Behavior Checklist
- Right-click (or long-press) opens context menu with Duplicate/Delete/Advanced.
- Missing required inputs → red badge + Generate disabled; tooltip explains what is missing.
- Dragging an Attachment onto a Generator highlights valid drop (ref or first/last frame) and auto-binds when dropped.
- When a node completes, show success toast and freeze the preview; allow “Regenerate” in context menu.
- Undo/redo: queued for implementation via React Flow or zustand history.

## Open Items (to implement)
- Port types and validation with visual highlights.
- Frame picker dialog for video nodes with attach/upload.
- Model switching + allowed aspects enforcement inline.
- Move assets between folders in library; virtualize large folders.
- Node-level progress bar / streaming state.
