import { describe, expect, it } from 'bun:test';
import type { VideoEditorAgentFrame } from '@continuum/contracts';
import { applyFrame, type Turn, withMentionContext } from './turnState';

const envelope = (seq: number) => ({ eventId: `e${seq}`, seq, ts: '2026-09-29T00:00:00.000Z' });
const fold = (frames: VideoEditorAgentFrame[]): Turn =>
  frames.reduce(applyFrame, {
    id: 't',
    prompt: 'cut the pauses',
    text: '',
    tools: [],
    status: 'running',
    baseRevision: 3,
    committed: false,
    undone: false,
  });

describe('applyFrame', () => {
  it('folds a committing turn into chips, text and a done status', () => {
    const turn = fold([
      { ...envelope(0), type: 'turn_start', data: { turnId: 't', baseRevision: 3 } },
      { ...envelope(1), type: 'tool_start', data: { toolCallId: 'c1', op: 'cut_silence' } },
      {
        ...envelope(2),
        type: 'tool_result',
        data: {
          toolCallId: 'c1',
          op: 'cut_silence',
          ok: true,
          summary: 'Cut 7 pauses · −4.2 s',
          revision: 4,
        },
      },
      { ...envelope(3), type: 'project_revision', data: { revision: 4, fingerprint: 'f' } },
      { ...envelope(4), type: 'text_delta', data: { text: 'Cut 7 ' } },
      { ...envelope(5), type: 'text_delta', data: { text: 'pauses.' } },
      { ...envelope(6), type: 'done', data: { turnId: 't', baseRevision: 3, finalRevision: 4 } },
    ]);
    expect(turn.tools).toEqual([
      { toolCallId: 'c1', op: 'cut_silence', ok: true, summary: 'Cut 7 pauses · −4.2 s' },
    ]);
    expect(turn).toMatchObject({ text: 'Cut 7 pauses.', committed: true, status: 'done' });
  });

  it('reads an aborted turn as stopped, not failed', () => {
    const turn = fold([
      { ...envelope(0), type: 'error', data: { message: 'Stopped.', code: 'aborted' } },
    ]);
    expect(turn.status).toBe('stopped');
    expect(turn.error).toBeUndefined();
  });
});

describe('withMentionContext', () => {
  const mentions = [
    { token: '@Intro', kind: 'clip' as const, id: 'clip-1', detail: '' },
    { token: '@Beach', kind: 'asset' as const, id: 'asset-9', detail: '' },
  ];

  it('appends the exact ids of the mentions still in the prompt', () => {
    expect(withMentionContext('trim @Intro', mentions)).toBe(
      'trim @Intro\n\nMentioned: @Intro = clip clip-1',
    );
  });

  it('leaves a prompt without mentions alone', () => {
    expect(withMentionContext('cut the pauses', mentions)).toBe('cut the pauses');
  });
});
