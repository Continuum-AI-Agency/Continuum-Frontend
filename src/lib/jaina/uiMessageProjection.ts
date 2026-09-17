// Project an AI SDK UI message onto the shapes the Jaina transcript renders.
//
// This is a GROUPING, not a fold, and the difference is the whole point of the migration. The old
// path ran a 4,000-line reducer that accumulated state frame by frame: a report block arrived as a
// delta, then again inside the final checkpoint, and the client had to decide which copy was newer
// — which is what the `retain blocks` / `preserve streamed blocks` / `retain completed answers`
// commits were all working around.
//
// The Backend now emits each domain object as a typed `data-*` part addressed by a stable id, and
// the SDK REPLACES a part when the same id arrives again. By the time parts reach here the
// reconciliation has already happened, so this file only has to collect them by kind. There is no
// ordering question left to get wrong.
//
// Rendering still goes through the existing `JainaChatMessage` components. Migrating those to read
// `message.parts` directly is the next step; until then this is the seam, and keeping it one small
// pure function is what makes that step safe.

import { JAINA_UI_DATA_PART, type JainaUIMessage } from '@continuum/contracts';

import type { JainaChatMessage } from '@/components/paid-media/jaina/types';

type DataPart = { type: string; id?: string; data?: unknown };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const partsOfType = (message: JainaUIMessage, type: string): Record<string, unknown>[] =>
  (message.parts as DataPart[])
    .filter((part) => part.type === type)
    .map((part) => asRecord(part.data))
    .filter((data): data is Record<string, unknown> => data !== null);

/** Concatenated text of the assistant's answer, in part order. */
export const textOf = (message: JainaUIMessage): string =>
  (message.parts as { type: string; text?: string }[])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');

/** The model's thinking, kept separate from the answer. */
export const reasoningOf = (message: JainaUIMessage): string =>
  (message.parts as { type: string; text?: string }[])
    .filter((part) => part.type === 'reasoning')
    .map((part) => part.text ?? '')
    .join('');

/**
 * The report, reassembled from its blocks.
 *
 * Blocks arrive as individual parts precisely so a 19KB report is never re-sent to update one
 * section. The final checkpoint carries the report's metadata under its own part, so this joins
 * the two back into the shape the renderer already accepts.
 */
export const reportOf = (message: JainaUIMessage): Record<string, unknown> | undefined => {
  const blocks = partsOfType(message, JAINA_UI_DATA_PART.reportBlock);
  const meta = partsOfType(message, JAINA_UI_DATA_PART.reportMeta).at(-1);
  if (blocks.length === 0 && !meta) return undefined;
  return { ...(meta ?? {}), blocks };
};

export const objectivesOf = (message: JainaUIMessage): Record<string, unknown>[] =>
  partsOfType(message, JAINA_UI_DATA_PART.objective);

export const delegationsOf = (message: JainaUIMessage): Record<string, unknown>[] =>
  partsOfType(message, JAINA_UI_DATA_PART.delegation);

export const scaffoldOf = (message: JainaUIMessage): Record<string, unknown> | undefined =>
  partsOfType(message, JAINA_UI_DATA_PART.scaffold).at(-1);

export const clarificationOf = (message: JainaUIMessage): Record<string, unknown> | undefined =>
  partsOfType(message, JAINA_UI_DATA_PART.clarification).at(-1);

/** Dynamic tool parts, in the shape the transcript's tool rows already expect. */
export const toolsOf = (
  message: JainaUIMessage,
): { toolCallId: string; name: string; input?: unknown; output?: unknown; error?: string }[] => {
  type ToolPart = {
    type: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
    state?: string;
  };
  return (message.parts as ToolPart[])
    .filter((part) => part.type === 'dynamic-tool' || part.type.startsWith('tool-'))
    .flatMap((part) => {
      if (!part.toolCallId) return [];
      return [
        {
          toolCallId: part.toolCallId,
          name: part.toolName ?? 'tool',
          input: part.input,
          output: part.output,
          ...(part.errorText ? { error: part.errorText } : {}),
        },
      ];
    });
};

/**
 * One UI message as the transcript's message model.
 *
 * `status` is derived from the SDK's own view of the message rather than tracked separately: a
 * second source of "is this turn finished" is what let a stale snapshot overwrite a live answer.
 */
export const toJainaChatMessage = (
  message: JainaUIMessage,
  options: { isStreaming: boolean },
): JainaChatMessage => {
  const report = reportOf(message);
  const objectives = objectivesOf(message);

  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: textOf(message),
    createdAt: new Date().toISOString(),
    status: options.isStreaming ? 'streaming' : 'done',
    ...(message.metadata?.runId ? { runId: message.metadata.runId } : {}),
    ...(report ? { reportV2: report as JainaChatMessage['reportV2'] } : {}),
    ...(objectives.length > 0
      ? { objectives: objectives as unknown as JainaChatMessage['objectives'] }
      : {}),
  } as JainaChatMessage;
};
