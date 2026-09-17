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

/** Metadata the Backend attaches to an assistant message. */
export type JainaUIMessageMetadata = {
  runId?: string;
  sessionId?: string;
  responseId?: string;
  /** Terminal state of the run this message belongs to. */
  status?: 'completed' | 'failed' | 'cancelled';
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
  notice: 'data-jaina-notice',
} as const satisfies Record<string, JainaUIDataPartType>;
