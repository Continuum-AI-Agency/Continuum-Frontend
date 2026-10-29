// Tool chunks that name a call the transcript never saw.
//
// The AI SDK resolves `tool-output-available`, `tool-output-error`, `tool-output-denied` and
// `tool-approval-request` against a tool part ALREADY on the message it is assembling, and a
// `tool-input-delta` against a `tool-input-start` of the same stream. One that arrives without it throws `UIMessageStreamError` ("No tool invocation found
// for tool call ID …") and the whole turn ends as an error. Resume replays the same durable log,
// so Try again throws the same error, and the conversation can no longer be opened cleanly.
//
// The Backend emits such a chunk when a code-owned read (Phase 2's `phase2_<tool>_<uuid>` calls)
// reports a nested `tool.result` that its adapter maps onto a call it never announced. That is a
// Backend bug and is reported as one; this filter keeps one stray chunk from costing the reader
// the whole answer. A result with no call has nothing on screen to attach to, so it is dropped —
// never invented into a tool card with a guessed name.

import type { UIMessage, UIMessageChunk } from 'ai';

/** The chunk types the SDK resolves against an existing tool part, and throws on when it is missing. */
const RESOLVES_EXISTING_CALL: ReadonlySet<UIMessageChunk['type']> = new Set([
  'tool-output-available',
  'tool-output-error',
  'tool-output-denied',
  'tool-approval-request',
]);

/** The chunk types that put a tool part on the message. */
const ANNOUNCES_CALL: ReadonlySet<UIMessageChunk['type']> = new Set([
  'tool-input-start',
  'tool-input-available',
  'tool-input-error',
]);

export type OrphanToolChunk = { type: UIMessageChunk['type']; toolCallId: string };

const toolCallIdOf = (chunk: UIMessageChunk): string | null => {
  const toolCallId = (chunk as { toolCallId?: unknown }).toolCallId;
  return typeof toolCallId === 'string' && toolCallId.length > 0 ? toolCallId : null;
};

/**
 * The tool calls a stream may resolve against before it announces any of its own: those of the
 * message the SDK will continue. The SDK builds onto the last message only when it is the
 * assistant's (a resume, or a continuation after an approval); a new turn starts from nothing.
 */
export function continuedToolCallIds(messages: readonly UIMessage[]): Set<string> {
  const last = messages.at(-1);
  const ids = new Set<string>();
  if (last?.role !== 'assistant') return ids;
  for (const part of last.parts) {
    const toolCallId = (part as { toolCallId?: unknown }).toolCallId;
    if (typeof toolCallId === 'string' && toolCallId.length > 0) ids.add(toolCallId);
  }
  return ids;
}

/**
 * Pass every chunk through except one that resolves against a tool call neither this stream nor
 * the continued message announced. `onOrphan` hears each dropped chunk, so the drop is logged
 * rather than silent.
 */
export function dropOrphanToolChunks(
  stream: ReadableStream<UIMessageChunk>,
  knownToolCallIds: ReadonlySet<string>,
  onOrphan?: (orphan: OrphanToolChunk) => void,
): ReadableStream<UIMessageChunk> {
  const announced = new Set(knownToolCallIds);
  // A delta streams into a call STARTED in this stream; a part carried over from the continued
  // message is not enough, because the SDK keeps partial input per stream.
  const startedHere = new Set<string>();
  const isOrphan = (chunk: UIMessageChunk, toolCallId: string): boolean => {
    if (chunk.type === 'tool-input-delta') return !startedHere.has(toolCallId);
    return RESOLVES_EXISTING_CALL.has(chunk.type) && !announced.has(toolCallId);
  };
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        const toolCallId = toolCallIdOf(chunk);
        if (toolCallId && ANNOUNCES_CALL.has(chunk.type)) announced.add(toolCallId);
        if (toolCallId && chunk.type === 'tool-input-start') startedHere.add(toolCallId);
        if (toolCallId && isOrphan(chunk, toolCallId)) {
          onOrphan?.({ type: chunk.type, toolCallId });
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
