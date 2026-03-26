# Organic Planner <> AI Studio Content Persistence (MVP)

## Goal

Create a clean one-draft-at-a-time workflow from Organic Planner to AI Studio and back, with server-first asset persistence and deterministic apply-back behavior.

## Decisions Locked

- One draft at a time from Planner to AI Studio.
- AI Studio opens only when the user explicitly clicks a Planner action.
- Reels return video output.
- Carousel node count uses the authoritative count from the draft content definition.
- Assets are persisted server-side first, then URL is the primary stored reference.
- Apply-back overwrites content-owned fields on the draft.
- Apply-back is blocked entirely if any required persistence step fails.
- After successful apply-back, route user back to Planner and focus the updated draft.
- Planner owns scheduling fields (day, time, platform, account).
- LinkedIn MVP generation is single-image output.
- LinkedIn can accept up to 5 uploaded reference images as inputs.
- Keep in-session version history for apply operations.
- LinkedIn carousel-style sources require explicit user pick of one output when applying in MVP.

## Scope (MVP)

- Instagram post, Instagram reel, Instagram carousel, LinkedIn post.
- Planner to AI Studio handoff with creative context and optional seed media.
- AI Studio generation and iterative edits.
- Apply updated output/content back to the same Planner draft id.
- Persist generated media to server storage before Planner update.

## Out Of Scope (MVP)

- Multi-draft batch handoff to AI Studio.
- Cross-session full version graph beyond session history.
- Final publishing pipeline redesign.
- LinkedIn multi-image generated output workflow.

## User Flow

1. User selects a draft in Planner.
2. User clicks `Open in AI Studio`.
3. Planner creates handoff payload and opens AI Studio canvas with `draftId` context.
4. AI Studio hydrates default workflow by post type.
5. User edits prompts/nodes and runs generation.
6. User clicks `Apply Back to Planner`.
7. AI Studio persists outputs server-side.
8. If all persistence succeeds, AI Studio submits an apply patch.
9. Planner overwrites content-owned fields on the same draft id.
10. User is routed back to Planner and focused on that draft.

## Workflow Mapping Rules

### Workflow Concept Contract (Pre-Made Templates)

- `ig_post_single_image`
- `ig_reel_single_video`
- `ig_carousel_multi_image`
- `li_post_single_image`

### Concept -> Behavior Table

- `ig_post_single_image`: output kind `image`, mode `single`, default model `nano-banana-2`, max refs `14`, explicit pick `false`.
- `ig_reel_single_video`: output kind `video`, mode `single`, default model `veo-3.1-fast`, max refs `14`, explicit pick `false`.
- `ig_carousel_multi_image`: output kind `image`, mode `ordered`, default model `nano-banana-2`, max refs `14`, explicit pick `false`.
- `li_post_single_image`: output kind `image`, mode `single`, default model `nano-banana-2`, max refs `5`, explicit pick `true` when multi-output candidates exist.

### Platform/Post Type -> Concept

- Instagram + post => `ig_post_single_image`
- Instagram + reel => `ig_reel_single_video`
- Instagram + carousel => `ig_carousel_multi_image`
- LinkedIn + any post type in MVP => `li_post_single_image`

### Instagram Post

- Default graph: `StringNode -> ImageGenNode`.
- If seed image exists: include `ImageReferenceNode -> ImageGenNode(ref-image)`.
- Apply output: single image asset.

### Instagram Reel

- Default graph: `StringNode -> VideoGenNode(model=veo-3.1-fast)`.
- If seed image exists: map to first frame/reference input for Veo Fast path.
- Apply output: single video asset.

### Instagram Carousel

- Authoritative slide count: from draft content count.
- Default graph: one strategy text node plus `N` image generator nodes.
- Each slide node uses slide-specific prompt if available, else fallback prompt template with index.
- Apply output: ordered `assets[]` with explicit `slideIndex`.

### LinkedIn Post (MVP)

- Generation output remains single image.
- Up to 5 image reference inputs allowed.
- If source draft context implies multiple candidates, user must choose one before apply.

## Data Contracts

### Planner -> AI Studio Handoff (`planner_ai_handoff_v1`)

- `draftId: string`
- `brandProfileId: string`
- `weekStartId: string`
- `platform: "instagram" | "linkedin"`
- `postType: "post" | "reel" | "carousel"`
- `workflowConcept?: "ig_post_single_image" | "ig_reel_single_video" | "ig_carousel_multi_image" | "li_post_single_image"`
- `format: string`
- `authoritativeCount?: number`
- `title: string`
- `summary: string`
- `captionPreview: string`
- `creativeDirectionPrompt?: string`
- `thumbnailPrompt?: string`
- `seedTrendId?: string`
- `mediaSuggestion?: { assetUrl?: string; assetBase64?: string; generationContext?: object }`
- `assetHints?: Array<{ role: string; suggestion: string }>`
- `updatedAt: string`

### AI Studio -> Planner Apply (`planner_ai_apply_v1`)

- `draftId: string`
- `brandProfileId: string`
- `postType: "post" | "reel" | "carousel"`
- `overwrite: true`
- `contentPatch: { title?, summary?, captionPreview?, creativeDirectionPrompt?, thumbnailPrompt?, creativeIdea? }`
- `assets: Array<{ role: string; kind: "image" | "video"; slideIndex?: number; storageUrl: string; mimeType?: string; width?: number; height?: number; generationContext?: object }>`
- `selection?: { required: boolean; selectedAssetRole?: string }`

## Persistence Model

### Server-First Asset Save

1. AI Studio captures node outputs.
2. Each output is uploaded/saved to server storage.
3. Apply operation receives normalized persisted URLs.
4. Planner stores URLs as source of truth.
5. Base64 can be used only as temporary preview cache.

### Draft Asset Shape (Planner Store)

- Add draft-level `publishingAssets` as ordered media output for posting.
- Keep backward-compatible `mediaSuggestion` for legacy preview and migration period.
- For carousel, require stable ordering with `slideIndex`.

## Apply-Back Semantics

### Overwrite Rules

- Always overwrite content-owned fields from `contentPatch`.
- Replace previous generated assets with new `assets[]` for the draft.
- Do not modify Planner-owned scheduling fields.

### Blocking Rules

- If any required asset fails persistence, apply is blocked.
- User sees retry state with actionable error.
- No partial apply in MVP.

### LinkedIn Selection Rule

- If multiple valid outputs exist in LinkedIn flow, require explicit user pick before apply.
- `Apply Back` remains disabled until one output is selected.

## Return Navigation

- On success, route to Planner tab and focus updated draft.
- Suggested route params: `tab=planner`, `draftId`, optional `weekStartId`, optional `from=ai-studio`.

## In-Session Version History

- Keep session-local apply revisions keyed by `draftId`.
- Each revision stores timestamp, pre-apply snapshot, post-apply snapshot, and applied assets metadata.
- Scope is current session only.

## Failure And Retry

- Persistence failure: block apply, show retry CTA.
- Apply API failure: keep user in AI Studio, preserve prepared payload for retry.
- Navigation failure after apply success: show manual `Back to Planner` action with deep link.

## Suggested Workstreams

1. Handoff contract and typed schema.
2. AI Studio workflow hydrator by post type.
3. Server-side asset persistence boundary for apply flow.
4. Planner apply endpoint and overwrite logic.
5. UI for `Apply Back`, selection gating, and retry states.
6. Planner re-focus and return navigation.
7. In-session version history store and UI.

## Acceptance Criteria

- Opening AI Studio from Planner carries the selected draft context only.
- Default workflow type matches post type mapping.
- Reels apply as video assets.
- Carousel applies ordered assets with authoritative count.
- LinkedIn apply enforces single selected output when needed.
- Any failed persistence prevents apply and offers retry.
- Successful apply updates the same draft id and returns user to Planner focus view.
