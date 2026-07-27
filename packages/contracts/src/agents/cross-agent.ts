// Cross-agent calling contract — the full-mesh `ask_agent` seam shared by every
// caller tool (Organic, Jaina, Canvas composer), every callee ingestion path, and
// the Frontend renderers of `agent.delegated` frames.
//
// A cross-agent call is IN-PROCESS: all agents live in one Fastify process, so the
// executor starts the callee's durable run directly (no internal HTTP, no token
// forwarding) and tails its run store. What crosses this contract is therefore not
// a transport envelope but the SHARED VOCABULARY: who initiated a run, the chain
// that got us here (loop guard), the request/result shapes of one call, and the
// `agent.delegated` frame the caller's stream renders.

import { z } from 'zod';
import { agentKindSchema } from './runs';

/**
 * Who started a run/session: a human (`user`) or another agent (`agent`).
 * Deliberately NOT including `automation` — nothing initiates agent runs from
 * automations today; add the member when a caller exists, not before.
 */
export const agentInitiatorSchema = z.enum(['user', 'agent']);
export type AgentInitiator = z.infer<typeof agentInitiatorSchema>;

/** Maximum delegation depth. A→B is hop 1, A→B→C is hop 2; hop 3 is refused. */
export const CROSS_AGENT_MAX_HOPS = 2;

/** Default budget the caller waits before detaching from the callee run. */
export const CROSS_AGENT_DEFAULT_TIMEOUT_MS = 180_000;

/** Hard cap on the per-call budget — a tool call may not block a caller for longer. */
export const CROSS_AGENT_MAX_TIMEOUT_MS = 300_000;

/** Hard cap on the answer text returned into the caller's context window. */
export const CROSS_AGENT_ANSWER_TEXT_MAX_CHARS = 32_000;

/** One hop of the delegation chain. Rides the provenance object so the loop guard
 *  survives process restarts (it is re-read from the callee's own request). */
export const crossAgentChainEntrySchema = z.object({
  agent: agentKindSchema,
  runId: z.string().min(1),
});
export type CrossAgentChainEntry = z.infer<typeof crossAgentChainEntrySchema>;

/**
 * Provenance stamped onto a callee run + session. `initiatorAgent` is usually an
 * AgentKind, but external MCP clients (Claude, ChatGPT) stamp their client id —
 * it stays a loose string on the wire for that reason.
 */
export const crossAgentProvenanceSchema = z.object({
  initiator: agentInitiatorSchema,
  initiatorAgent: z.string().min(1).optional(),
  /** agent_cross_calls.call_id linking caller and callee runs. */
  callId: z.string().min(1).optional(),
  callerRunId: z.string().min(1).optional(),
  callerSessionId: z.string().min(1).optional(),
  chain: z.array(crossAgentChainEntrySchema).default([]),
});
export type CrossAgentProvenance = z.infer<typeof crossAgentProvenanceSchema>;

/** Canvas targeting: `list` discovers the brand's workspaces; `roomId` targets one. */
export const crossAgentCanvasTargetSchema = z
  .object({
    roomId: z.string().min(1).optional(),
    list: z.boolean().optional(),
  })
  .strict();
export type CrossAgentCanvasTarget = z.infer<typeof crossAgentCanvasTargetSchema>;

export const crossAgentCallRequestSchema = z.object({
  target: agentKindSchema,
  query: z.string().min(1),
  brandId: z.string().min(1),
  /** Explicit callee session. Absent = the persistent xagent_<caller>_<brand> thread. */
  sessionId: z.string().min(1).optional(),
  canvas: crossAgentCanvasTargetSchema.optional(),
  timeoutMs: z.number().int().positive().max(CROSS_AGENT_MAX_TIMEOUT_MS).optional(),
  provenance: crossAgentProvenanceSchema,
});
export type CrossAgentCallRequest = z.infer<typeof crossAgentCallRequestSchema>;

export const crossAgentCallStatusSchema = z.enum([
  'completed',
  'running',
  'failed',
  'timeout',
  'refused',
]);
export type CrossAgentCallStatus = z.infer<typeof crossAgentCallStatusSchema>;

export const crossAgentRefusalReasonSchema = z.enum([
  'max_hops',
  'cycle',
  'duplicate',
  'unauthorized',
  'invalid_target',
]);
export type CrossAgentRefusalReason = z.infer<typeof crossAgentRefusalReasonSchema>;

export const crossAgentCallResultSchema = z.object({
  callId: z.string().min(1),
  calleeAgent: agentKindSchema,
  calleeRunId: z.string().min(1).nullable().optional(),
  calleeSessionId: z.string().min(1).nullable().optional(),
  /** `running` means the caller detached on timeout — the callee keeps executing. */
  status: crossAgentCallStatusSchema,
  answerText: z.string().max(CROSS_AGENT_ANSWER_TEXT_MAX_CHARS).optional(),
  deepLink: z.string().optional(),
  refusal: z
    .object({
      reason: crossAgentRefusalReasonSchema,
      message: z.string(),
    })
    .optional(),
});
export type CrossAgentCallResult = z.infer<typeof crossAgentCallResultSchema>;

// ---------------------------------------------------------------------------
// `agent.delegated` — the caller-stream frame for a cross-agent call
// ---------------------------------------------------------------------------

export const AGENT_DELEGATED = 'agent.delegated' as const;

export const agentDelegatedFrameDataSchema = z
  .object({
    callId: z.string().min(1),
    callerAgent: agentKindSchema,
    calleeAgent: agentKindSchema,
    query: z.string(),
    status: crossAgentCallStatusSchema,
    calleeRunId: z.string().min(1).optional(),
    calleeSessionId: z.string().min(1).optional(),
    deepLink: z.string().optional(),
  })
  .loose();
export type AgentDelegatedFrameData = z.infer<typeof agentDelegatedFrameDataSchema>;

export const agentDelegatedFrameSchema = z.object({
  type: z.literal(AGENT_DELEGATED),
  data: agentDelegatedFrameDataSchema,
});
export type AgentDelegatedFrame = z.infer<typeof agentDelegatedFrameSchema>;

// ---------------------------------------------------------------------------
// Deep links — ONE builder for FE and BE
// ---------------------------------------------------------------------------

/**
 * The canonical conversation URL for an agent session, shared by the Backend
 * (deep links inside `agent.delegated` frames / cross-call results) and the
 * Frontend (sidebar + toast links), so the scheme can never drift between them.
 *
 * canvas/hyperframes sessions ARE rooms — their sessionId is the roomId.
 */
export const agentConversationPath = (
  agent: z.infer<typeof agentKindSchema>,
  sessionId: string,
  runId?: string,
): string => {
  const runSuffix = runId ? `&runId=${encodeURIComponent(runId)}` : '';
  switch (agent) {
    case 'organic':
      return `/organic?tab=agent&sessionId=${encodeURIComponent(sessionId)}${runSuffix}`;
    case 'jaina':
      return `/scale?tab=jaina&sessionId=${encodeURIComponent(sessionId)}${runSuffix}`;
    case 'canvas':
    case 'hyperframes':
      return `/ai-studio?roomId=${encodeURIComponent(sessionId)}${runSuffix}`;
  }
};

/**
 * The persistent agent-to-agent thread for a (caller agent, brand) pair — ONE
 * readable conversation per pairing, not a fresh session per call. Session
 * fencing queues concurrent calls on the thread rather than rejecting them.
 */
export const crossAgentSessionId = (callerAgent: string, brandId: string): string =>
  `xagent_${callerAgent}_${brandId}`;

// ---------------------------------------------------------------------------
// Chat-history provenance, tags, filters and search
// ---------------------------------------------------------------------------

/** Provenance + tag columns every agent session list DTO carries. */
export const agentSessionProvenanceSchema = z.object({
  initiator: agentInitiatorSchema.nullable().optional(),
  initiatorAgent: z.string().nullable().optional(),
  callerRunId: z.string().nullable().optional(),
  callerSessionId: z.string().nullable().optional(),
  crossCallId: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  /** First user message, truncated — the trgm-indexed search field. */
  preview: z.string().nullable().optional(),
});
export type AgentSessionProvenance = z.infer<typeof agentSessionProvenanceSchema>;

export const AGENT_SESSION_MAX_TAGS = 12;
export const AGENT_SESSION_TAG_MAX_LENGTH = 32;

/**
 * One tag, as stored: trimmed, lower-cased, whitespace collapsed. Tags are a
 * user-facing filing label, so they are compared case-insensitively — storing
 * them normalized is what makes `tags @> {…}` containment behave that way.
 */
export const normalizeAgentSessionTag = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, AGENT_SESSION_TAG_MAX_LENGTH);

/** Normalize, drop empties, dedupe, cap. The single definition of a valid tag set. */
export const normalizeAgentSessionTags = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  for (const value of values) {
    const tag = normalizeAgentSessionTag(value);
    if (tag.length === 0) continue;
    seen.add(tag);
    if (seen.size === AGENT_SESSION_MAX_TAGS) break;
  }
  return [...seen];
};

export const agentSessionTagsSchema = z
  .array(z.string().max(200))
  .max(AGENT_SESSION_MAX_TAGS * 4)
  .transform(normalizeAgentSessionTags);

/** Body of `PATCH …/sessions/:sessionId` on every agent that owns chat history. */
export const updateAgentSessionTagsRequestSchema = z.object({
  tags: agentSessionTagsSchema,
});
export type UpdateAgentSessionTagsRequest = z.infer<typeof updateAgentSessionTagsRequestSchema>;

export const updateAgentSessionTagsResponseSchema = z.object({
  sessionId: z.string().min(1),
  tags: z.array(z.string()),
});
export type UpdateAgentSessionTagsResponse = z.infer<typeof updateAgentSessionTagsResponseSchema>;

/** A `tags=a,b` query param, from either a repeated param or one CSV value. */
export const parseAgentSessionTagsParam = (value: unknown): string[] => {
  if (Array.isArray(value)) return normalizeAgentSessionTags(value.map((item) => String(item)));
  if (typeof value !== 'string') return [];
  return normalizeAgentSessionTags(value.split(','));
};

/**
 * Filters accepted by every agent chat-history list endpoint. `q` searches
 * title + preview (pg_trgm-indexed ILIKE), `tags` is array containment, and the
 * initiator pair is equality.
 */
export const agentSessionListFiltersSchema = z.object({
  q: z.string().trim().min(1).optional(),
  initiator: agentInitiatorSchema.optional(),
  initiatorAgent: z.string().trim().min(1).optional(),
  tags: z.array(z.string()).optional(),
});
export type AgentSessionListFilters = z.infer<typeof agentSessionListFiltersSchema>;

/**
 * PostgREST's `or=` value is a comma-separated, dot-delimited micro-syntax, so a
 * raw user term containing `,` `.` `(` `)` or a LIKE wildcard would change the
 * meaning of the expression rather than be matched literally. Those characters
 * are replaced by spaces: trigram search does not need them, and dropping them
 * is strictly safer than quoting rules that differ per PostgREST version.
 */
export const sanitizeAgentSessionSearchTerm = (term: string): string =>
  term
    .replace(/[,.()"'\\%_*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The PostgREST `or` expression for a search term across the given columns:
 * `title.ilike.*term*,preview.ilike.*term*`. Empty when the term sanitizes away,
 * which callers must read as "apply no search filter" (never "match nothing").
 */
export const buildAgentSessionSearchExpression = (
  term: string,
  columns: readonly string[],
): string => {
  const sanitized = sanitizeAgentSessionSearchTerm(term);
  if (sanitized.length === 0 || columns.length === 0) return '';
  return columns.map((column) => `${column}.ilike.*${sanitized}*`).join(',');
};

/** Column names differ per agent (organic `title` vs Jaina `conversation_title`). */
export type AgentSessionFilterColumns = {
  title: string;
  preview: string;
  initiator: string;
  initiatorAgent: string;
  tags: string;
};

export const DEFAULT_AGENT_SESSION_FILTER_COLUMNS: AgentSessionFilterColumns = {
  title: 'title',
  preview: 'preview',
  initiator: 'initiator',
  initiatorAgent: 'initiator_agent',
  tags: 'tags',
};

export type AgentSessionFilterStep =
  | { op: 'or'; expression: string }
  | { op: 'eq'; column: string; value: string }
  | { op: 'contains'; column: string; value: string[] };

/**
 * The filter steps a session-list query must apply, as data. Both agent stores
 * build their Supabase query by folding these — one definition of what `q`,
 * `initiator`, `initiatorAgent` and `tags` mean, testable without a database.
 */
export const buildAgentSessionFilterSteps = (
  filters: AgentSessionListFilters,
  columns: AgentSessionFilterColumns = DEFAULT_AGENT_SESSION_FILTER_COLUMNS,
): AgentSessionFilterStep[] => {
  const steps: AgentSessionFilterStep[] = [];

  if (filters.q) {
    const expression = buildAgentSessionSearchExpression(filters.q, [
      columns.title,
      columns.preview,
    ]);
    if (expression) steps.push({ op: 'or', expression });
  }
  if (filters.initiator) {
    steps.push({ op: 'eq', column: columns.initiator, value: filters.initiator });
  }
  if (filters.initiatorAgent) {
    steps.push({ op: 'eq', column: columns.initiatorAgent, value: filters.initiatorAgent });
  }
  const tags = filters.tags ? normalizeAgentSessionTags(filters.tags) : [];
  if (tags.length > 0) {
    steps.push({ op: 'contains', column: columns.tags, value: tags });
  }

  return steps;
};

/** Minimal shape of the Supabase query builder the steps are folded onto. */
export type AgentSessionFilterableQuery<T> = {
  or(expression: string): T;
  eq(column: string, value: string): T;
  contains(column: string, value: string[]): T;
};

/** Fold filter steps onto a Supabase query builder. Shared so the two agents cannot drift. */
export const applyAgentSessionFilterSteps = <T extends AgentSessionFilterableQuery<T>>(
  query: T,
  steps: readonly AgentSessionFilterStep[],
): T =>
  steps.reduce<T>((current, step) => {
    switch (step.op) {
      case 'or':
        return current.or(step.expression);
      case 'eq':
        return current.eq(step.column, step.value);
      case 'contains':
        return current.contains(step.column, step.value);
    }
  }, query);

/** Label for an AI-initiated session row: "AI · Organic". */
export const AGENT_INITIATOR_LABELS: Record<string, string> = {
  organic: 'Organic',
  jaina: 'Jaina',
  canvas: 'AI Studio',
  hyperframes: 'HyperFrames',
};

export const agentInitiatorLabel = (initiatorAgent: string | null | undefined): string => {
  if (!initiatorAgent) return 'AI';
  const known = AGENT_INITIATOR_LABELS[initiatorAgent];
  if (known) return `AI · ${known}`;
  if (initiatorAgent.startsWith('mcp:')) return `AI · ${initiatorAgent.slice(4)}`;
  return `AI · ${initiatorAgent}`;
};
