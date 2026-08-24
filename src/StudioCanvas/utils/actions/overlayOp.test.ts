import { describe, expect, it } from 'bun:test';
import { buildOverlayPlan, isOverlayActionId, resolveOverlayWindow } from './overlayOp';

// COVERAGE GAP, on purpose: `measureVideo` and `runOverlayAction` are NOT tested here.
// Measurement needs a real `<video>` decoder and the encode needs WebCodecs, neither of
// which exists under bun + happy-dom. Both are proven by
// `studio:overlay:burnin:e2e:bench`, which decodes the rendered MP4. Everything that
// decides WHERE and WHEN the burn-in lands is in `buildOverlayPlan`, and that is pure.

const base = {
  blob: new Blob(['clip'], { type: 'video/mp4' }),
  width: 640,
  height: 360,
  durationSec: 4,
};
const logo = { blob: new Blob(['logo'], { type: 'image/png' }), width: 64, height: 64 };

const plan = (config: Record<string, unknown>, actionId = 'video.overlay' as const) =>
  buildOverlayPlan({ actionId, base, overlays: [logo], config });

describe('resolveOverlayWindow', () => {
  it('treats an unset start/end as the whole clip — null is not 0', () => {
    expect(resolveOverlayWindow('video.overlay', { startSec: null, endSec: null }, 4)).toEqual({
      startSec: 0,
      durationSec: 4,
    });
  });

  it('honours a timed window', () => {
    expect(resolveOverlayWindow('video.overlay', { startSec: 1, endSec: 3 }, 4)).toEqual({
      startSec: 1,
      durationSec: 2,
    });
  });

  it('holds an open end to the clip', () => {
    expect(resolveOverlayWindow('video.overlay', { startSec: 2.5, endSec: null }, 4)).toEqual({
      startSec: 2.5,
      durationSec: 1.5,
    });
  });

  it('clamps a window that runs past the clip instead of encoding past the end', () => {
    expect(resolveOverlayWindow('video.overlay', { startSec: 1, endSec: 99 }, 4)).toEqual({
      startSec: 1,
      durationSec: 3,
    });
  });

  it('makes a watermark the whole clip and ignores the window controls', () => {
    expect(resolveOverlayWindow('video.watermark', { startSec: 1, endSec: 2 }, 4)).toEqual({
      startSec: 0,
      durationSec: 4,
    });
  });
});

describe('buildOverlayPlan', () => {
  it('passes the base clip through untouched — no effects, no mute', () => {
    const built = plan({});
    expect(built.items).toHaveLength(1);
    expect(built.items[0].blob).toBe(base.blob);
    // Nothing here may re-grade or silence the source: an unmuted, uneffected base item
    // is what keeps the audio bit-for-bit equivalent through the re-encode.
    expect(built.items[0].effects).toBeUndefined();
    expect(built.items[0].muteAudio).toBeUndefined();
  });

  it('renders the burn-in only inside the window', () => {
    const built = plan({ startSec: 1, endSec: 3 });
    expect(built.window).toEqual({ startSec: 1, durationSec: 2 });
    expect(built.overlays[0].startSec).toBe(1);
    // Always stated: composeTimeline defaults an image overlay to a 3s hold, which
    // would silently outlive a 2s window.
    expect(built.overlays[0].durationSec).toBe(2);
  });

  it('keeps the output at the source frame size', () => {
    const built = plan({});
    expect([built.targetWidth, built.targetHeight]).toEqual([640, 360]);
  });

  it('places the logo by preset, and carries opacity', () => {
    const built = plan({ position: 'bottom-left', scale: 0.2, marginFrac: 0.05, opacity: 0.5 });
    const transform = built.overlays[0].effects?.transform;
    expect(built.overlays[0].effects?.opacity).toBe(0.5);
    expect(transform?.scale).toBe(0.2);
    expect(transform?.offsetX ?? 0).toBeLessThan(0);
    expect(transform?.offsetY ?? 0).toBeGreaterThan(0);
  });

  it('burns in every connected image, not just the first', () => {
    const built = buildOverlayPlan({
      actionId: 'video.overlay',
      base,
      overlays: [logo, { ...logo, width: 128 }],
      config: {},
    });
    expect(built.overlays).toHaveLength(2);
    expect(new Set(built.overlays.map((item) => item.itemId)).size).toBe(2);
  });

  it('mutes every overlay — a burn-in must not touch the mixdown', () => {
    expect(plan({}).overlays.every((item) => item.muteAudio)).toBe(true);
  });

  it('refuses a window that would never be visible, rather than encoding nothing', () => {
    expect(() => plan({ startSec: 3, endSec: 1 })).toThrow(/nothing would be visible/);
    expect(() => plan({ startSec: 9 })).toThrow(/nothing would be visible/);
  });

  it('refuses with no image connected', () => {
    expect(() =>
      buildOverlayPlan({ actionId: 'video.overlay', base, overlays: [], config: {} }),
    ).toThrow(/Connect an image/);
  });

  it('makes a watermark the same plan with the window opened all the way', () => {
    const watermark = plan({ startSec: 1, endSec: 2 }, 'video.watermark');
    expect(watermark.overlays[0].startSec).toBe(0);
    expect(watermark.overlays[0].durationSec).toBe(4);
    expect(watermark.overlays[0].effects).toEqual(plan({}).overlays[0].effects);
  });
});

describe('isOverlayActionId', () => {
  it('claims both catalog ids and nothing else', () => {
    expect(isOverlayActionId('video.overlay')).toBe(true);
    expect(isOverlayActionId('video.watermark')).toBe(true);
    expect(isOverlayActionId('video.speed')).toBe(false);
  });
});
