import { describe, expect, test } from 'bun:test';
import { createEditorProjectV2 } from './editor-project-reducer';
import { type EditorNestedSequenceClip, editorProjectV2Schema } from './editor-project-v2';
import { isLocalNestedClip, nestedChildTimeSec, resolveNestedSequence } from './motion-nested';

const identityTransform = {
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

const nestClip = (over: Partial<EditorNestedSequenceClip> = {}): EditorNestedSequenceClip => ({
  id: 'n1',
  kind: 'nested_sequence',
  sequenceId: 'child',
  timelineStartSec: 0,
  durationSec: 2,
  sourceInSec: 0,
  playbackRate: 1,
  audioEnabled: true,
  transform: identityTransform,
  keyframes: [],
  enabled: true,
  locked: false,
  tags: [],
  ...over,
});

describe('nested sequence time', () => {
  test('maps host playhead into the child and freezes after the child ends', () => {
    const clip = { timelineStartSec: 1, sourceInSec: 0.5, playbackRate: 2 };
    expect(nestedChildTimeSec(clip, 4, 1)).toBeCloseTo(0.5);
    expect(nestedChildTimeSec(clip, 4, 2)).toBeCloseTo(2.5);
    expect(nestedChildTimeSec(clip, 4, 4)).toBeCloseTo(4);
  });
});

describe('resolveNestedSequence', () => {
  test('resolves a local nest and ignores a cross-project pointer', () => {
    const host = editorProjectV2Schema.parse({
      ...createEditorProjectV2({
        projectId: 'host',
        title: 'Host',
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
    });
    expect(resolveNestedSequence(host, nestClip())?.id).toBe('child');
    expect(isLocalNestedClip(host, nestClip({ projectId: 'other' }))).toBe(false);
  });
});
