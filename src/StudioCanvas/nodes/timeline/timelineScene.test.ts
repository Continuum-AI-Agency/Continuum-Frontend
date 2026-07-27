import { describe, expect, test } from 'bun:test';
import type { TimelineDocument } from './adapter';
import { evaluateTimelineScene } from './timelineScene';

const sceneDocument: TimelineDocument = {
  items: [
    {
      id: 'a',
      order: 0,
      sourceNodeId: 'video-a',
      kind: 'video',
      trimStartSec: 0,
      trimEndSec: 4,
    },
    {
      id: 'b',
      order: 1,
      sourceNodeId: 'video-b',
      kind: 'video',
      trimStartSec: 2,
      trimEndSec: 6,
      transition: { type: 'crossDissolve', durationSec: 1 },
      effects: {
        keyframes: [
          { t: 0, transform: { scale: 1 } },
          { t: 1, transform: { scale: 2 } },
        ],
      },
    },
  ],
  overlayTracks: [
    {
      id: 'graphics',
      kind: 'overlay',
      items: [
        {
          id: 'logo',
          order: 0,
          sourceNodeId: 'image-logo',
          kind: 'image',
          startSec: 2,
          durationSec: 3,
          effects: { opacity: 0.75, transform: { scale: 0.5 } },
        },
      ],
    },
  ],
  captionsEnabled: true,
  captionCues: [
    {
      id: 'cue-1',
      startSec: 3,
      endSec: 4,
      words: [{ text: 'hello', startSec: 3, endSec: 4 }],
      style: { textColor: '#ff0000' },
    },
  ],
  captionStyle: {
    textColor: '#ffffff',
    highlightColor: '#ffff00',
    outlineColor: '#000000',
  },
};

describe('evaluateTimelineScene', () => {
  test('returns both base layers during an overlap plus active overlays and captions', () => {
    const scene = evaluateTimelineScene(sceneDocument, 3.5);
    expect(scene.totalDurationSec).toBe(7);
    expect(scene.baseLayers.map((layer) => layer.item.id)).toEqual(['a', 'b']);
    expect(scene.baseLayers[0].transition).toEqual({
      type: 'crossDissolve',
      phase: 'outgoing',
      progress: 0.5,
    });
    expect(scene.baseLayers[1].transition).toEqual({
      type: 'crossDissolve',
      phase: 'incoming',
      progress: 0.5,
    });
    expect(scene.baseLayers[1].sourceTimeSec).toBe(2.5);
    expect(scene.baseLayers[1].transform.scale).toBeCloseTo(1.125);
    expect(scene.overlayLayers.map((layer) => layer.item.id)).toEqual(['logo']);
    expect(scene.overlayLayers[0].opacity).toBe(0.75);
    expect(scene.caption?.cue.id).toBe('cue-1');
    expect(scene.caption?.style.textColor).toBe('#ff0000');
  });

  test('evaluates arbitrary timestamps deterministically and excludes inactive layers', () => {
    const first = evaluateTimelineScene(sceneDocument, 6.5);
    const second = evaluateTimelineScene(sceneDocument, 6.5);
    expect(first).toEqual(second);
    expect(first.baseLayers.map((layer) => layer.item.id)).toEqual(['b']);
    expect(first.overlayLayers).toEqual([]);
    expect(first.caption).toBeUndefined();
    expect(first.baseLayers[0].sourceTimeSec).toBe(5.5);
  });
});
