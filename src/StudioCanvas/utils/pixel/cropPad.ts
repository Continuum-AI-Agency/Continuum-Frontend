import { computeLetterboxRect, type FitRect } from '../splice/letterbox';

// Aspect-ratio refitting for the `image.crop` / `image.pad` actions — the two halves
// of "change the aspect ratio", which differ only in what they do with the part that
// does not fit: crop throws it away, pad keeps it and fills the margins.
//
// The geometry lives here rather than in `imageOps` because it is the part that gets
// a refit wrong, and it is pure — no canvas, so it is testable in bun.
//
// `computeCoverRect` is deliberately the exact inverse of `computeLetterboxRect`, and
// pad's placement IS `computeLetterboxRect` (imported, never reimplemented). Two
// copies of "how do I fit a rectangle in a rectangle" is how the splice preview and
// the splice export drifted apart before; `letterbox.ts` is frozen and stays the one
// authority for the fit direction.

/** Parses `16:9`, `1:1`, `4:5`, `1.91:1` into a width/height ratio. */
export function parseAspectRatio(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  // `0:1` and `1:0` both parse as numbers and both make every downstream division
  // meaningless, so they are rejected here rather than producing a 0px canvas.
  if (!(width > 0) || !(height > 0)) return undefined;
  return width / height;
}

/**
 * The region OF THE SOURCE that fills a `targetWidth` × `targetHeight` box without
 * letterboxing — the inverse of `computeLetterboxRect`, whose rect is in TARGET
 * coordinates and leaves margins. This one is in SOURCE coordinates and leaves none.
 *
 * Centred on both axes, so a crop takes an equal bite off each side.
 */
export function computeCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): FitRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    // Source is the wider shape: keep its full height, take a bite off each side.
    const width = Math.round(sourceHeight * targetAspect);
    return { x: Math.round((sourceWidth - width) / 2), y: 0, width, height: sourceHeight };
  }

  const height = Math.round(sourceWidth / targetAspect);
  return { x: 0, y: Math.round((sourceHeight - height) / 2), width: sourceWidth, height };
}

export interface RefitPlan {
  /** Output canvas size. */
  readonly width: number;
  readonly height: number;
  /** Crop: the source region to read. Pad: the full source. */
  readonly source: FitRect;
  /** Where that region lands on the output canvas. */
  readonly destination: FitRect;
}

/**
 * Crop the source to `aspect`, keeping the centre. NEVER UPSCALES: the output is the
 * cropped region at its own pixel size, so a 1000×1000 source cropped to 16:9 comes
 * out 1000×563, not 1920×1080. Interpolating a crop up to some nominal size invents
 * detail and is the reason a "crop" used to come back softer than its input.
 */
export function planCropToAspect(
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
): RefitPlan {
  const source = computeCoverRect(sourceWidth, sourceHeight, aspect, 1);
  const width = Math.max(1, source.width);
  const height = Math.max(1, source.height);
  return { width, height, source, destination: { x: 0, y: 0, width, height } };
}

/**
 * Pad the source out to `aspect`, filling the new margins. Also never upscales: the
 * output is the SMALLEST box of that ratio the source fits inside at 1:1, so the
 * source pixels are copied, not resampled.
 */
export function planPadToAspect(
  sourceWidth: number,
  sourceHeight: number,
  aspect: number,
): RefitPlan {
  const safeWidth = Math.max(1, Math.round(sourceWidth));
  const safeHeight = Math.max(1, Math.round(sourceHeight));
  const sourceAspect = safeWidth / safeHeight;

  // Grow the short axis only. The other branch would shrink the long axis, which is
  // a crop wearing a pad's name.
  const width = sourceAspect > aspect ? safeWidth : Math.max(1, Math.round(safeHeight * aspect));
  const height = sourceAspect > aspect ? Math.max(1, Math.round(safeWidth / aspect)) : safeHeight;

  return {
    width,
    height,
    source: { x: 0, y: 0, width: safeWidth, height: safeHeight },
    // The frozen letterbox fit, reused rather than rederived. It centres the source
    // in the output box, which for a pad IS the margin split.
    destination: computeLetterboxRect(safeWidth, safeHeight, width, height),
  };
}
