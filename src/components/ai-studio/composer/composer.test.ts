import { describe, expect, it } from 'bun:test';
import type { AgentMentionReference, AiStudioComposerFrame } from '@continuum/contracts';
import { composerHistoryMessageSchema } from '@continuum/contracts';
import { parseComposerFrame } from '@/lib/ai-studio/composer/streamCanvasComposer';
import {
  applyComposerFrame,
  buildHistoryPayload,
  type CanvasComposerState,
  type ComposerTurn,
  IDLE_COMPOSER_STATE,
  toCanvasComposerReferences,
} from './useCanvasComposer';

// The wire adds the envelope fields to every frame.
const line = (frame: Record<string, unknown>, seq = 0): string =>
  JSON.stringify({ ...frame, eventId: `evt_${seq}`, seq, ts: '2026-07-10T00:00:00.000Z' });

const fold = (frames: AiStudioComposerFrame[], from = IDLE_COMPOSER_STATE): CanvasComposerState =>
  frames.reduce(applyComposerFrame, from);

describe('parseComposerFrame', () => {
  it('parses a frame carrying its envelope', () => {
    const frame = parseComposerFrame(line({ type: 'composer.status', data: { message: 'Hi' } }));
    expect(frame).toMatchObject({ type: 'composer.status', data: { message: 'Hi' } });
  });

  it('drops a malformed line instead of throwing mid-stream', () => {
    expect(parseComposerFrame('{not json')).toBeNull();
    expect(parseComposerFrame('')).toBeNull();
  });

  it('drops a frame type this client does not know, leaving the rest of the run intact', () => {
    // A Backend that ships a new frame first must not blank the whole turn.
    expect(parseComposerFrame(line({ type: 'composer.telepathy', data: {} }))).toBeNull();
  });

  it('rejects a frame whose payload does not match its type', () => {
    expect(
      parseComposerFrame(line({ type: 'composer.graph', data: { nodeCount: 'six' } })),
    ).toBeNull();
  });
});

describe('applyComposerFrame', () => {
  it('accumulates progress lines in order', () => {
    const state = fold([
      { type: 'composer.status', data: { message: 'Reading your canvas…' } },
      { type: 'composer.status', data: { message: 'Laying out the workflow…' } },
    ] as AiStudioComposerFrame[]);

    expect(state.steps).toEqual(['Reading your canvas…', 'Laying out the workflow…']);
  });

  it('accumulates added node ids across writes but keeps the LATEST counts', () => {
    // A build followed by an edit emits composer.graph twice. Summing the counts
    // would double-report the canvas; dropping the ids would lose the built nodes.
    const state = fold([
      { type: 'composer.graph', data: { nodeCount: 2, edgeCount: 1, addedNodeIds: ['a', 'b'] } },
      { type: 'composer.graph', data: { nodeCount: 3, edgeCount: 2, addedNodeIds: ['c'] } },
    ] as AiStudioComposerFrame[]);

    expect(state.graph).toEqual({ nodeCount: 3, edgeCount: 2, addedNodeIds: ['a', 'b', 'c'] });
  });

  it('surfaces warnings without failing the turn', () => {
    const state = fold([
      { type: 'composer.warning', data: { message: 'no compatible handle from image to video' } },
      { type: 'response.done', data: { summary: 'Built it.' } },
    ] as AiStudioComposerFrame[]);

    expect(state.status).toBe('done');
    expect(state.warnings).toHaveLength(1);
    expect(state.summary).toBe('Built it.');
  });

  it('ends in error when the agent reports one', () => {
    const state = fold([
      { type: 'response.error', data: { message: 'Vertex is unreachable.' } },
    ] as AiStudioComposerFrame[]);

    expect(state.status).toBe('error');
    expect(state.error).toBe('Vertex is unreachable.');
  });

  it('keeps the graph it landed even when the turn later errors — the nodes are real', () => {
    const state = fold([
      { type: 'composer.graph', data: { nodeCount: 2, edgeCount: 1, addedNodeIds: ['a', 'b'] } },
      { type: 'response.error', data: { message: 'The model gave up.' } },
    ] as AiStudioComposerFrame[]);

    expect(state.status).toBe('error');
    expect(state.graph?.nodeCount).toBe(2);
  });

  it('leaves state untouched for a frame it has no opinion on', () => {
    const state = fold([
      { type: 'tool.call', data: { toolCallId: '1', toolName: 'build_canvas', args: {} } },
    ] as AiStudioComposerFrame[]);

    expect(state).toEqual(IDLE_COMPOSER_STATE);
  });

  it('parses an optimistic composer patch without treating it as narration', () => {
    const frame = parseComposerFrame(
      line({
        type: 'composer.patch',
        data: {
          nodes: [{ id: 'prompt', type: 'string', position: { x: 0, y: 0 }, data: {} }],
          edges: [],
        },
      }),
    );
    expect(frame?.type).toBe('composer.patch');
  });
});

describe('buildHistoryPayload', () => {
  const turn = (
    prompt: string,
    state: Partial<CanvasComposerState>,
    id = prompt,
  ): ComposerTurn => ({
    id,
    prompt,
    state: { ...IDLE_COMPOSER_STATE, ...state },
  });

  it('maps finished turns to user/assistant pairs, in order', () => {
    const history = buildHistoryPayload([
      turn('suggest a codename', { status: 'done', summary: 'Nightowl.' }),
      turn('use it', { status: 'done', summary: 'Renamed the node to Nightowl.' }),
    ]);
    expect(history).toEqual([
      { role: 'user', content: 'suggest a codename' },
      { role: 'assistant', content: 'Nightowl.' },
      { role: 'user', content: 'use it' },
      { role: 'assistant', content: 'Renamed the node to Nightowl.' },
    ]);
  });

  it('skips turns still running — they have nothing to remember yet', () => {
    const history = buildHistoryPayload([
      turn('first', { status: 'done', summary: 'Done.' }),
      turn('in flight', { status: 'running' }),
    ]);
    expect(history).toHaveLength(2);
    expect(history[0]?.content).toBe('first');
  });

  it('remembers failures as failures, not silence', () => {
    const history = buildHistoryPayload([
      turn('do the thing', { status: 'error', error: 'Vertex is unreachable.' }),
    ]);
    expect(history[1]?.role).toBe('assistant');
    expect(history[1]?.content).toContain('failed');
    expect(history[1]?.content).toContain('Vertex is unreachable.');
  });

  it('clamps to the schema caps: last 12 messages, 2000 chars each', () => {
    const turns = Array.from({ length: 10 }, (_, i) =>
      turn(`prompt ${i} ${'x'.repeat(3000)}`, { status: 'done', summary: `reply ${i}` }, `t${i}`),
    );
    const history = buildHistoryPayload(turns);
    expect(history).toHaveLength(12);
    // The WINDOW keeps the most recent exchanges.
    expect(history.at(-1)?.content).toBe('reply 9');
    expect(history[0]?.content.length).toBeLessThanOrEqual(2000);
    // Every entry passes the wire schema.
    for (const message of history) {
      expect(composerHistoryMessageSchema.safeParse(message).success).toBe(true);
    }
  });
});

describe('toCanvasComposerReferences', () => {
  it('keeps only exact skill/media references and deduplicates by type + id', () => {
    const references: AgentMentionReference[] = [
      { id: 'skill-1', type: 'skill', label: 'Bold', source: 'canvas' },
      { id: 'asset-1', type: 'media_asset', label: 'Hero', source: 'canvas' },
      { id: 'skill-1', type: 'skill', label: 'Bold duplicate', source: 'canvas' },
      { id: 'doc-1', type: 'document', label: 'Brief', source: 'canvas' },
    ];
    expect(toCanvasComposerReferences(references)).toEqual([
      { id: 'skill-1', type: 'skill', label: 'Bold' },
      { id: 'asset-1', type: 'media_asset', label: 'Hero' },
    ]);
  });
});
