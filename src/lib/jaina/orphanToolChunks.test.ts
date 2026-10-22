import { describe, expect, it } from 'bun:test';
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import {
  continuedToolCallIds,
  dropOrphanToolChunks,
  type OrphanToolChunk,
} from './orphanToolChunks';

// The beta conversation of 2026-10-20 ~23:12Z: a Phase 2 code-owned read reported a nested
// `tool.result` under `phase2_get_ad_creative_preview_<uuid>`, a call the adapter never announced.
const ORPHAN_ID = 'phase2_get_ad_creative_preview_3044ae04-5c1b-4f2e-9d7a-0b1c2d3e4f50';
const RUN_MESSAGE_ID = 'jaina:run_7f3e:assistant';

const streamOf = (chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

const collect = async (stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> => {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
};

/** Assemble the stream the way `useChat` does, and return the last message it settles on. */
const assemble = async (
  stream: ReadableStream<UIMessageChunk>,
  message?: UIMessage,
): Promise<UIMessage | undefined> => {
  let last: UIMessage | undefined;
  for await (const next of readUIMessageStream({
    stream,
    ...(message ? { message } : {}),
    terminateOnError: true,
  })) {
    last = next;
  }
  return last;
};

/** The replayed run: a model tool call that completed, then the orphan, then the answer. */
const replayedRun = (): UIMessageChunk[] => [
  { type: 'start', messageId: RUN_MESSAGE_ID },
  {
    type: 'tool-input-available',
    toolCallId: 'call_top_ads_1',
    toolName: 'get_top_ads',
    input: { date_preset: 'last_7d' },
    dynamic: true,
  },
  {
    type: 'tool-output-available',
    toolCallId: 'call_top_ads_1',
    output: { ads: [{ id: '120210000000001', spend: 412.3 }] },
    dynamic: true,
  },
  {
    type: 'tool-output-available',
    toolCallId: ORPHAN_ID,
    output: { preview_iframe: '<iframe src="https://www.facebook.com/ads/api/preview"></iframe>' },
    dynamic: true,
  },
  { type: 'text-start', id: 'answer' },
  { type: 'text-delta', id: 'answer', delta: 'Your top ad spent $412.30 this week.' },
  { type: 'text-end', id: 'answer' },
  { type: 'finish' },
];

describe('dropOrphanToolChunks', () => {
  it('reproduces the SDK failure without the filter', async () => {
    await expect(assemble(streamOf(replayedRun()))).rejects.toThrow(
      `No tool invocation found for tool call ID "${ORPHAN_ID}"`,
    );
  });

  it('drops the orphan result so the rest of the answer assembles', async () => {
    const orphans: OrphanToolChunk[] = [];
    const message = await assemble(
      dropOrphanToolChunks(streamOf(replayedRun()), new Set(), (orphan) => orphans.push(orphan)),
    );

    expect(orphans).toEqual([{ type: 'tool-output-available', toolCallId: ORPHAN_ID }]);
    const text = message?.parts.find((part) => part.type === 'text');
    expect(text && 'text' in text ? text.text : null).toBe('Your top ad spent $412.30 this week.');
    const tool = message?.parts.find((part) => part.type === 'dynamic-tool');
    expect(tool && 'state' in tool ? tool.state : null).toBe('output-available');
  });

  it('drops orphan errors, denials and approval requests too', async () => {
    const orphans: OrphanToolChunk[] = [];
    const chunks = await collect(
      dropOrphanToolChunks(
        streamOf([
          { type: 'start', messageId: RUN_MESSAGE_ID },
          {
            type: 'tool-output-error',
            toolCallId: 'ghost_1',
            errorText: 'tool_call_budget_exceeded',
          },
          { type: 'tool-output-denied', toolCallId: 'ghost_2' },
          { type: 'tool-approval-request', toolCallId: 'ghost_3', approvalId: 'appr_1' },
          { type: 'tool-input-delta', toolCallId: 'ghost_4', inputTextDelta: '{"a"' },
        ]),
        new Set(),
        (orphan) => orphans.push(orphan),
      ),
    );

    expect(chunks.map((chunk) => chunk.type)).toEqual(['start']);
    expect(orphans.map((orphan) => orphan.toolCallId)).toEqual([
      'ghost_1',
      'ghost_2',
      'ghost_3',
      'ghost_4',
    ]);
  });

  it('keeps a result for a call the continued message already holds (resume after the call)', async () => {
    const continued: UIMessage = {
      id: RUN_MESSAGE_ID,
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolCallId: 'call_creatives_9',
          toolName: 'get_ad_creatives',
          state: 'input-available',
          input: { ad_id: '120210000000001' },
        },
      ],
    };
    const tail: UIMessageChunk[] = [
      {
        type: 'tool-output-available',
        toolCallId: 'call_creatives_9',
        output: { creatives: 2 },
        dynamic: true,
      },
      { type: 'finish' },
    ];

    const message = await assemble(
      dropOrphanToolChunks(streamOf(tail), continuedToolCallIds([continued])),
      continued,
    );

    const tool = message?.parts.find((part) => part.type === 'dynamic-tool');
    expect(tool && 'state' in tool ? tool.state : null).toBe('output-available');
  });

  it('passes a well-formed stream through untouched', async () => {
    const wellFormed = replayedRun().filter(
      (chunk) => !('toolCallId' in chunk && chunk.toolCallId === ORPHAN_ID),
    );
    const chunks = await collect(dropOrphanToolChunks(streamOf(wellFormed), new Set()));
    expect(chunks).toEqual(wellFormed);
  });
});

describe('continuedToolCallIds', () => {
  it('reads tool calls off a trailing assistant message only', () => {
    const assistant: UIMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Checking.' },
        {
          type: 'dynamic-tool',
          toolCallId: 'call_1',
          toolName: 'get_top_ads',
          state: 'input-available',
          input: {},
        },
      ],
    };
    const user: UIMessage = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Why?' }] };

    expect([...continuedToolCallIds([user, assistant])]).toEqual(['call_1']);
    // A new turn starts a new message: the previous answer's calls are not resolvable from it.
    expect([...continuedToolCallIds([assistant, user])]).toEqual([]);
    expect([...continuedToolCallIds([])]).toEqual([]);
  });
});
