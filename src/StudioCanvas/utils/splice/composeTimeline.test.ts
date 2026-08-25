// The encoder inside composeTimeline cannot run under bun (no OffscreenCanvas, no
// WebCodecs), and mocking mediabunny with `mock.module` is process-wide — the same
// reason actionEngines.test.ts stops at the pure seam. So this file asserts the
// codec/container OPTION seam: the worker frame plumbs into ComposeTimelineOptions,
// the unions stay narrow, and the function accepts the new fields at runtime. The
// encoded pixels are proven by `studio:timeline:parity:e2e:bench`.

import { describe, expect, it } from 'bun:test';
import type { SpliceWorkerInbound } from '../../workers/spliceWorkerProtocol';
import { type ComposeTimelineOptions, composeTimeline } from './composeTimeline';

type TimelineFrame = Extract<SpliceWorkerInbound, { kind: 'start_timeline' }>;

// Compile-time proof that the worker's start_timeline frame threads straight into
// composeTimeline — items structurally, codec and container by the same unions.
const plumb = (frame: TimelineFrame): ComposeTimelineOptions => ({
  items: frame.items,
  videoCodec: frame.videoCodec,
  container: frame.container,
});

describe('composeTimeline codec/container options', () => {
  it('accepts the codec and container the worker threads through', async () => {
    const options = plumb({
      kind: 'start_timeline',
      items: [],
      videoCodec: 'vp9',
      container: 'webm',
    });
    expect(options.videoCodec).toBe('vp9');
    expect(options.container).toBe('webm');
    // Reaches composeTimeline's own guard — the options parse, the function runs.
    await expect(composeTimeline(options)).rejects.toThrow(/at least one item/);
  });

  it('keeps the codec union closed to what the encoder pipeline supports', () => {
    // @ts-expect-error av1 is not a codec this pipeline offers
    const bad: ComposeTimelineOptions = { items: [], videoCodec: 'av1' };
    // @ts-expect-error mkv is not a container this pipeline offers
    const badContainer: ComposeTimelineOptions = { items: [], container: 'mkv' };
    expect(bad.items).toEqual([]);
    expect(badContainer.items).toEqual([]);
  });

  it('defaults both fields to absent so an unset render is byte-identical', () => {
    const options: ComposeTimelineOptions = { items: [] };
    expect(options.videoCodec).toBeUndefined();
    expect(options.container).toBeUndefined();
  });
});
