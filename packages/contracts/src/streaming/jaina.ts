/**
 * Jaina stream frame definitions — cross-side type contract.
 *
 * The full Zod schemas for Jaina event payloads currently live in
 * Continuum-Frontend/src/lib/jaina/schemas.ts (3000+ lines, tightly coupled
 * to FE report normalization). PR 6 moves the cross-side **type** surface
 * here so the Backend's event builders (App/agents-ts/Jaina/src/runtime/
 * events.ts) and the Frontend's parser (src/lib/jaina/stream.ts) share
 * the same shapes. The deeper Zod migration is tracked for PR 7+ (gated on
 * the Backend's zod 3 → zod 4 migration documented in the contracts README).
 *
 * Convention: each event-data type is the SHAPE of `event.data` for a given
 * `event.type`, not the wrapping `{ type, data }` envelope.
 */

export type JainaStreamEvent<TType extends string = string, TData = Record<string, unknown>> = {
  type: TType;
  data?: TData;
};

// ---------------------------------------------------------------------------
// Forwardable event types (whitelist enforced by Jaina BE server.ts)
// ---------------------------------------------------------------------------

export type JainaForwardableType =
  | 'state.delta'
  | 'response.plan.delta'
  | 'hitl.paused'
  | 'tool.call'
  | 'tool.result'
  | 'tool.batch'
  | 'handoff.start'
  | 'handoff.complete'
  | 'agent.envelope'
  | 'agent.spawn'
  | 'agent.complete'
  | 'agent.delegated'
  | 'response.objectives'
  | 'response.objective.updated'
  | 'response.report_artifact_job.started'
  | 'response.block.delta'
  | 'adk.event'
  | 'error';

// ---------------------------------------------------------------------------
// Categorical event-type unions (kept stable across the Zod migration)
// ---------------------------------------------------------------------------

export type JainaResponseType =
  | 'response.created'
  | 'response.output_item.added'
  | 'response.output_item.done'
  | 'response.content_part.added'
  | 'response.content_part.done'
  | 'response.output_text.delta'
  | 'response.output_json.delta'
  | 'response.done'
  | 'response.error'
  | 'response.plan_ready'
  | 'response.plan.requested'
  | 'response.plan.decision'
  | 'response.run.created'
  | 'response.heartbeat'
  | 'response.checkpoint_report'
  | 'response.checkpoint_report.delta'
  | 'response.checkpoint_report.error'
  | 'response.report_assembly'
  | 'response.report_artifact_job.started'
  | 'response.objectives'
  | 'response.objective.updated'
  | 'response.progress'
  | 'response.clarification_request'
  | 'response.block.delta';

export type JainaCanvasType = 'canvas.actions.proposed' | 'canvas.context.loaded';

export type JainaAgentType =
  | 'agent.spawn'
  | 'agent.complete'
  | 'agent.envelope'
  | 'agent.delegated';

export type JainaToolType = 'tool.call' | 'tool.result' | 'tool.batch';

export type JainaArtifactType =
  | 'artifact.delta'
  | 'state.delta'
  | 'thought'
  | 'adk.event'
  | 'hitl.paused'
  | 'handoff.start'
  | 'handoff.complete';

export type JainaStreamFrameType =
  | JainaResponseType
  | JainaCanvasType
  | JainaAgentType
  | JainaToolType
  | JainaArtifactType
  | 'error';

export type JainaStreamFrame = JainaStreamEvent<JainaStreamFrameType, Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Event-data record shapes — canonical source for BE event builders.
//
// Mirror the shape inferred from the FE Zod schemas in
// Continuum-Frontend/src/lib/jaina/schemas.ts. Keep these in sync until
// the full Zod migration moves the schemas themselves here.
// ---------------------------------------------------------------------------

/** data shape for type: "tool.call" (mirrors FE toolCallSchema). */
export type JainaToolCallEventData = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  metadata: Record<string, unknown>;
  correlation_id?: string;
  parent_correlation_id?: string | null;
  agent_id?: string | null;
  parent_agent_id?: string | null;
  display_name?: string | null;
  agent_name?: string | null;
};

/** data shape for type: "tool.result" (mirrors FE toolResultSchema). */
export type JainaToolResultEventData = {
  id: string;
  name: string;
  ok: boolean;
  cached: boolean;
  shared?: boolean;
  duration_ms?: number;
  output?: unknown;
  error?: string;
  output_omitted?: true;
  output_summary?: {
    omitted: true;
    type: string;
    keys?: string[];
    item_count?: number;
    approx_bytes?: number;
    char_count?: number;
  } & Record<string, unknown>;
  correlation_id?: string;
  parent_correlation_id?: string | null;
  agent_id?: string | null;
  parent_agent_id?: string | null;
  display_name?: string | null;
  agent_name?: string | null;
  output_bytes?: number;
  output_tokens_est?: number;
};

/** data shape for type: "agent.spawn" (mirrors FE agentSpawnEventSchema). */
export type JainaAgentSpawnEventData = {
  agent_id: string;
  task_id: string;
  task_description: string;
  started_at: string;
  parent_agent_id?: string | null;
  display_name?: string | null;
  name?: string | null;
};

/** data shape for type: "agent.complete" (mirrors FE agentCompleteEventSchema). */
export type JainaAgentCompleteEventData = {
  agent_id: string;
  task_id: string;
  status: 'completed' | 'failed' | 'partial';
  duration_ms: number;
  error?: string;
  display_name?: string | null;
  name?: string | null;
  /** Digest-fidelity observability: what the worker actually returned. */
  evidence_count?: number;
  insight_count?: number;
  recommendation_count?: number;
  has_key_metrics?: boolean;
};

/** data shape for type: "state.delta". */
export type JainaStateDeltaEventData = {
  source: string;
  delta: Record<string, unknown>;
};

/** data shape for type: "response.progress" — stage-tagged free-form record. */
export type JainaProgressEventData = {
  stage: string;
} & Record<string, unknown>;

/**
 * data shape for type: "response.heartbeat" — idle keepalive frame.
 *
 * Emitted by the Backend during otherwise-silent stretches so the Frontend
 * stream stays active (the inactivity watchdog re-arms on any received line)
 * and the browser body buffer never looks idle. Carries no UI state; the
 * Frontend reducer treats it as a no-op.
 */
export type JainaHeartbeatEventData = {
  ts: number;
};

/** data shape for type: "response.plan_ready". */
export type JainaPlanReadyEventData = {
  plan_id: string;
  intent: string;
  date_preset: string;
  objectives: Array<{
    objective_id: string;
    scope: string;
    task: string;
    description: string;
    depends_on: string[];
    hints: Record<string, unknown>;
    success_criteria: string;
  }>;
};
