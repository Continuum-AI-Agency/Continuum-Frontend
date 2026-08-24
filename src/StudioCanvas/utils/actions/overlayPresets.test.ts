import { describe, expect, it } from 'bun:test';
import {
  BRAND_LOGO_PRESET,
  type OVERLAY_POSITIONS,
  overlayHalfExtents,
  overlayRect,
  overlayTransform,
  resolveBrandLogoSource,
} from './overlayPresets';

// The Video Editor's own PiP default, verbatim from `nodes/timeline/multiTrack.ts:14`.
// It is READ-ONLY from here (a different owner's file), so it is pinned as a literal:
// if that constant moves, this test says so instead of the two placements silently
// disagreeing about where "top right" is.
const PIP_DEFAULT = { scale: 0.4, offsetX: 0.28, offsetY: -0.28 };

const square = { sourceAspect: 1, targetAspect: 1 };

describe('overlayTransform', () => {
  it('reproduces the Video Editor PiP default at top-right, scale 0.4, margin 0.02', () => {
    const transform = overlayTransform({
      position: 'top-right',
      scale: 0.4,
      marginFrac: 0.02,
      ...square,
    });
    expect(transform.scale).toBeCloseTo(PIP_DEFAULT.scale, 10);
    expect(transform.offsetX).toBeCloseTo(PIP_DEFAULT.offsetX, 10);
    expect(transform.offsetY).toBeCloseTo(PIP_DEFAULT.offsetY, 10);
  });

  it('mirrors the four corners around the frame centre', () => {
    const at = (position: (typeof OVERLAY_POSITIONS)[number]) =>
      overlayTransform({ position, scale: 0.2, marginFrac: 0.05, ...square });

    const topRight = at('top-right');
    expect(at('top-left')).toEqual({ ...topRight, offsetX: -topRight.offsetX });
    expect(at('bottom-right')).toEqual({ ...topRight, offsetY: -topRight.offsetY });
    expect(at('bottom-left')).toEqual({
      ...topRight,
      offsetX: -topRight.offsetX,
      offsetY: -topRight.offsetY,
    });
  });

  it('puts centre at the frame centre, whatever the size or margin', () => {
    for (const scale of [0.05, 0.4, 1]) {
      expect(overlayTransform({ position: 'center', scale, marginFrac: 0.3, ...square })).toEqual({
        scale,
        offsetX: 0,
        offsetY: 0,
      });
    }
  });

  it('offsets a wide logo differently from a tall one on the same frame', () => {
    // The whole reason this is arithmetic and not a table: a 4:1 banner and a 1:4
    // sliver pinned to the same corner of a 16:9 frame sit at different offsets.
    const banner = overlayTransform({
      position: 'bottom-right',
      scale: 0.3,
      marginFrac: 0.04,
      sourceAspect: 4,
      targetAspect: 16 / 9,
    });
    const sliver = overlayTransform({
      position: 'bottom-right',
      scale: 0.3,
      marginFrac: 0.04,
      sourceAspect: 0.25,
      targetAspect: 16 / 9,
    });
    expect(banner.offsetX).not.toBeCloseTo(sliver.offsetX, 3);
    expect(banner.offsetY).not.toBeCloseTo(sliver.offsetY, 3);
  });

  it('centres rather than pushing an oversized overlay off the frame', () => {
    const transform = overlayTransform({
      position: 'top-left',
      scale: 1,
      marginFrac: 0.4,
      ...square,
    });
    expect(transform).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it('survives a source that never decoded', () => {
    const transform = overlayTransform({
      position: 'top-right',
      scale: 0.2,
      marginFrac: 0.04,
      sourceAspect: 0,
      targetAspect: Number.NaN,
    });
    expect(Number.isFinite(transform.offsetX)).toBe(true);
    expect(Number.isFinite(transform.offsetY)).toBe(true);
  });
});

describe('overlayHalfExtents', () => {
  it('pins the LONGEST axis to the scale fraction', () => {
    // Wider than the frame -> width is the limiting axis.
    expect(overlayHalfExtents(0.4, 4, 16 / 9).halfWidth).toBeCloseTo(0.2, 10);
    // Taller than the frame -> height is.
    expect(overlayHalfExtents(0.4, 0.25, 16 / 9).halfHeight).toBeCloseTo(0.2, 10);
  });
});

describe('overlayRect', () => {
  it('lands a 64px square logo inside the top-right corner of a 640x360 frame', () => {
    const rect = overlayRect(
      {
        position: 'top-right',
        scale: 0.15,
        marginFrac: 0.04,
        sourceAspect: 1,
        targetAspect: 640 / 360,
      },
      640,
      360,
    );
    expect(rect.x).toBeGreaterThan(320);
    expect(rect.y).toBeLessThan(180);
    expect(rect.x + rect.width).toBeLessThanOrEqual(640);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    // 0.15 of the SHORT axis here (the logo is square, the frame is wide).
    expect(rect.height).toBeCloseTo(0.15 * 360, 6);
    expect(rect.width).toBeCloseTo(rect.height, 6);
  });
});

describe('resolveBrandLogoSource', () => {
  const bucket = 'brand-profile-assets';

  it('carries the path out when the brand book has a logo', () => {
    expect(
      resolveBrandLogoSource({ logo: { storage_path: 'b/branding/logo.png' } }, bucket),
    ).toEqual({ status: 'ready', source: 'storage', bucket, storagePath: 'b/branding/logo.png' });
  });

  it('passes an already-absolute logo URL through instead of signing it', () => {
    // Real production shape: several brand books hold the scraped URL rather than the
    // internalized copy. Signing that against a bucket 400s and the burn-in silently
    // renders with no logo.
    expect(
      resolveBrandLogoSource({ logo: { storage_path: 'https://x.test/logo.png' } }, bucket),
    ).toEqual({ status: 'ready', source: 'url', url: 'https://x.test/logo.png' });
  });

  it('says WHY there is no logo instead of resolving to nothing', () => {
    // The failure this guards: a burn-in that silently resolves to no image renders a
    // clip with no watermark and reports success.
    const noBook = resolveBrandLogoSource(null, bucket);
    const noLogo = resolveBrandLogoSource({ logo: { storage_path: null } }, bucket);
    expect(noBook.status).toBe('missing');
    expect(noLogo.status).toBe('missing');
    expect(noBook.status === 'missing' && noBook.reason.length).toBeGreaterThan(0);
    expect(noLogo.status === 'missing' && noLogo.reason).toMatch(/no logo/i);
  });

  it('agrees with brandBookAvailability about whether a logo exists', () => {
    for (const tokens of [
      null,
      { logo: null },
      { logo: { storage_path: '  ' } },
      { logo: { storage_path: 'p' } },
    ]) {
      const available = !!tokens?.logo?.storage_path?.trim();
      expect(resolveBrandLogoSource(tokens, bucket).status === 'ready').toBe(available);
    }
  });
});

describe('BRAND_LOGO_PRESET', () => {
  it('lands inside the top-right corner of a 16:9 frame', () => {
    const rect = overlayRect(
      { ...BRAND_LOGO_PRESET, sourceAspect: 1, targetAspect: 16 / 9 },
      1920,
      1080,
    );
    expect(rect.x).toBeGreaterThan(1920 / 2);
    expect(rect.x + rect.width).toBeLessThanOrEqual(1920);
    expect(rect.y).toBeGreaterThan(0);
    expect(rect.y + rect.height).toBeLessThan(1080 / 2);
  });
});
