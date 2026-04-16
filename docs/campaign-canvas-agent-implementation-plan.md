# Campaign Canvas Agent Tooling Plan

## Goal
- Enable a tool-calling agent to read targeted parts of the campaign canvas and apply safe graph edits (attach/connect/update) through existing `campaign_canvas_actions` envelopes.

## Current State Analysis
- Canvas graph runtime is in [`src/CampaignCanvas/stores/useCampaignStore.ts`](/Users/duane/Documents/GitHub/Continuum-Frontend/src/CampaignCanvas/stores/useCampaignStore.ts) with core mutators:
  - `addNode`
  - `addConnectedNode` (attach + layout)
  - `onConnect` (edge creation + hierarchy guard)
  - `updateNodeData`
- UI canvas execution path is [`src/CampaignCanvas/components/CampaignCanvas.tsx`](/Users/duane/Documents/GitHub/Continuum-Frontend/src/CampaignCanvas/components/CampaignCanvas.tsx).
- Agent action schema exists in [`src/lib/campaign-canvas/agent-actions.ts`](/Users/duane/Documents/GitHub/Continuum-Frontend/src/lib/campaign-canvas/agent-actions.ts):
  - `CREATE_NODE`, `CONNECT_NODES`, `UPDATE_NODE`, `RECOMMEND_STRUCTURE`
  - envelope: `kind: "campaign_canvas_actions"`
- Envelope extraction + application already exists in Jaina chat flow via [`src/components/paid-media/jaina/JainaChatSurface.tsx`](/Users/duane/Documents/GitHub/Continuum-Frontend/src/components/paid-media/jaina/JainaChatSurface.tsx) and stream reducer support in [`src/lib/jaina/stream.ts`](/Users/duane/Documents/GitHub/Continuum-Frontend/src/lib/jaina/stream.ts).
- Canonical graph snapshot serializer exists: [`buildCampaignCanvasPayload`](/Users/duane/Documents/GitHub/Continuum-Frontend/src/lib/campaign-canvas/payload.ts).

## Gaps Blocking Tool-Driven Canvas Agent
- No explicit read-tool contract for partial graph queries (node subtree, neighbors, type filters).
- No `ATTACH_NODE` action despite existing `addConnectedNode` store primitive.
- `CampaignChat` still references `/api/campaign/chat`, but route is absent; real execution path is Jaina stream.
- `campaignCanvasPayload` is optionally available in `JainaChatSurface` props but not sent in request context (only `canvas: boolean` flag is sent).
- Action application is per-action best-effort; no transactional batch semantics for rollback on invalid sequence.

## Proposed Workflow (Single Agent + Tool Loop)
- Pattern: single coordinator agent with strict tool boundaries.
- Agent responsibilities:
  1. Read minimal canvas state using read tools.
  2. Decide edit operations.
  3. Emit `campaign_canvas_actions` envelope.
- Frontend responsibilities:
  1. Validate envelope against schema.
  2. Apply actions in order.
  3. Surface validation feedback and apply success toast.

## Proposed Tool Contracts
- `canvas.get_snapshot`
  - Input: `{ scope?: "full" | "summary" }`
  - Output: canonical payload from `buildCampaignCanvasPayload`.
- `canvas.get_nodes`
  - Input: `{ nodeIds?: string[], types?: CampaignNodeType[], connectedTo?: string }`
  - Output: filtered nodes + edges touching those nodes.
- `canvas.find_attach_targets`
  - Input: `{ sourceNodeId: string, targetType: CampaignNodeType }`
  - Output: `{ allowed: boolean, reason?: string, suggestedPosition?: { x, y } }`.
- `canvas.validate_plan`
  - Input: `{ actions: CampaignCanvasAgentAction[] }`
  - Output: `{ valid: boolean, violations: string[] }`.
- `canvas.propose_actions`
  - Input: agent intent + context
  - Output: `campaign_canvas_actions` envelope.

## Action Schema Evolution
- Keep existing action types.
- Add:
  - `ATTACH_NODE`
    - Payload: `{ sourceId: string, targetType: CampaignNodeType, data?: Record<string, unknown>, clientNodeId?: string }`
    - Frontend maps to `addConnectedNode` and alias registration.
  - Optional `VALIDATE_GRAPH` action for explicit check-pointing.
- Keep alias resolution map (`clientNodeId -> createdId`) for deterministic connect/update ordering.

## Frontend Integration Plan
1. **Plumb canvas context into Jaina request**
- Extend [`jainaChatRequestSchema`](/Users/duane/Documents/GitHub/Continuum-Frontend/src/lib/jaina/schemas.ts) `context` with optional:
  - `campaignCanvasPayload`
  - `campaignCanvasSummary`
- In [`JainaChatSurface.tsx`](/Users/duane/Documents/GitHub/Continuum-Frontend/src/components/paid-media/jaina/JainaChatSurface.tsx), pass `campaignCanvasPayload` when available.

2. **Introduce batch applier with rollback**
- Add helper in `CampaignCanvas` domain:
  - `applyCampaignActionsBatch(actions)`
  - Preflight each action via schema + connection guards.
  - Push history once for the entire batch.
  - On failure, restore snapshot and return error summary.

3. **Action processor updates**
- Update [`useCampaignAI`](/Users/duane/Documents/GitHub/Continuum-Frontend/src/CampaignCanvas/hooks/useCampaignAI.ts) to support `ATTACH_NODE`.
- Route all envelope application through batch applier instead of per-action direct mutation.

4. **Retire/align old chat path**
- Either remove `CampaignChat` legacy route dependency or rewire it to Jaina stream path to avoid dead interface assumptions.

## Backend/Agent Orchestration Plan
- In Jaina backend agent runtime (upstream of `/api/agents/jaina/chat/stream`):
  - Register canvas read tools (`get_snapshot`, `get_nodes`, `find_attach_targets`).
  - Force agent to read before write for mutation intents.
  - Emit either:
    - `canvas.actions.proposed` stream events, or
    - tool results containing envelope payloads (already parsed by frontend extractor).
- Use schema-first enforcement with `campaignCanvasActionsEnvelopeSchema` before event emission.

## Error Handling
- Envelope parse failure: ignore + log warning (no canvas mutation).
- Brand mismatch: ignore envelope (already implemented).
- User mismatch: warn + continue only when session user is unavailable.
- Batch apply failure: rollback + toast with first actionable violation.
- Validation mismatch after apply: return `validateGraph()` summary and include in chat response metadata.

## Evaluation Plan
- Happy path:
  - Prompt: "Create campaign -> ad set -> ad -> creative and add audience to ad set".
  - Expect one envelope, valid graph, zero rollback, canonical payload passes.
- Edge case:
  - Agent proposes disallowed connection (`creative -> campaign`).
  - Expect preflight reject + no graph mutation.
- Regression:
  - Existing `CREATE_NODE`, `CONNECT_NODES`, `UPDATE_NODE` envelopes still apply unchanged.

## Test Plan
- Extend [`src/lib/campaign-canvas/agent-actions.test.ts`](/Users/duane/Documents/GitHub/Continuum-Frontend/src/lib/campaign-canvas/agent-actions.test.ts) for `ATTACH_NODE` schema normalization.
- Add `useCampaignAI` unit tests for alias mapping with mixed `ATTACH_NODE + CONNECT_NODES`.
- Add store-level batch apply tests for rollback behavior.
- Add Jaina stream reducer test ensuring duplicate `canvas.actions.proposed` envelopes are deduped and applied once.

## Implementation Phases
1. Request/context contract + payload plumbing.
2. Schema/action expansion (`ATTACH_NODE`) + batch applier.
3. Backend tool registration + enforced read-before-write orchestration.
4. Tests + telemetry (`canvas_action_batch_applied`, `canvas_action_batch_failed`).

## Unresolved Questions
1. Should backend tools operate on a mirrored server-side canvas state, or always on frontend-sent snapshot context per turn?
2. Do we want hard failure on `userId` mismatch for canvas envelopes, or keep current warn-and-apply fallback?
3. Should `ATTACH_NODE` be required for all parent-child creation, or remain optional with `CREATE_NODE + CONNECT_NODES` parity?
4. For large graphs, should we default to summary snapshots and require explicit tool reads for deep sections to reduce token load?
