import { describe, expect, it } from 'bun:test';
import type { TimelineItem, TimelineTrack } from '@/StudioCanvas/types';
import { createLibraryTimelineResolver } from './resolveLibraryTimelineSources';
import type { LibraryPoolSource } from './timelineDraftMapping';

const BRAND_ID = '33333333-3333-4333-8333-333333333333';
const VIDEO_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';
const AUDIO_ID = '44444444-4444-4444-8444-444444444444';

const POOL: LibraryPoolSource[] = [
  { nodeId: VIDEO_ID, kind: 'video', label: 'Hero' },
  { nodeId: IMAGE_ID, kind: 'image', label: 'Logo' },
  { nodeId: AUDIO_ID, kind: 'audio', label: 'Voiceover' },
];

type Recorded = { url: string; body?: unknown };

// Stands in for the network: /api/library/sign returns a signed URL keyed on the
// asset id, and that URL then serves bytes.
function createFetchStub(options: { signStatus?: number; blobStatus?: number } = {}) {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    if (url === '/api/library/sign') {
      const body = JSON.parse(String(init?.body)) as { brandId: string; assetId: string };
      calls.push({ url, body });
      const status = options.signStatus ?? 200;
      if (status !== 200) return new Response('nope', { status });
      return Response.json({ signedUrl: `https://signed/${body.assetId}` });
    }
    calls.push({ url });
    const status = options.blobStatus ?? 200;
    if (status !== 200) return new Response('gone', { status });
    return new Response(new Blob([`bytes:${url}`], { type: 'video/mp4' }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function item(overrides: Partial<TimelineItem> & { id: string; order: number }): TimelineItem {
  return { sourceNodeId: VIDEO_ID, kind: 'video', ...overrides };
}

describe('createLibraryTimelineResolver — resolveSources', () => {
  it('signs each source once, sorts by order, and mirrors the canvas field mapping', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const resolver = createLibraryTimelineResolver({ brandId: BRAND_ID, pool: POOL, fetchImpl });

    const resolved = await resolver.resolveSources([
      item({
        id: 'b',
        order: 1,
        sourceNodeId: IMAGE_ID,
        kind: 'image',
        durationSec: 3,
        effects: { opacity: 0.5 },
      }),
      item({
        id: 'a',
        order: 0,
        trimStartSec: 1,
        trimEndSec: 4,
        muteAudio: true,
        volume: 0.6,
        audioFadeInSec: 0.2,
        audioFadeOutSec: 0.3,
        transition: { type: 'crossDissolve', durationSec: 0.4 },
      }),
    ]);

    expect(resolved.map((entry) => entry.itemId)).toEqual(['a', 'b']);
    expect(resolved[0]).toMatchObject({
      itemId: 'a',
      kind: 'video',
      trimStartSec: 1,
      trimEndSec: 4,
      muteAudio: true,
      volume: 0.6,
      audioFadeInSec: 0.2,
      audioFadeOutSec: 0.3,
      transition: { type: 'crossDissolve', durationSec: 0.4 },
    });
    expect(resolved[0].blob).toBeInstanceOf(Blob);
    // Kind is authoritative from the bin, not from the placement.
    expect(resolved[1]).toMatchObject({ itemId: 'b', kind: 'image', durationSec: 3 });
    expect(resolved[1].effects).toEqual({ opacity: 0.5 });

    // Resolution follows timeline order, not the order the items arrived in.
    const signed = calls.filter((call) => call.url === '/api/library/sign');
    expect(signed).toHaveLength(2);
    expect(signed[0].body).toEqual({ brandId: BRAND_ID, assetId: VIDEO_ID });
    expect(signed[1].body).toEqual({ brandId: BRAND_ID, assetId: IMAGE_ID });
  });

  it('signs and downloads a repeated source only once', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const resolver = createLibraryTimelineResolver({ brandId: BRAND_ID, pool: POOL, fetchImpl });

    const resolved = await resolver.resolveSources([
      item({ id: 'a', order: 0, trimEndSec: 2 }),
      item({ id: 'b', order: 1, trimStartSec: 2 }),
      item({ id: 'c', order: 2, trimStartSec: 4 }),
    ]);

    expect(resolved).toHaveLength(3);
    // One sign + one download for three placements of the same source.
    expect(calls).toHaveLength(2);
    expect(resolved[0].blob).toBe(resolved[1].blob);
  });

  it('throws a named error when a placement references a source the bin no longer has', async () => {
    const { fetchImpl } = createFetchStub();
    const resolver = createLibraryTimelineResolver({
      brandId: BRAND_ID,
      pool: [POOL[0]],
      fetchImpl,
    });

    const promise = resolver.resolveSources([
      item({ id: 'a', order: 0 }),
      item({ id: 'b', order: 1, sourceNodeId: IMAGE_ID, kind: 'image' }),
    ]);

    await expect(promise).rejects.toThrow(/Clip 2/);
    await expect(promise).rejects.toThrow(new RegExp(IMAGE_ID));
    await expect(promise).rejects.toThrow(/media bin/);
  });

  it('surfaces a failed sign instead of dropping the clip', async () => {
    const { fetchImpl } = createFetchStub({ signStatus: 403 });
    const resolver = createLibraryTimelineResolver({ brandId: BRAND_ID, pool: POOL, fetchImpl });
    await expect(resolver.resolveSources([item({ id: 'a', order: 0 })])).rejects.toThrow(/403/);
  });

  it('surfaces a failed download instead of dropping the clip', async () => {
    const { fetchImpl } = createFetchStub({ blobStatus: 404 });
    const resolver = createLibraryTimelineResolver({ brandId: BRAND_ID, pool: POOL, fetchImpl });
    await expect(resolver.resolveSources([item({ id: 'a', order: 0 })])).rejects.toThrow(/404/);
  });
});

describe('createLibraryTimelineResolver — resolveOverlays', () => {
  it('maps overlay placements with their absolute start, sharing the base track cache', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const resolver = createLibraryTimelineResolver({ brandId: BRAND_ID, pool: POOL, fetchImpl });

    await resolver.resolveSources([item({ id: 'a', order: 0 })]);
    const tracks: TimelineTrack[] = [
      {
        id: 'track-1',
        kind: 'overlay',
        items: [
          item({
            id: 'o1',
            order: 0,
            startSec: 2.5,
            durationSec: 4,
            volume: 0.2,
            effects: { opacity: 0.3 },
          }),
        ],
      },
    ];

    const overlays = await resolver.resolveOverlays(tracks);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({
      itemId: 'o1',
      kind: 'video',
      startSec: 2.5,
      durationSec: 4,
      volume: 0.2,
      effects: { opacity: 0.3 },
    });
    // Overlays never carry a transition; the canvas resolver omits it too.
    expect(overlays[0]).not.toHaveProperty('transition');
    // Still one sign + one download total: the overlay reuses the base cache.
    expect(calls).toHaveLength(2);
  });

  it('defaults a missing startSec to zero', async () => {
    const { fetchImpl } = createFetchStub();
    const resolver = createLibraryTimelineResolver({ brandId: BRAND_ID, pool: POOL, fetchImpl });
    const overlays = await resolver.resolveOverlays([
      { id: 't', kind: 'overlay', items: [item({ id: 'o1', order: 0, startSec: -3 })] },
    ]);
    expect(overlays[0].startSec).toBe(0);
  });

  it('resolves nothing when there are no overlay items', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const resolver = createLibraryTimelineResolver({ brandId: BRAND_ID, pool: POOL, fetchImpl });
    expect(await resolver.resolveOverlays([{ id: 't', kind: 'overlay', items: [] }])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('throws a named error for an overlay whose source left the bin', async () => {
    const { fetchImpl } = createFetchStub();
    const resolver = createLibraryTimelineResolver({
      brandId: BRAND_ID,
      pool: [POOL[0]],
      fetchImpl,
    });
    await expect(
      resolver.resolveOverlays([
        {
          id: 't',
          kind: 'overlay',
          items: [item({ id: 'o9', order: 0, sourceNodeId: IMAGE_ID, kind: 'image' })],
        },
      ]),
    ).rejects.toThrow(/Overlay clip o9/);
  });
});

describe('createLibraryTimelineResolver — resolveAudioTracks', () => {
  it('resolves absolute-time Library audio into the render shape', async () => {
    const { fetchImpl, calls } = createFetchStub();
    const resolver = createLibraryTimelineResolver({ brandId: BRAND_ID, pool: POOL, fetchImpl });
    const audio = await resolver.resolveAudioTracks([
      {
        id: 'voice-lane',
        kind: 'audio',
        items: [
          item({
            id: 'voice-1',
            order: 0,
            sourceNodeId: AUDIO_ID,
            kind: 'audio',
            startSec: 2,
            trimStartSec: 0.5,
            trimEndSec: 4,
            volume: 0.75,
            audioFadeInSec: 0.2,
            audioFadeOutSec: 0.4,
          }),
        ],
      },
    ]);

    expect(audio[0]).toMatchObject({
      itemId: 'voice-1',
      startSec: 2,
      trimStartSec: 0.5,
      trimEndSec: 4,
      volume: 0.75,
      fadeInSec: 0.2,
      fadeOutSec: 0.4,
    });
    expect(calls).toHaveLength(2);
  });
});
