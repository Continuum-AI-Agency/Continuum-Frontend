import { describe, expect, test } from 'bun:test';
import { createEditorProjectV2, editorProjectV2Schema } from '@continuum/contracts';
import { keyAtPlayhead, localPlayheadSec, motionLayersFromProject } from './motionLayers';

const project = editorProjectV2Schema.parse({
  ...createEditorProjectV2({
    projectId: '11111111-1111-4111-8111-111111111111',
    title: 'Motion',
    width: 1080,
    height: 1920,
  }),
  durationSec: 4,
  tracks: [
    {
      id: 'overlay-1',
      name: 'Overlays',
      kind: 'overlay',
      order: 0,
      clips: [
        {
          id: 'logo',
          name: 'Logo',
          kind: 'overlay',
          mediaKind: 'image',
          timelineStartSec: 1,
          durationSec: 2,
          source: { sourceType: 'library_asset', assetId: 'a', renditionId: 'v' },
          keyframes: [
            {
              id: 'op-0',
              property: 'transform.opacity',
              timeSec: 0,
              value: 0,
              interpolation: 'linear',
            },
            {
              id: 'op-1',
              property: 'transform.opacity',
              timeSec: 2,
              value: 1,
              interpolation: 'linear',
            },
          ],
        },
      ],
    },
  ],
});

describe('motionLayersFromProject', () => {
  test('lists overlay clips with property tracks and clip-local keys', () => {
    const layers = motionLayersFromProject(project);
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({
      clipId: 'logo',
      kind: 'overlay',
      startSec: 1,
      durationSec: 2,
    });
    const opacity = layers[0]?.properties.find((row) => row.property === 'transform.opacity');
    expect(opacity?.keys.map((key) => key.timeSec)).toEqual([0, 2]);
  });
});

describe('localPlayheadSec / keyAtPlayhead', () => {
  test('clamps the playhead into the clip and finds a nearby key', () => {
    const layer = motionLayersFromProject(project)[0];
    if (!layer) throw new Error('expected a layer');
    expect(localPlayheadSec(layer, 0)).toBe(0);
    expect(localPlayheadSec(layer, 2)).toBe(1);
    expect(localPlayheadSec(layer, 4)).toBe(2);
    const opacity = layer.properties.find((row) => row.property === 'transform.opacity');
    expect(keyAtPlayhead(opacity?.keys ?? [], 0)?.id).toBe('op-0');
    expect(keyAtPlayhead(opacity?.keys ?? [], 1)).toBeUndefined();
  });
});
