import type { ClipTransform } from '../render/effectSpec';

// Where a burn-in sits on the frame, and how big it is.
//
// The engine gives exactly one placement lever: `effects.transform` on a
// `TimelineOverlayRenderItem`. `drawEffectFrame` letterbox-fits the overlay into the
// WHOLE target frame first, then scales about the frame centre and translates by
// `offsetX * targetWidth` / `offsetY * targetHeight`. So a corner is not a flag the
// renderer understands — it is arithmetic on those three numbers, and the arithmetic
// needs both aspect ratios. That is the entire reason this module exists rather than a
// table of five hardcoded offsets: a 16:9 logo and a 1:1 logo pinned to the same corner
// of the same frame need different offsets.
//
// The reference point is the Video Editor's own PiP default
// (`nodes/timeline/multiTrack.ts:14` — `{scale: 0.4, offsetX: 0.28, offsetY: -0.28}`).
// That constant is `top-right` at scale 0.4 with a 0.02 margin for a same-aspect
// overlay, and the test pins this derivation to it so the two placements cannot drift.

export const OVERLAY_POSITIONS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
] as const;

export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number];

export const isOverlayPosition = (value: unknown): value is OverlayPosition =>
  typeof value === 'string' && (OVERLAY_POSITIONS as readonly string[]).includes(value);

export interface OverlayPlacement {
  position: OverlayPosition;
  /** 0..1 — the fraction of the frame the overlay spans on its LONGEST axis. */
  scale: number;
  /** 0..0.5 — clear space kept between the overlay and the frame edge. */
  marginFrac: number;
  /** The overlay image's own width / height. */
  sourceAspect: number;
  /** The base video frame's width / height. */
  targetAspect: number;
}

/** The overlay's half-width and half-height as fractions of the TARGET frame, after
 *  the letterbox fit and the transform scale. */
export function overlayHalfExtents(
  scale: number,
  sourceAspect: number,
  targetAspect: number,
): { halfWidth: number; halfHeight: number } {
  // A zero or non-finite aspect means an image that never decoded; treating it as
  // square keeps the overlay on-frame instead of translating it to NaN.
  const source = Number.isFinite(sourceAspect) && sourceAspect > 0 ? sourceAspect : 1;
  const target = Number.isFinite(targetAspect) && targetAspect > 0 ? targetAspect : 1;
  return source > target
    ? { halfWidth: scale / 2, halfHeight: (scale * target) / (2 * source) }
    : { halfWidth: (scale * source) / (2 * target), halfHeight: scale / 2 };
}

/**
 * The `effects.transform` that lands the overlay at `position` with `marginFrac` of
 * clear space. Corner insets are clamped at 0: an overlay bigger than the margin
 * allows is centred rather than pushed off the frame.
 */
export function overlayTransform(
  placement: OverlayPlacement,
): Required<Pick<ClipTransform, 'scale' | 'offsetX' | 'offsetY'>> {
  const { position, scale, marginFrac } = placement;
  const { halfWidth, halfHeight } = overlayHalfExtents(
    scale,
    placement.sourceAspect,
    placement.targetAspect,
  );
  const inset = (half: number) => Math.max(0, 0.5 - marginFrac - half);
  const x = inset(halfWidth);
  const y = inset(halfHeight);
  // `-0` is a real value in JS and it survives JSON round-trips into node config;
  // `|| 0` collapses it so a centred overlay stores 0 rather than -0.
  const negX = -x || 0;
  const negY = -y || 0;

  switch (position) {
    case 'top-left':
      return { scale, offsetX: negX, offsetY: negY };
    case 'top-right':
      return { scale, offsetX: x, offsetY: negY };
    case 'bottom-left':
      return { scale, offsetX: negX, offsetY: y };
    case 'bottom-right':
      return { scale, offsetX: x, offsetY: y };
    default:
      return { scale, offsetX: 0, offsetY: 0 };
  }
}

/** The overlay's drawn rectangle in TARGET PIXELS — what a bench samples, and what the
 *  config panel previews. Derived from the same numbers `overlayTransform` returns, so
 *  a placement bug shows up in both places at once. */
export function overlayRect(
  placement: OverlayPlacement,
  targetWidth: number,
  targetHeight: number,
): { x: number; y: number; width: number; height: number } {
  const transform = overlayTransform(placement);
  const { halfWidth, halfHeight } = overlayHalfExtents(
    placement.scale,
    placement.sourceAspect,
    placement.targetAspect,
  );
  const centreX = (0.5 + transform.offsetX) * targetWidth;
  const centreY = (0.5 + transform.offsetY) * targetHeight;
  return {
    x: centreX - halfWidth * targetWidth,
    y: centreY - halfHeight * targetHeight,
    width: 2 * halfWidth * targetWidth,
    height: 2 * halfHeight * targetHeight,
  };
}

// ---------------------------------------------------------------------------
// The brand-logo preset
// ---------------------------------------------------------------------------

/** The `logo` piece of a brand book. Structural rather than the contracts type so this
 *  stays importable from a Bun bench that reads the row straight out of Postgres. */
export interface BrandLogoTokenLike {
  storage_path?: string | null;
  treatment_default?: string | null;
}

export type BrandLogoResolution =
  /** A path inside a Supabase bucket — sign it, then use the signed URL. */
  | { status: 'ready'; source: 'storage'; bucket: string; storagePath: string }
  /** Already an absolute URL — use it as-is. Signing it would produce a 400. */
  | { status: 'ready'; source: 'url'; url: string }
  | { status: 'missing'; reason: string };

/**
 * Where a brand's logo lives, or WHY it does not.
 *
 * Deliberately a two-state result rather than `string | null`. A burn-in whose logo
 * silently resolved to nothing renders a clip with no watermark and reports success —
 * the caller has to be handed a reason it can put on screen. `brandEnforcement.ts:162`
 * makes the same call for the Style popover's Logo row; this is the same predicate with
 * the path carried out instead of thrown away.
 *
 * The bucket is a PARAMETER because `tokens.logo.storage_path` does not carry one: both
 * writers (`Continuum-Backend/App/onboarding-inspirations/brandKit.ts`,
 * `src/lib/onboarding/internalizeLogo.ts`) put it in the creative-assets bucket and the
 * path is relative to it. Note this is NOT a `media.assets` row — the canvas media-sign
 * route authorizes against that table and would 403 on this path; sign it against the
 * bucket directly (`createSignedAssetUrl`, the way `brand-system-export.ts:38` does).
 */
export function resolveBrandLogoSource(
  tokens: { logo?: BrandLogoTokenLike | null } | null | undefined,
  bucket: string,
): BrandLogoResolution {
  if (!tokens) {
    return { status: 'missing', reason: 'This brand has no brand book yet.' };
  }
  const storagePath = tokens.logo?.storage_path?.trim();
  if (!storagePath) {
    return {
      status: 'missing',
      reason: 'This brand book has no logo — add one in Brand Settings to burn it in.',
    };
  }
  // `storage_path` is not always a storage path. Two thirds of production brand books
  // carry one, and several hold the ABSOLUTE URL the onboarding scrape found rather than
  // the internalized copy — `internalizeLogo` did not run, or ran after the token was
  // written. Signing one of those against a bucket returns a 400 and the burn-in renders
  // with no logo, so the shape is classified here instead of assumed.
  if (/^https?:\/\//i.test(storagePath)) {
    return { status: 'ready', source: 'url', url: storagePath };
  }
  return { status: 'ready', source: 'storage', bucket, storagePath };
}

/**
 * The placement a logo wants by default: small, top-right, just inside the frame, a
 * touch transparent so it reads as a mark rather than a sticker. The user overrides any
 * of it; this is only what a freshly-picked "Brand logo" source starts at.
 */
export const BRAND_LOGO_PRESET = {
  position: 'top-right',
  scale: 0.12,
  marginFrac: 0.04,
  opacity: 0.9,
} as const satisfies {
  position: OverlayPosition;
  scale: number;
  marginFrac: number;
  opacity: number;
};
