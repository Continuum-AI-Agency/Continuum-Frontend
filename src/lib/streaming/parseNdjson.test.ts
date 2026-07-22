import { describe, expect, it } from 'bun:test';

import { reelVideoBatchFrameSchema } from '@continuum/contracts';

import { parseNdjson } from './parseNdjson';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const frame of parseNdjson(stream)) out.push(frame);
  return out;
}

describe('parseNdjson', () => {
  it('parses whole lines split across chunk boundaries', async () => {
    // The "reel_st" / "arted" boundary splits a JSON object mid-line.
    const frames = await collect(
      streamFromChunks([
        '{"type":"batch_started","total":1}\n{"type":"reel_st',
        'arted","draftId":"d1"}\n',
        '{"type":"batch_completed","ready":1,"failed":0}\n',
      ]),
    );
    expect(frames).toEqual([
      { type: 'batch_started', total: 1 },
      { type: 'reel_started', draftId: 'd1' },
      { type: 'batch_completed', ready: 1, failed: 0 },
    ]);
  });

  it('emits a trailing line with no final newline', async () => {
    const frames = await collect(
      streamFromChunks(['{"type":"reel_failed","draftId":"d2","error":"x"}']),
    );
    expect(frames).toEqual([{ type: 'reel_failed', draftId: 'd2', error: 'x' }]);
  });

  it('skips blank and malformed lines', async () => {
    const frames = await collect(
      streamFromChunks(['\n{"type":"reel_started","draftId":"d1"}\nnot-json\n\n']),
    );
    expect(frames).toEqual([{ type: 'reel_started', draftId: 'd1' }]);
  });

  it('parses a reel_clips_ready frame that validates against the contract schema', async () => {
    const line = JSON.stringify({
      type: 'reel_clips_ready',
      draftId: 'd1',
      aspectRatio: '9:16',
      durationSec: 12,
      clips: [
        {
          index: 0,
          role: 'hook',
          durationSec: 6,
          clipUrl: 'reel/b/s0.mp4',
          signedClipUrl: 'https://s/0',
        },
        {
          index: 1,
          role: 'cta',
          durationSec: 6,
          clipUrl: 'reel/b/s1.mp4',
          signedClipUrl: 'https://s/1',
        },
      ],
    });
    const [frame] = await collect(streamFromChunks([`${line}\n`]));
    const parsed = reelVideoBatchFrameSchema.safeParse(frame);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'reel_clips_ready') {
      expect(parsed.data.clips).toHaveLength(2);
    }
  });
});
