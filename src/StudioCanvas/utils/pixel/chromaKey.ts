// Per-pixel chroma key for the `image.chromaKey` / `video.chromaKey` actions.
// The config field names and ranges deliberately mirror `chromaKeyConfig` in
// packages/contracts/src/ai-studio/action-registry.ts so stored node config can
// be handed straight to this function — a mapper between the two would be one
// more place for the two shapes to drift apart. Kept pure (no React, no canvas
// beyond the `ImageData` type) so it runs identically in the DOM preview, in a
// worker, and in a unit test.
//
// ponytail: a plain JS per-pixel loop. Fine for stills and for offline video
// frames; if a realtime preview above 720p ever needs this, the upgrade path is
// a WebGL/WebGPU fragment shader, not a faster loop.

export interface ChromaKeyConfig {
  /** `#rrggbb` — the colour knocked out. */
  color: string;
  /** 0..1 — how far from `color` still counts as background. */
  tolerance: number;
  /** 0..1 — width of the soft edge above the tolerance threshold. */
  softness: number;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const HEX_COLOR = /^#?[0-9a-f]{6}$/i;

/** The largest possible RGB distance, used to normalise `distance` into 0..1. */
const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);

/**
 * Parses `#rrggbb` (with or without the `#`, any case). Returns `undefined`
 * rather than throwing so a malformed colour can be treated as "no keying"
 * instead of taking a render down.
 */
export function parseHexColor(hex: string): RgbColor | undefined {
  if (!HEX_COLOR.test(hex)) return undefined;
  const digits = hex.startsWith('#') ? hex.slice(1) : hex;
  return {
    r: Number.parseInt(digits.slice(0, 2), 16),
    g: Number.parseInt(digits.slice(2, 4), 16),
    b: Number.parseInt(digits.slice(4, 6), 16),
  };
}

/**
 * Mutates `image.data` in place: pixels near `color` lose alpha.
 *
 * Below `tolerance` the pixel is fully knocked out. Between `tolerance` and
 * `tolerance + softness` its existing alpha ramps linearly back to full, which
 * is what keeps a keyed edge from looking cut out with scissors. Alpha is
 * always *multiplied*, never assigned — the source may already carry an alpha
 * channel we have no business discarding.
 *
 * An unparseable `color` is a no-op: bad hex in stored node data must not kill
 * a render.
 */
export function chromaKeyImageData(image: ImageData, config: ChromaKeyConfig): void {
  const key = parseHexColor(config.color);
  if (!key) return;

  const tolerance = clamp01(config.tolerance);
  const softness = clamp01(config.softness);
  const outerEdge = tolerance + softness;

  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - key.r;
    const dg = data[i + 1] - key.g;
    const db = data[i + 2] - key.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db) / MAX_RGB_DISTANCE;

    if (distance <= tolerance) {
      data[i + 3] = 0;
      continue;
    }
    if (distance >= outerEdge) continue;

    // Guarded above by `distance >= outerEdge`, which is always true when
    // softness is 0, so this division can never be by zero.
    const ramp = (distance - tolerance) / softness;
    data[i + 3] = data[i + 3] * ramp;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
