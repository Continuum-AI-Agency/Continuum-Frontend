// The canonical agent-run contract, shared by every Continuum tool-loop agent
// (Organic, Jaina) and by the Frontend run store that tails them.
//
// WHY THIS EXISTS: a run used to BE its HTTP request. Organic aborted the model
// the moment the socket closed; Jaina did not. Each kept its own run table, its
// own replay cursor (after_seq vs after_id), its own status enum, its own
// "run started" frame name, and its own idea of what resume even means (event
// replay vs re-rendering a stored result_payload). Two of everything, drifting.
//
// The rule this file establishes: A RUN IS A DURABLE, ADDRESSABLE OBJECT. The
// HTTP stream is only one view of it. A client attaches to a run, may detach,
// and may re-attach from any seq — and the run neither notices nor cares.
//
// ONE RUN CONTRACT, TWO FRAME UNIONS. The per-agent frame unions
// (organicStreamFrameSchema, JainaStreamEvent) stay separate — they model
// genuinely different domains. Everything AROUND the frame — its envelope, the
// run it belongs to, the run's lifecycle, the replay cursor — lives here and is
// identical for both. That is the seam that lets ONE Frontend hook tail EITHER
// agent.

import { z } from 'zod';
import { streamEnvelopeSchema } from '../streaming/envelope';

/** Which agent produced a run. The FE uses this to pick the replay endpoint and Realtime table. */
export const agentKindSchema = z.enum(['organic', 'jaina']);
export type AgentKind = z.infer<typeof agentKindSchema>;

/**
 * Run lifecycle. `queued` means the run is fenced behind another run on the same
 * session (one run per session; a second turn waits rather than interleaving into
 * the same conversation history). Jaina's legacy `pending` maps to `queued` at the
 * DTO boundary — see normalizeAgentRunStatus.
 */
export const agentRunStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const TERMINAL_AGENT_RUN_STATUSES = ['completed', 'failed', 'cancelled'] as const;

const TERMINAL_SET: ReadonlySet<AgentRunStatus> = new Set(TERMINAL_AGENT_RUN_STATUSES);

/** A run in a terminal state will emit no further events; the FE can stop tailing it. */
export const isTerminalAgentRunStatus = (status: AgentRunStatus): boolean =>
  TERMINAL_SET.has(status);

/**
 * Coerce a raw DB status onto the canonical enum. Jaina's table predates this
 * contract and stores `pending` for what Organic calls `queued`; an unknown value
 * degrades to `queued` rather than throwing, so a status we don't know yet can
 * never drop a run row at the boundary.
 */
export const normalizeAgentRunStatus = (raw: unknown): AgentRunStatus => {
  if (raw === 'pending') return 'queued';
  const parsed = agentRunStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'queued';
};

/**
 * One run, as every run endpoint reports it. `lastSeq` is the highest event seq
 * persisted for the run, so a client that re-attaches knows how far the durable
 * log goes without reading it.
 */
export const agentRunDtoSchema = z.object({
  runId: z.string().min(1),
  agent: agentKindSchema,
  sessionId: z.string().min(1),
  brandId: z.string().nullable().optional(),
  status: agentRunStatusSchema,
  createdAt: z.string(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  lastSeq: z.number().int().nonnegative().nullable().optional(),
  /** Session title, carried so a completion toast can name the conversation it came from. */
  title: z.string().nullable().optional(),
});
export type AgentRunDto = z.infer<typeof agentRunDtoSchema>;

/**
 * One persisted run event: the SHARED stream envelope plus the frame. The payload
 * stays `unknown`-valued here on purpose — narrowing it is the job of the
 * per-agent frame union on the read side (organicStreamFrameSchema /
 * the Jaina parser), exactly as the live stream already does.
 */
export const agentRunEventDtoSchema = streamEnvelopeSchema.extend({
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});
export type AgentRunEventDto = z.infer<typeof agentRunEventDtoSchema>;

/**
 * A page of replayed events. `nextSeq` is what to pass as `after_seq` on the next
 * call — it is the resume cursor, and it is the SAME number space the live NDJSON
 * stream puts in its envelope. That agreement is load-bearing: the FE merges the
 * live stream and the replay into one log and dedupes by seq, so a frame must carry
 * the same seq on both paths or resume double-renders or drops.
 */
export const agentRunEventsPageSchema = z.object({
  run: agentRunDtoSchema,
  events: z.array(agentRunEventDtoSchema),
  nextSeq: z.number().int().nonnegative(),
});
export type AgentRunEventsPage = z.infer<typeof agentRunEventsPageSchema>;

/** GET /api/agents/runs/active?brandId= — what the app shell hydrates from on load. */
export const activeAgentRunsResponseSchema = z.object({
  runs: z.array(agentRunDtoSchema),
});
export type ActiveAgentRunsResponse = z.infer<typeof activeAgentRunsResponseSchema>;

/**
 * The first frame of every run, on every agent, at seq 0. It is what tells a client which
 * durable run its stream is a view of — without it there is nothing to re-attach to.
 * Supersedes Jaina's `response.run.created`, which said the same thing in a different shape.
 *
 * NOTE THE NAME. `agent.run_started` is ALREADY TAKEN in the organic frame union, where it
 * means something completely different — a per-tool jobId emitted MID-stream by
 * planExecution/createPost, which the Frontend routes to job-card tracking. Minting a
 * cross-agent lifecycle frame under that literal would shadow it and silently break job
 * cards. `agent.chat_started` already carried exactly this meaning and this `{runId,
 * sessionId}` shape on the organic side, so it is promoted to the shared name rather than
 * a new one being invented next to a homonym.
 */
export const AGENT_CHAT_STARTED = 'agent.chat_started' as const;

export const agentChatStartedFrameSchema = z.object({
  type: z.literal(AGENT_CHAT_STARTED),
  data: z.object({
    runId: z.string().min(1),
    sessionId: z.string().min(1),
    agent: agentKindSchema,
  }),
});
export type AgentChatStartedFrame = z.infer<typeof agentChatStartedFrameSchema>;

/**
 * Emitted instead of `agent.chat_started` when the run is fenced behind another run on the
 * same session, so the composer can say "waiting on the current run" rather than appearing
 * hung. The run still exists and is still tailable; it just has not begun executing.
 *
 * Carries NO envelope on the wire — see the seq note on agentRunEventsPageSchema. A queued
 * run has not emitted event 0 yet, and giving this notice a seq would collide with the
 * seq-0 chat-started frame and get eaten by the client's dedupe.
 */
export const AGENT_RUN_QUEUED = 'agent.run_queued' as const;

export const agentRunQueuedFrameSchema = z.object({
  type: z.literal(AGENT_RUN_QUEUED),
  data: z.object({
    runId: z.string().min(1),
    sessionId: z.string().min(1),
    agent: agentKindSchema,
    /** How many runs are ahead of this one on the session. */
    aheadOf: z.number().int().nonnegative().optional(),
  }),
});
export type AgentRunQueuedFrame = z.infer<typeof agentRunQueuedFrameSchema>;

/**
 * Merge older/live events into an existing log, keeping it seq-ordered and
 * duplicate-free. The live NDJSON stream and the durable replay overlap by design
 * (a re-attach re-reads the boundary frame), so dedupe is not an optimization —
 * it is what makes the two producers safe to run at once.
 *
 * Returns the SAME array reference when nothing is new, so React can skip the render.
 */
export const mergeAgentRunEvents = (
  current: readonly AgentRunEventDto[],
  incoming: readonly AgentRunEventDto[],
): AgentRunEventDto[] => {
  if (incoming.length === 0) return current as AgentRunEventDto[];

  const seen = new Set(current.map((event) => event.seq));
  const fresh = incoming.filter((event) => !seen.has(event.seq));
  if (fresh.length === 0) return current as AgentRunEventDto[];

  return [...current, ...fresh].sort((a, b) => a.seq - b.seq);
};
