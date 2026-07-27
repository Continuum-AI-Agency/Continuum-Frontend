import { describe, expect, it } from 'bun:test';
import type { TimelineDocument } from './adapter';
import {
  audioItemDuration,
  patchAudioItem,
  placeAudioItem,
  removeAudioItem,
  resolveAudioPlacements,
} from './audioTrackModel';

describe('audioTracks', () => {
  it('places audio at absolute output time and resolves trim duration', () => {
    const document = placeAudioItem(
      { items: [] },
      { sourceNodeId: 'voice', startSec: 2.5, sourceDurationSec: 8, itemId: 'a1' },
    );
    const patched = patchAudioItem(document, 'a1', { trimStartSec: 1, trimEndSec: 5.5 });
    const placements = resolveAudioPlacements(patched, new Map([['voice', 8]]));

    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({ startSec: 2.5, durationSec: 4.5, endSec: 7 });
  });

  it('clamps gain, fades, start, and non-positive trim ranges', () => {
    const document: TimelineDocument = {
      items: [],
      audioTracks: [
        {
          id: 'audio-1',
          kind: 'audio',
          items: [{ id: 'a1', order: 0, sourceNodeId: 'music', kind: 'audio' }],
        },
      ],
    };
    const patched = patchAudioItem(document, 'a1', {
      startSec: -4,
      trimStartSec: 3,
      trimEndSec: 2,
      volume: 8,
      audioFadeInSec: -1,
    });
    const item = patched.audioTracks?.[0]?.items[0];

    expect(item?.startSec).toBe(0);
    expect(item?.trimEndSec).toBeCloseTo(3.05);
    expect(item?.volume).toBe(4);
    expect(item?.audioFadeInSec).toBe(0);
    expect(audioItemDuration(item!, 10)).toBeCloseTo(0.05);
  });

  it('removes a placement and drops an empty lane', () => {
    const document = placeAudioItem(
      { items: [] },
      { sourceNodeId: 'music', startSec: 0, itemId: 'a1' },
    );
    expect(removeAudioItem(document, 'a1').audioTracks).toEqual([]);
  });
});
