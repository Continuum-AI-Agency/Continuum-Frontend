import { describe, expect, test } from 'bun:test';
import { createEditorProjectV2, editorProjectV2Schema } from '@continuum/contracts';
import { nestedChildTimeForClip, nestedInstanceStyle } from './nestedSequencePreview';

const transform = {
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
};

describe('nestedChildTimeForClip', () => {
  test('is null outside the instance and maps inside it', () => {
    const clip = {
      id: 'n1',
      kind: 'nested_sequence' as const,
      sequenceId: 'child',
      timelineStartSec: 1,
      durationSec: 2,
      sourceInSec: 0,
      playbackRate: 1,
      audioEnabled: true,
      transform,
      keyframes: [],
      enabled: true,
      locked: false,
      tags: [],
    };
    expect(nestedChildTimeForClip(clip, 2, 0.5)).toBeNull();
    expect(nestedChildTimeForClip(clip, 2, 1.2)).toBeCloseTo(0.2);
    expect(nestedChildTimeForClip(clip, 2, 3.5)).toBeNull();
  });
});

describe('nestedInstanceStyle', () => {
  test('applies instance opacity at the host playhead', () => {
    const project = editorProjectV2Schema.parse({
      ...createEditorProjectV2({
        projectId: '11111111-1111-4111-8111-111111111111',
        title: 'Nest',
        width: 1080,
        height: 1080,
      }),
      durationSec: 4,
      nestedSequences: [
        {
          id: 'child',
          name: 'Child',
          durationSec: 2,
          canvas: { width: 1080, height: 1080 },
          tracks: [],
        },
      ],
      tracks: [
        {
          id: 'nests',
          name: 'Nests',
          order: 0,
          kind: 'nested_sequence',
          clips: [
            {
              id: 'n1',
              kind: 'nested_sequence',
              sequenceId: 'child',
              timelineStartSec: 0,
              durationSec: 2,
              sourceInSec: 0,
              playbackRate: 1,
              audioEnabled: true,
              transform: { ...transform, opacity: 0.5 },
              keyframes: [],
              enabled: true,
              locked: false,
              tags: [],
            },
          ],
        },
      ],
    });
    const clip = project.tracks[0]?.clips[0];
    if (!clip || clip.kind !== 'nested_sequence') throw new Error('expected nest');
    expect(nestedInstanceStyle(project, clip, 0.5).opacity).toBe(0.5);
  });
});
