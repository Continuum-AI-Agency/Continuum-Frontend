// The Jaina transcript as the AI SDK models it.
//
// One definition, imported by the Backend emit side (`runtime/uiMessageChunks.ts`) and the
// Frontend consumer (`useChat<JainaUIMessage>`), so the two cannot drift. This is the same rule
// AGENTS.md §4 states for stream frames — the hand-rolled NDJSON union on one side and a parallel
// hand-rolled union on the other is exactly the drift this package exists to stop.
//
// Why `data-*` parts rather than one growing state object: a data part addressed by a STABLE id is
// REPLACED when the same id arrives again. A streamed report block and the final report's copy of
// that block are therefore one part, not two, which is what lets the client stop reconciling
// "which copy is newer" by hand.

import type { UIMessage } from 'ai';
import type { AgentMentionMetadata } from './agent-references';

/** Metadata the Backend attaches to an assistant message. */
export type JainaUIMessageMetadata = {
  runId?: string;
  sessionId?: string;
  responseId?: string;
  /** Terminal state of the run this message belongs to. */
  status?: 'completed' | 'failed' | 'cancelled';
  /**
   * What a reader attached to their own turn — @-mentions of campaigns and ad sets, and the
   * images the composer uploaded. Client-set on the user message. Without a home here it would
   * be dropped on send and the mention chips and attachment grid would vanish the moment the
   * message left the composer.
   */
  mentions?: AgentMentionMetadata;
  /**
   * A user message that answers the protocol rather than the conversation — an approval decision,
   * a plan verdict. The request schema needs a non-empty `query`, so one is sent, but a reader
   * never typed it and the transcript must not show it. Client-set; the Backend never emits it.
   */
  silent?: boolean;
};

/**
 * Typed persistent parts. Each key is the suffix after `data-` on the wire, so
 * `jaina-report-block` arrives as `{ type: 'data-jaina-report-block', id, data }`.
 *
 * Payloads stay `Record<string, unknown>` here deliberately: the report block, objective and
 * scaffold shapes already have canonical Zod schemas elsewhere in this package
 * (`checkpointBlockV2Schema`, `jainaExecutionObjectiveSchema`), and restating them would create the
 * second copy this file exists to prevent. Consumers parse with the canonical schema at the point
 * of render.
 */
export type JainaUIDataTypes = {
  'jaina-report-block': Record<string, unknown>;
  'jaina-report-meta': Record<string, unknown>;
  'jaina-report-assembly': Record<string, unknown>;
  'jaina-report-error': Record<string, unknown>;
  'jaina-objective': Record<string, unknown>;
  'jaina-delegation': Record<string, unknown>;
  'jaina-clarification': Record<string, unknown>;
  'jaina-scaffold': Record<string, unknown>;
  /**
   * The gate. `jaina-approval` carries the preview a `tool-approval-request` cannot — the SDK's
   * approval chunk addresses a tool call, and a uuid on a card is consent to nothing, so the
   * before/after the gate refuses on travels beside it. `jaina-gate` is the weaker signal: the run
   * is parked awaiting a human, which is neither an error nor a finish.
   */
  'jaina-approval': Record<string, unknown>;
  'jaina-gate': Record<string, unknown>;
  'jaina-report-artifact-job': Record<string, unknown>;
  'jaina-artifact': Record<string, unknown>;
  'jaina-creative-render': Record<string, unknown>;
  'jaina-canvas-actions': Record<string, unknown>;
  /**
   * The two values the transcript actually reads out of a `state.delta`. The delta itself stays
   * silent — it is internal bookkeeping — but the checkpoint summary and its provenance decide
   * the error/fallback content a reader sees, so they cross as their own part rather than as a
   * raw event the client would have to fold again.
   */
  'jaina-checkpoint-summary': Record<string, unknown>;
  /**
   * Transport notices — the idle keepalive and the session fence. Always emitted `transient`, so
   * the SDK hands them to `onData` and never adds them to `message.parts`. A heartbeat kept as a
   * part would render as an empty message every fifteen seconds for the length of the run.
   */
  'jaina-notice': Record<string, unknown>;
};

/** Jaina's tools are discovered at run time, so they cross the wire as DYNAMIC tool parts. */
export type JainaUITools = Record<string, never>;

export type JainaUIMessage = UIMessage<JainaUIMessageMetadata, JainaUIDataTypes, JainaUITools>;

/** The `data-` prefixed part type for a given key, e.g. `data-jaina-report-block`. */
export type JainaUIDataPartType = `data-${keyof JainaUIDataTypes & string}`;

export const JAINA_UI_DATA_PART = {
  reportBlock: 'data-jaina-report-block',
  reportMeta: 'data-jaina-report-meta',
  reportAssembly: 'data-jaina-report-assembly',
  reportError: 'data-jaina-report-error',
  objective: 'data-jaina-objective',
  delegation: 'data-jaina-delegation',
  clarification: 'data-jaina-clarification',
  scaffold: 'data-jaina-scaffold',
  approval: 'data-jaina-approval',
  gate: 'data-jaina-gate',
  reportArtifactJob: 'data-jaina-report-artifact-job',
  artifact: 'data-jaina-artifact',
  creativeRender: 'data-jaina-creative-render',
  canvasActions: 'data-jaina-canvas-actions',
  checkpointSummary: 'data-jaina-checkpoint-summary',
  notice: 'data-jaina-notice',
} as const satisfies Record<string, JainaUIDataPartType>;
