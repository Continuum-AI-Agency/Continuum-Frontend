import { describe, expect, it } from 'bun:test';
import { EDITOR_OVERLAP_TRANSITION_TYPES } from '@continuum/contracts';
import {
  computeOutputPlacements,
  fadeColorFor,
  glitchSlices,
  headFadeFor,
  isOverlapTransition,
  overlapInSecFor,
  overlapTransitionAt,
  tailFadeFor,
  transitionOverlayAt,
} from './transitions';

describe('fadeColorFor / isOverlapTransition', () => {
  it('maps types to colors and flags overlap transitions', () => {
    expect(fadeColorFor('fade')).toBe('#000000');
    expect(fadeColorFor('dipWhite')).toBe('#ffffff');
    expect(fadeColorFor('cut')).toBeNull();
    expect(fadeColorFor('crossDissolve')).toBeNull();
    expect(isOverlapTransition('crossDissolve')).toBe(true);
    expect(isOverlapTransition('slideLeft')).toBe(true);
    expect(isOverlapTransition('zoomIn')).toBe(true);
    expect(isOverlapTransition('fade')).toBe(false);
    expect(isOverlapTransition('cut')).toBe(false);
  });
});

describe('headFadeFor / tailFadeFor', () => {
  it('gives the first clip a full-duration fade-in and internal clips a half', () => {
    expect(headFadeFor({ type: 'fade', durationSec: 1 }, true)).toEqual({
      color: '#000000',
      durationSec: 1,
    });
    expect(headFadeFor({ type: 'fade', durationSec: 1 }, false)).toEqual({
      color: '#000000',
      durationSec: 0.5,
    });
    expect(headFadeFor({ type: 'cut', durationSec: 1 }, true)).toBeUndefined();
  });

  it('derives the outgoing tail fade from the next clip transition', () => {
    expect(tailFadeFor({ type: 'dipWhite', durationSec: 1 })).toEqual({
      color: '#ffffff',
      durationSec: 0.5,
    });
    expect(tailFadeFor(undefined)).toBeUndefined();
  });
});

describe('computeOutputPlacements', () => {
  it('lays clips end-to-end with no overlaps', () => {
    const { placements, totalSec } = computeOutputPlacements([
      { outputDurationSec: 4, crossDissolveInSec: 0 },
      { outputDurationSec: 6, crossDissolveInSec: 0 },
    ]);
    expect(totalSec).toBe(10);
    expect(placements[1].outputStartSec).toBe(4);
    expect(placements[0].outOverlapSec).toBe(0);
    expect(placements[0].soloEndSec).toBe(4);
  });

  it('pulls a cross-dissolving clip left and shortens the total', () => {
    const { placements, totalSec } = computeOutputPlacements([
      { outputDurationSec: 4, crossDissolveInSec: 0 },
      { outputDurationSec: 6, crossDissolveInSec: 1 },
    ]);
    expect(totalSec).toBe(9); // 4 + 6 - 1 overlap
    expect(placements[1].outputStartSec).toBe(3);
    expect(placements[1].inOverlapSec).toBe(1);
    expect(placements[0].outOverlapSec).toBe(1);
    expect(placements[0].soloEndSec).toBe(3); // clip 0 solo ends where the overlap starts
    expect(placements[1].soloStartSec).toBe(4); // clip 1 solo starts after the overlap
  });

  it('clamps an overlap so it cannot consume a whole clip', () => {
    const { placements } = computeOutputPlacements([
      { outputDurationSec: 2, crossDissolveInSec: 0 },
      { outputDurationSec: 5, crossDissolveInSec: 10 },
    ]);
    expect(placements[1].inOverlapSec).toBe(2); // clamped to the shorter clip
  });
});

describe('overlapInSecFor', () => {
  it('returns the duration for any overlap transition and 0 for ramps/cut', () => {
    expect(overlapInSecFor({ type: 'crossDissolve', durationSec: 1.5 })).toBe(1.5);
    expect(overlapInSecFor({ type: 'slideLeft', durationSec: 0.8 })).toBe(0.8);
    expect(overlapInSecFor({ type: 'wipeRight', durationSec: 0.5 })).toBe(0.5);
    expect(overlapInSecFor({ type: 'fade', durationSec: 1 })).toBe(0);
    expect(overlapInSecFor({ type: 'cut', durationSec: 1 })).toBe(0);
    expect(overlapInSecFor(undefined)).toBe(0);
  });
});

describe('overlapTransitionAt', () => {
  it('cross-dissolve ramps only the incoming alpha, no motion', () => {
    const { outgoing, incoming } = overlapTransitionAt('crossDissolve', 0.25, 100, 100);
    expect(outgoing).toMatchObject({ alpha: 1, translateX: 0, scale: 1 });
    expect(incoming).toMatchObject({ alpha: 0.25, translateX: 0, scale: 1 });
  });

  it('slideLeft pushes outgoing left and brings incoming in from the right', () => {
    const { outgoing, incoming } = overlapTransitionAt('slideLeft', 0.5, 100, 100);
    expect(outgoing.translateX).toBe(-50);
    expect(incoming.translateX).toBe(50);
    expect(incoming.alpha).toBe(1);
  });

  it('wipeRight reveals the incoming clip with a growing left-anchored rect', () => {
    expect(overlapTransitionAt('wipeRight', 0, 100, 80).incoming.clip).toEqual({
      x: 0,
      y: 0,
      w: 0,
      h: 80,
    });
    expect(overlapTransitionAt('wipeRight', 1, 100, 80).incoming.clip).toEqual({
      x: 0,
      y: 0,
      w: 100,
      h: 80,
    });
  });

  it('zoomIn scales the incoming clip up with its alpha', () => {
    const { incoming } = overlapTransitionAt('zoomIn', 0.5, 100, 100);
    expect(incoming.scale).toBeCloseTo(0.5, 5);
    expect(incoming.alpha).toBe(0.5);
  });
});

describe('transitionOverlayAt', () => {
  const head = { color: '#000000', durationSec: 1 };
  const tail = { color: '#ffffff', durationSec: 1 };

  it('ramps the head fade 1→0 from color', () => {
    expect(transitionOverlayAt(0, 10, head, undefined)).toEqual({ color: '#000000', alpha: 1 });
    expect(transitionOverlayAt(0.5, 10, head, undefined)).toEqual({ color: '#000000', alpha: 0.5 });
    expect(transitionOverlayAt(1.5, 10, head, undefined)).toBeNull();
  });

  it('ramps the tail fade 0→1 to color at the end', () => {
    // Exactly at the tail-window start there is no wash yet (exclusive boundary).
    expect(transitionOverlayAt(9, 10, undefined, tail)).toBeNull();
    expect(transitionOverlayAt(9.5, 10, undefined, tail)).toEqual({ color: '#ffffff', alpha: 0.5 });
    expect(transitionOverlayAt(10, 10, undefined, tail)).toEqual({ color: '#ffffff', alpha: 1 });
  });

  it('returns null in the clear middle', () => {
    expect(transitionOverlayAt(5, 10, head, tail)).toBeNull();
  });
});

describe('the new transition vocabulary', () => {
  it('overlaps exactly the types the contract says overlap, and flash is a colour ramp', () => {
    for (const type of [
      'blur',
      'whipLeft',
      'whipRight',
      'whipUp',
      'whipDown',
      'zoomBlur',
      'glitch',
    ] as const)
      expect(isOverlapTransition(type)).toBe(true);
    expect(isOverlapTransition('flash')).toBe(false);
    expect(fadeColorFor('flash')).toBe('#ffffff');
    expect(
      ['blur', 'whip', 'zoom_blur', 'glitch'].every((type) =>
        EDITOR_OVERLAP_TRANSITION_TYPES.has(type as never),
      ),
    ).toBe(true);
    expect(EDITOR_OVERLAP_TRANSITION_TYPES.has('flash')).toBe(false);
    expect(overlapInSecFor({ type: 'whipLeft', durationSec: 0.4 })).toBe(0.4);
    expect(overlapInSecFor({ type: 'flash', durationSec: 0.4 })).toBe(0);
  });

  it('a flash snaps white in at the cut and falls away faster than a dip', () => {
    const head = headFadeFor({ type: 'flash', durationSec: 0.4 }, false);
    const dip = headFadeFor({ type: 'dipWhite', durationSec: 0.4 }, false);
    expect(head).toEqual({ color: '#ffffff', durationSec: 0.2, curve: 2.5 });
    expect(dip?.curve).toBeUndefined();
    const flashAt = (local: number) =>
      transitionOverlayAt(local, 4, head, tailFadeFor({ type: 'flash', durationSec: 0.4 }))
        ?.alpha ?? 0;
    const dipAt = (local: number) => transitionOverlayAt(local, 4, dip, undefined)?.alpha ?? 0;
    expect(flashAt(0)).toBe(1);
    expect(flashAt(0.1)).toBeLessThan(dipAt(0.1));
    // Arriving: late then sudden; the very last frame before the cut is white.
    expect(flashAt(3.9)).toBeLessThan(0.5);
    expect(flashAt(3.999)).toBeGreaterThan(0.98);
    expect(flashAt(2)).toBe(0);
  });

  it('a whip moves both shots one way with a smear that is longest mid-whip and gone at rest', () => {
    const at = (k: number) => overlapTransitionAt('whipLeft', k, 1080, 1920);
    expect(at(0).outgoing.translateX).toBe(0);
    expect(at(1).outgoing.translateX).toBe(-1080);
    expect(at(1).incoming.translateX).toBeCloseTo(0, 9);
    expect(at(0.5).incoming.translateX - at(0.5).outgoing.translateX).toBeCloseTo(1080, 6);
    const smear = (k: number) => Math.abs(at(k).outgoing.fx?.trail?.dx ?? 0);
    expect(smear(0.5)).toBeGreaterThan(smear(0.2));
    expect(smear(0.2)).toBeGreaterThan(smear(0.05));
    expect(smear(0)).toBe(0);
    expect(at(0.5).outgoing.fx?.trail?.dy).toBe(0);
    const up = overlapTransitionAt('whipUp', 0.5, 1080, 1920);
    expect(up.outgoing.translateX).toBe(0);
    expect(up.outgoing.translateY).toBeLessThan(0);
    expect(up.outgoing.fx?.trail?.dx).toBe(0);
    expect(overlapTransitionAt('whipRight', 0.5, 1080, 1920).outgoing.translateX).toBeGreaterThan(
      0,
    );
  });

  it('blur and zoom-through peak in the middle and rest sharp at both ends', () => {
    const blur = (k: number) => overlapTransitionAt('blur', k, 1000, 500).incoming;
    expect(blur(0).fx?.blurPx).toBe(0);
    expect(blur(1).fx?.blurPx).toBeCloseTo(0, 9);
    expect(blur(0.5).fx?.blurPx).toBeCloseTo(20, 9);
    expect(blur(0.25).alpha).toBe(0.25);
    const zoom = (k: number) => overlapTransitionAt('zoomBlur', k, 1000, 500);
    expect(zoom(0).outgoing.scale).toBe(1);
    expect(zoom(1).outgoing.scale).toBeCloseTo(2.2, 9);
    expect(zoom(1).incoming.scale).toBe(1);
    expect(zoom(0.5).incoming.fx?.zoomTrail).toBeGreaterThan(zoom(0.1).incoming.fx?.zoomTrail ?? 1);
  });

  it('a glitch cuts hard at the middle and tears hardest there, identically on every render', () => {
    const at = (k: number) => overlapTransitionAt('glitch', k, 1000, 500);
    expect([at(0.49).outgoing.alpha, at(0.49).incoming.alpha]).toEqual([1, 0]);
    expect([at(0.5).outgoing.alpha, at(0.5).incoming.alpha]).toEqual([0, 1]);
    expect(at(0.5).incoming.fx?.rgbSplitPx).toBeCloseTo(25, 9);
    expect(at(0).outgoing.fx?.rgbSplitPx).toBe(0);
    expect(at(0).outgoing.fx?.slices).toEqual([]);
    expect(at(0.5).incoming.fx?.slices).toHaveLength(4);
    expect(at(0.45)).toEqual(at(0.45));
    expect(glitchSlices(3, 1, 1000, 500)).toEqual(glitchSlices(3, 1, 1000, 500));
    expect(glitchSlices(3, 1, 1000, 500)).not.toEqual(glitchSlices(4, 1, 1000, 500));
    for (const slice of glitchSlices(6, 1, 1000, 500)) {
      expect(slice.y).toBeGreaterThanOrEqual(0);
      expect(slice.y + slice.h).toBeLessThanOrEqual(500);
    }
  });
});
