import { describe, expect, test } from 'bun:test';
import {
  createEditorProjectV2,
  type EditorProjectV2,
  editorProjectV2Schema,
} from '@continuum/contracts';
import {
  chipActive,
  DEFAULT_BRIEF_FIELDS,
  describeBrief,
  GOAL_CHIPS,
  hasFootage,
  placesAsset,
  placesFirstFootage,
} from './briefGoals';

const blank = () =>
  createEditorProjectV2({ projectId: 'p', title: 'Edit', width: 1080, height: 1920 });

const withVideo = (project: EditorProjectV2): EditorProjectV2 =>
  editorProjectV2Schema.parse({
    ...project,
    durationSec: 4,
    tracks: [
      {
        id: 'video-main',
        name: 'Video',
        kind: 'video',
        order: 0,
        enabled: true,
        locked: false,
        muted: false,
        solo: false,
        clips: [
          {
            id: 'clip-1',
            kind: 'video',
            timelineStartSec: 0,
            durationSec: 4,
            enabled: true,
            locked: false,
            tags: [],
            source: { sourceType: 'library_asset', assetId: 'a', renditionId: 'v' },
            sourceInSec: 0,
            playbackRate: 1,
            reverse: false,
            transform: {
              position: { x: 0.5, y: 0.5, unit: 'normalized' },
              scaleX: 1,
              scaleY: 1,
              rotationDeg: 0,
              anchorX: 0.5,
              anchorY: 0.5,
              opacity: 1,
            },
            crop: { left: 0, top: 0, right: 0, bottom: 0 },
            blendMode: 'normal',
            audioEnabled: true,
            effects: [],
            keyframes: [],
          },
        ],
      },
    ],
  });

const chip = (label: string) => GOAL_CHIPS.find((entry) => entry.label === label)?.patch ?? {};

describe('goal chips', () => {
  test('"3 variants" + "30s hook" combine into three 30 s hooks', () => {
    const fields = { ...DEFAULT_BRIEF_FIELDS, ...chip('3 variants'), ...chip('30s hook') };
    expect(fields).toEqual({ kind: 'hook', targetDurationSec: 30, variants: 3 });
    expect(chipActive(chip('3 variants'), fields)).toBe(true);
    expect(chipActive(chip('30s hook'), fields)).toBe(true);
    expect(chipActive(chip('15s teaser'), fields)).toBe(false);
    expect(describeBrief(fields)).toBe('3 variants of a 30 s hook from this footage');
  });
});

describe('the Brief opens by itself', () => {
  const briefed = (project: EditorProjectV2): EditorProjectV2 => ({
    ...project,
    brief: {
      briefId: 'b',
      text: 'hooks',
      kind: 'hook',
      targetDurationSec: 30,
      variantLabel: 'A',
      variantIndex: 0,
    },
  });

  test('when this page places the first footage in a project', () => {
    expect(hasFootage(blank())).toBe(false);
    expect(placesFirstFootage(blank(), { kind: 'video' })).toBe(true);
    expect(placesFirstFootage(blank(), { kind: 'audio' })).toBe(true);
    expect(placesAsset(withVideo(blank()), 'a')).toBe(true);
    expect(placesAsset(withVideo(blank()), 'other')).toBe(false);
  });

  test('never for a still, a project with footage already, or one already briefed', () => {
    expect(placesFirstFootage(blank(), { kind: 'image' })).toBe(false);
    expect(placesFirstFootage(withVideo(blank()), { kind: 'video' })).toBe(false);
    expect(placesFirstFootage(briefed(blank()), { kind: 'video' })).toBe(false);
  });
});
