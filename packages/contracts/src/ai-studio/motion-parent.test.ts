import { expect, test } from 'bun:test';
import { createEditorProjectV2 } from './editor-project-reducer';
import { editorProjectV2Schema } from './editor-project-v2';
import { parentPositionDelta } from './motion-parent';

test('parentPositionDelta adds the parent motion offset', () => {
  const overlay = {
    id: 'overlay',
    name: 'Overlay',
    order: 0,
    kind: 'overlay' as const,
    clips: [
      {
        id: 'parent',
        kind: 'overlay' as const,
        mediaKind: 'image' as const,
        timelineStartSec: 0,
        durationSec: 2,
        source: { sourceType: 'library_asset' as const, assetId: 'a', renditionId: 'v' },
        transform: {
          position: { x: 0.5, y: 0.5, unit: 'normalized' as const },
          scaleX: 1,
          scaleY: 1,
          rotationDeg: 0,
          rotateXDeg: 0,
          rotateYDeg: 0,
          perspective: 0,
          anchorX: 0.5,
          anchorY: 0.5,
          opacity: 1,
        },
        keyframes: [
          {
            id: 'p0',
            property: 'transform.position' as const,
            timeSec: 0,
            value: { x: 0.5, y: 0.5 },
            interpolation: 'linear' as const,
          },
          {
            id: 'p1',
            property: 'transform.position' as const,
            timeSec: 2,
            value: { x: 0.7, y: 0.5 },
            interpolation: 'linear' as const,
          },
        ],
      },
      {
        id: 'child',
        kind: 'overlay' as const,
        mediaKind: 'image' as const,
        timelineStartSec: 0,
        durationSec: 2,
        parentClipId: 'parent',
        source: { sourceType: 'library_asset' as const, assetId: 'b', renditionId: 'v' },
      },
    ],
  };
  const project = editorProjectV2Schema.parse({
    ...createEditorProjectV2({
      projectId: '11111111-1111-4111-8111-111111111111',
      title: 'Parent',
      width: 1080,
      height: 1080,
    }),
    durationSec: 2,
    tracks: [overlay],
  });
  expect(parentPositionDelta(project, 'child', 1).x).toBeCloseTo(0.1);
});
