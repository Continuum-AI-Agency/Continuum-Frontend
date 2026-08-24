// The video ops' config→payload mappers. Everything here is pure, which is the point:
// the encode is proven by `studio:actions:video:e2e:bench` on decoded pixels, and what
// unit tests can actually pin is that each op's knobs reach the render spec at all.
//
// NOT covered here: `runLongExposureAction`, which needs a decoder. Its pure halves are
// tested in `../splice/longExposure.test.ts`, and the blend itself is a bench assertion.

import { describe, expect, it } from 'bun:test';
import { ACTION_DEFS } from '@continuum/contracts';
import { FILTER_PRESETS } from '../render/effectSpec';
import {
  blurEffects,
  cameraShakeKeyframes,
  chromaKeyEffects,
  coverScale,
  cropDimensions,
  cropEffects,
  EFFECT_PRESETS_NEEDING_SPEC_WORK,
  effectPresetEffects,
  FILTER_PRESET_MAP,
  filterEffects,
  gradeEffects,
  kenBurnsEffects,
  padDimensions,
  parseAspectRatio,
  scaleAdjustments,
  splitAtCuts,
  splitRanges,
  stitchItems,
} from './videoOps';

const defaults = (id: keyof typeof ACTION_DEFS): Record<string, unknown> =>
  ACTION_DEFS[id].config.parse({}) as Record<string, unknown>;

const blob = (name: string): Blob => new Blob([name], { type: 'video/mp4' });

describe('gradeEffects', () => {
  it('carries all eight registry knobs onto the render spec', () => {
    const spec = gradeEffects({
      brightness: 1.2,
      contrast: 0.8,
      saturation: 1.5,
      hueRotate: -30,
      sepia: 0.2,
      grayscale: 0.1,
      invert: 0.3,
      opacity: 0.9,
    });
    expect(spec.adjustments).toEqual({
      brightness: 1.2,
      contrast: 0.8,
      saturation: 1.5,
      hueRotate: -30,
      sepia: 0.2,
      grayscale: 0.1,
      invert: 0.3,
    });
    expect(spec.opacity).toBe(0.9);
  });

  it('is the identity on the op’s own defaults', () => {
    const spec = gradeEffects(defaults('video.grade'));
    expect(spec.adjustments).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      hueRotate: 0,
      sepia: 0,
      grayscale: 0,
      invert: 0,
    });
    expect(spec.opacity).toBe(1);
  });

  it('falls back per field rather than handing NaN to the encoder', () => {
    expect(gradeEffects({ brightness: 'bright' }).adjustments?.brightness).toBe(1);
    expect(gradeEffects({ contrast: Number.NaN }).adjustments?.contrast).toBe(1);
  });
});

describe('filterEffects', () => {
  it('maps every registry preset name onto a real render preset', () => {
    const registryNames = (ACTION_DEFS['video.filter'].config.parse({}) as { preset: string })
      .preset;
    expect(registryNames).toBe('none');
    for (const [registry, spec] of Object.entries(FILTER_PRESET_MAP)) {
      if (spec === 'none') continue;
      expect(FILTER_PRESETS[spec], `${registry} → ${spec}`).toBeDefined();
    }
  });

  it('emits nothing for "none" so the clip is untouched', () => {
    expect(filterEffects({ preset: 'none', intensity: 1 })).toEqual({});
  });

  it('applies a preset at full intensity', () => {
    expect(filterEffects({ preset: 'noir', intensity: 1 }).adjustments).toEqual(
      FILTER_PRESETS.noir,
    );
  });

  it('dials the SAME preset back through intensity', () => {
    // The bug this pins: emitting `filterPreset` instead of interpolated adjustments
    // makes the registry's intensity slider do nothing at all.
    const half = filterEffects({ preset: 'noir', intensity: 0.5 }).adjustments;
    expect(half?.grayscale).toBeCloseTo(0.5, 6);
    const noirContrast = FILTER_PRESETS.noir.contrast ?? 1;
    expect(half?.contrast).toBeCloseTo(1 + (noirContrast - 1) * 0.5, 6);
    expect(filterEffects({ preset: 'noir', intensity: 0 }).adjustments).toEqual({
      grayscale: 0,
      contrast: 1,
      brightness: 1,
    });
  });

  it('treats "faded" as the render spec’s vintage', () => {
    expect(filterEffects({ preset: 'faded', intensity: 1 }).adjustments).toEqual(
      FILTER_PRESETS.vintage,
    );
  });

  it('ignores a preset name the render spec has never heard of', () => {
    expect(filterEffects({ preset: 'kodachrome', intensity: 1 })).toEqual({});
  });
});

describe('scaleAdjustments', () => {
  it('leaves a key the preset does not set alone', () => {
    expect(scaleAdjustments({ grayscale: 1 }, 1)).toEqual({ grayscale: 1 });
  });

  it('clamps intensity to 0..1', () => {
    expect(scaleAdjustments({ grayscale: 1 }, 5).grayscale).toBe(1);
    expect(scaleAdjustments({ grayscale: 1 }, -2).grayscale).toBe(0);
  });
});

describe('blurEffects', () => {
  it('maps the pixel radius onto the blur adjustment', () => {
    expect(blurEffects({ radiusPx: 24 }).adjustments?.blur).toBe(24);
    expect(blurEffects(defaults('video.blur')).adjustments?.blur).toBe(8);
  });

  it('never emits a negative radius', () => {
    expect(blurEffects({ radiusPx: -10 }).adjustments?.blur).toBe(0);
  });
});

describe('kenBurnsEffects', () => {
  it('pushes in and pulls out symmetrically', () => {
    expect(kenBurnsEffects({ direction: 'in', amount: 0.2 }).kenBurns).toEqual({
      from: { scale: 1 },
      to: { scale: 1.2 },
    });
    expect(kenBurnsEffects({ direction: 'out', amount: 0.2 }).kenBurns).toEqual({
      from: { scale: 1.2 },
      to: { scale: 1 },
    });
  });

  it('pans on the axis the direction names, with headroom to cover the travel', () => {
    const left = kenBurnsEffects({ direction: 'left', amount: 0.4 }).kenBurns;
    expect(left?.from).toEqual({ scale: 1.4, offsetX: 0.2 });
    expect(left?.to).toEqual({ scale: 1.4, offsetX: -0.2 });
    const down = kenBurnsEffects({ direction: 'down', amount: 0.4 }).kenBurns;
    expect(down?.from).toEqual({ scale: 1.4, offsetY: -0.2 });
    expect(down?.to).toEqual({ scale: 1.4, offsetY: 0.2 });
  });

  it('never travels further than the scale can cover', () => {
    // Travel beyond (scale-1)/2 drags black in from the edge.
    for (const amount of [0.05, 0.3, 1]) {
      const from = kenBurnsEffects({ direction: 'right', amount }).kenBurns?.from ?? {};
      expect(Math.abs(from.offsetX ?? 0)).toBeLessThanOrEqual(((from.scale ?? 1) - 1) / 2 + 1e-9);
    }
  });

  it('accepts the op’s own defaults', () => {
    expect(kenBurnsEffects(defaults('video.kenBurns')).kenBurns).toEqual({
      from: { scale: 1 },
      to: { scale: 1.2 },
    });
  });
});

describe('cameraShakeKeyframes', () => {
  it('is deterministic — the same node re-renders to the same bytes', () => {
    expect(cameraShakeKeyframes(1)).toEqual(cameraShakeKeyframes(1));
  });

  it('spans the whole clip and stays inside its own headroom', () => {
    const stops = cameraShakeKeyframes(1);
    expect(stops[0].t).toBe(0);
    expect(stops[stops.length - 1].t).toBe(1);
    for (const stop of stops) {
      const transform = stop.transform ?? {};
      const slack = ((transform.scale ?? 1) - 1) / 2;
      expect(Math.abs(transform.offsetX ?? 0)).toBeLessThanOrEqual(slack + 1e-9);
      expect(Math.abs(transform.offsetY ?? 0)).toBeLessThanOrEqual(slack + 1e-9);
    }
  });

  it('is still enough keyframes for effectSpec to interpolate', () => {
    expect(cameraShakeKeyframes(1).length).toBeGreaterThanOrEqual(2);
  });
});

describe('effectPresetEffects', () => {
  it('passes a clip through untouched on "none"', () => {
    expect(effectPresetEffects(defaults('video.effect'))).toEqual({});
  });

  it('runs the effectSpec looks straight through', () => {
    expect(effectPresetEffects({ preset: 'dream', intensity: 1 }).adjustments).toEqual(
      FILTER_PRESETS.dream,
    );
  });

  it('maps blur, shake and the two zooms without new draw code', () => {
    expect(effectPresetEffects({ preset: 'blur', intensity: 0.5 }).adjustments?.blur).toBe(10);
    expect(effectPresetEffects({ preset: 'cameraShake', intensity: 1 }).keyframes).toHaveLength(12);
    expect(effectPresetEffects({ preset: 'zoomIn', intensity: 1 }).kenBurns?.to.scale).toBeCloseTo(
      1.25,
      6,
    );
    expect(
      effectPresetEffects({ preset: 'zoomOut', intensity: 1 }).kenBurns?.from.scale,
    ).toBeCloseTo(1.25, 6);
  });

  it('refuses the presets that need a new spec primitive, BY NAME', () => {
    // A silent passthrough on "VHS" is a node that claims an effect and emits the
    // input — the one outcome worse than an error.
    for (const preset of EFFECT_PRESETS_NEEDING_SPEC_WORK) {
      expect(() => effectPresetEffects({ preset, intensity: 1 })).toThrow(
        /needs a new draw primitive/,
      );
    }
  });

  it('refuses an unknown preset by listing the ones that work', () => {
    expect(() => effectPresetEffects({ preset: 'sparkle', intensity: 1 })).toThrow(
      /Unknown effect "sparkle"/,
    );
  });
});

describe('aspect ratio geometry', () => {
  it('parses the shapes the registry regex allows, and refuses the useless ones', () => {
    expect(parseAspectRatio('16:9')).toBeCloseTo(16 / 9, 6);
    expect(parseAspectRatio('1.91:1')).toBeCloseTo(1.91, 6);
    expect(parseAspectRatio('0:1')).toBeUndefined();
    expect(parseAspectRatio(9)).toBeUndefined();
    expect(parseAspectRatio(undefined)).toBeUndefined();
  });

  it('crops INSIDE the source and pads OUTSIDE it', () => {
    // 640x480 → 1:1. A crop may only shrink; a pad may only grow.
    expect(cropDimensions(640, 480, 1)).toEqual({ width: 480, height: 480 });
    expect(padDimensions(640, 480, 1)).toEqual({ width: 640, height: 640 });
  });

  it('crops a tall source on the other axis', () => {
    expect(cropDimensions(480, 640, 1)).toEqual({ width: 480, height: 480 });
    expect(padDimensions(480, 640, 1)).toEqual({ width: 640, height: 640 });
  });

  it('is a no-op when the source already has the ratio', () => {
    expect(cropDimensions(1080, 1080, 1)).toEqual({ width: 1080, height: 1080 });
    expect(padDimensions(1080, 1080, 1)).toEqual({ width: 1080, height: 1080 });
  });
});

describe('coverScale', () => {
  it('is 1 when the shapes already match', () => {
    expect(coverScale(1000, 1000, 500, 500)).toBeCloseTo(1, 6);
  });

  it('scales the letterboxed fit up until the short axis is filled', () => {
    // 640x480 letterboxed into a 480x480 box leaves a 480x360 rect; covering it needs
    // 480/360 = 1.333…
    expect(coverScale(640, 480, 480, 480)).toBeCloseTo(4 / 3, 6);
  });

  it('never divides by a collapsed rect', () => {
    expect(coverScale(0, 0, 100, 100)).toBe(1);
  });

  it('is what cropEffects puts on the transform', () => {
    const target = cropDimensions(640, 480, 1);
    expect(cropEffects(640, 480, target).transform?.scale).toBeCloseTo(
      coverScale(640, 480, target.width, target.height),
      6,
    );
  });
});

describe('chromaKeyEffects', () => {
  it('hands the registry config through unchanged — the two shapes are the same', () => {
    expect(chromaKeyEffects(defaults('video.greenscreen')).chromaKey).toEqual({
      color: '#00ff00',
      tolerance: 0.3,
      softness: 0.1,
    });
  });

  it('clamps a hand-edited tolerance instead of trusting it', () => {
    expect(chromaKeyEffects({ tolerance: 9, softness: -1 }).chromaKey).toEqual({
      color: '#00ff00',
      tolerance: 1,
      softness: 0,
    });
  });
});

describe('stitchItems', () => {
  it('keeps wiring order and gives the first clip no incoming transition', () => {
    const items = stitchItems([blob('a'), blob('b'), blob('c')], {
      transition: 'crossDissolve',
      transitionSec: 0.4,
    });
    expect(items.map((item) => item.itemId)).toEqual([
      'action-stitch-0',
      'action-stitch-1',
      'action-stitch-2',
    ]);
    expect(items[0].transition).toBeUndefined();
    expect(items[1].transition).toEqual({ type: 'crossDissolve', durationSec: 0.4 });
    expect(items[2].transition).toEqual({ type: 'crossDissolve', durationSec: 0.4 });
  });

  it('emits a hard cut when the transition is "none" or has no duration', () => {
    for (const config of [
      { transition: 'none', transitionSec: 0.5 },
      { transition: 'crossDissolve', transitionSec: 0 },
    ]) {
      expect(stitchItems([blob('a'), blob('b')], config)[1].transition).toBeUndefined();
    }
  });

  it('accepts the op’s own defaults', () => {
    expect(stitchItems([blob('a'), blob('b')], defaults('video.stitch'))[1].transition).toBe(
      undefined,
    );
  });
});

describe('splitRanges', () => {
  it('cuts one clip into two contiguous parts that cover the whole source', () => {
    expect(splitRanges(10, { atSec: 4 })).toEqual([
      { startSec: 0, endSec: 4 },
      { startSec: 4, endSec: 10 },
    ]);
  });

  it('refuses a cut at, before, or past the clip’s own bounds', () => {
    // A cut at 0 or at the duration produces a zero-length part, which composeTimeline
    // rejects far deeper in with a much worse message.
    expect(() => splitRanges(10, { atSec: 0 })).toThrow(/outside the clip/);
    expect(() => splitRanges(10, { atSec: 10 })).toThrow(/outside the clip/);
    expect(() => splitRanges(10, { atSec: 11 })).toThrow(/outside the clip/);
  });

  it('refuses a clip with no duration', () => {
    expect(() => splitRanges(0, { atSec: 1 })).toThrow(/no duration/);
  });

  it('generalises to N cuts, so widening the config is not an engine change', () => {
    expect(splitAtCuts(9, [6, 3, 3])).toEqual([
      { startSec: 0, endSec: 3 },
      { startSec: 3, endSec: 6 },
      { startSec: 6, endSec: 9 },
    ]);
  });
});
