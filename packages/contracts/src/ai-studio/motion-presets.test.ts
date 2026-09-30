import { describe, expect, test } from 'bun:test';
import {
  CLIP_MOTION_PRESET_IDS,
  type EditorTransform,
  editorEffectInstanceSchema,
  editorKeyframeSchema,
  editorTransformSchema,
  LOOK_EFFECT_IDS,
  lookEffectInstance,
  motionPresetKeyframes,
  motionPresetWindow,
  TEXT_TEMPLATE_IDS,
  TEXT_TEMPLATES,
  textAnimationIdSchema,
  VIDEO_EDITOR_OPS,
} from './index';

const base: EditorTransform = editorTransformSchema.parse({
  position: { x: 0.5, y: 0.3, unit: 'normalized' },
  scaleX: 2,
  scaleY: 2,
  opacity: 0.8,
});

describe('clip motion presets expand to valid V2 keyframes', () => {
  test('every preset yields keyframes the model accepts, inside the clip', () => {
    for (const preset of CLIP_MOTION_PRESET_IDS) {
      const keyframes = motionPresetKeyframes(preset, {
        clipDurationSec: 4,
        base,
        idPrefix: preset,
        atSec: 1,
      });
      expect(keyframes.length).toBeGreaterThan(0);
      for (const keyframe of keyframes) {
        editorKeyframeSchema.parse(keyframe);
        expect(keyframe.timeSec).toBeGreaterThanOrEqual(0);
        expect(keyframe.timeSec).toBeLessThanOrEqual(4);
      }
      expect(new Set(keyframes.map((keyframe) => keyframe.id)).size).toBe(keyframes.length);
    }
  });

  test('an entrance ends exactly where the clip was placed', () => {
    const keyframes = motionPresetKeyframes('slide_in_left', {
      clipDurationSec: 4,
      base,
      idPrefix: 'k',
    });
    const position = keyframes.filter((keyframe) => keyframe.property === 'transform.position');
    expect(position[0]).toMatchObject({ timeSec: 0, value: { x: -0.1, y: 0.3 } });
    expect(position.at(-1)).toMatchObject({ timeSec: 0.5, value: { x: 0.5, y: 0.3 } });
    const opacity = keyframes.filter((keyframe) => keyframe.property === 'transform.opacity');
    expect(opacity.at(-1)?.value).toBe(0.8);
  });

  test('scale presets multiply the clip’s own scale', () => {
    const scaleX = motionPresetKeyframes('pop', { clipDurationSec: 4, base, idPrefix: 'k' }).filter(
      (keyframe) => keyframe.property === 'transform.scaleX',
    );
    expect(scaleX.map((keyframe) => keyframe.value)).toEqual([0.4, 2.24, 2]);
  });

  test('windows: in starts at 0, out ends at the clip end, emphasis clamps, whole spans it', () => {
    expect(motionPresetWindow('fade_in', 4)).toEqual({ startSec: 0, endSec: 0.4 });
    expect(motionPresetWindow('fade_out', 4, { durationSec: 1 })).toEqual({
      startSec: 3,
      endSec: 4,
    });
    expect(motionPresetWindow('punch_in', 4, { atSec: 3.9 })).toEqual({
      startSec: 3.5,
      endSec: 4,
    });
    expect(motionPresetWindow('ken_burns', 4, { durationSec: 1 })).toEqual({
      startSec: 0,
      endSec: 4,
    });
    expect(motionPresetWindow('fade_in', 0.2)).toEqual({ startSec: 0, endSec: 0.2 });
  });
});

describe('looks and templates', () => {
  test('every look is an effect instance the model accepts', () => {
    for (const effect of LOOK_EFFECT_IDS) {
      editorEffectInstanceSchema.parse(lookEffectInstance(effect, { id: `fx-${effect}` }));
    }
    expect(lookEffectInstance('vhs', { id: 'v', strength: 0.5 }).parameters).toEqual({
      amount: 0.5,
    });
    expect(lookEffectInstance('pixelate', { id: 'p', strength: 0 }).parameters).toEqual({
      blockPx: 2,
    });
    expect(lookEffectInstance('tint', { id: 't' }).parameters.color).toBe('#ff7a00');
  });

  test('every template has one primary layer and only known animations', () => {
    for (const id of TEXT_TEMPLATE_IDS) {
      const { layers } = TEXT_TEMPLATES[id];
      expect(layers.filter((layer) => layer.role === 'primary')).toHaveLength(1);
      for (const layer of layers) {
        textAnimationIdSchema.parse(layer.animationIn);
        textAnimationIdSchema.parse(layer.animationOut);
      }
    }
  });

  test('the motion ops parse their minimal inputs', () => {
    const projectId = '00000000-0000-4000-8000-000000000000';
    expect(
      VIDEO_EDITOR_OPS.add_text.input.parse({
        projectId,
        template: 'lower_third',
        text: 'Ana Ruiz',
        secondaryText: 'Coach',
        startSec: 1,
      }),
    ).toMatchObject({ kind: 'title', durationSec: 3 });
    expect(
      VIDEO_EDITOR_OPS.animate_clip.input.parse({ projectId, clipId: 'c', preset: 'pop' }),
    ).toMatchObject({ preset: 'pop' });
    expect(
      VIDEO_EDITOR_OPS.add_transition.input.parse({
        projectId,
        fromClipId: 'a',
        type: 'crossfade',
      }),
    ).toMatchObject({ durationSec: 0.5 });
    expect(
      VIDEO_EDITOR_OPS.apply_effect.input.parse({ projectId, clipId: 'c', effect: 'vhs' }),
    ).toMatchObject({ strength: 0.6, remove: false });
    expect(VIDEO_EDITOR_OPS.add_clip.input.parse({ projectId, assetId: 'a' })).toMatchObject({
      atSec: 0,
      newTrack: false,
    });
  });
});
