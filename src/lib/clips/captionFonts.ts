// FontFace registration for caption faces, on BOTH threads.
//
// Why this file has to exist: the burn-in renderer draws on an OffscreenCanvas inside the
// splicer worker, and a worker never inherits `document.fonts`. Before this, `CaptionStyle`
// `fontFamily` was prepended to the ctx.font stack and then silently resolved to Helvetica
// everywhere — a grep for FontFace across the whole Frontend returned nothing. With one
// brand font that read as a nice-to-have; with six presets whose identity IS their typeface
// it makes every preset render identically, which is why the render bench asserts that two
// registered faces produce different text bounding boxes.
//
// The bytes cross to the worker by structured clone, NOT in a transfer list. A transfer
// detaches the ArrayBuffer on the main thread, and the main-thread cache has to survive its
// own document.fonts registration plus every repeat render; the second job would post a
// detached buffer. ~145KB cloned per job is noise beside the video Blob it travels with.

export type CaptionFontSpec = {
  family: string;
  /** Public path, fetched same-origin. */
  url: string;
  /** FontFace `weight` descriptor. A range needs a variable file behind it. */
  weightRange: string;
};

/** What crosses the worker boundary: plain structured-cloneable data, never a FontFace. */
export type CaptionFontPayload = {
  family: string;
  weightRange: string;
  bytes: ArrayBuffer;
};

/**
 * The registrable faces, keyed by the exact family string a CaptionStyle names.
 *
 * Provenance and licences are in public/fonts/README.md. Inter, Montserrat and JetBrains
 * Mono are variable so `emphasis.weight` is not a no-op; Anton ships one weight and is
 * already black.
 */
export const CAPTION_FONTS: Readonly<Record<string, CaptionFontSpec>> = {
  Inter: { family: 'Inter', url: '/fonts/InterVariable.woff2', weightRange: '100 900' },
  Anton: { family: 'Anton', url: '/fonts/Anton-Regular.woff2', weightRange: '400' },
  Montserrat: {
    family: 'Montserrat',
    url: '/fonts/MontserratVariable.woff2',
    weightRange: '100 900',
  },
  'JetBrains Mono': {
    family: 'JetBrains Mono',
    url: '/fonts/JetBrainsMonoVariable.woff2',
    weightRange: '100 800',
  },
};

/** True when a family name has a real file behind it — the honest answer for brand fonts. */
export function isRegistrableCaptionFont(family: string | undefined): boolean {
  return typeof family === 'string' && family in CAPTION_FONTS;
}

export function captionFontSpec(family: string | undefined): CaptionFontSpec | undefined {
  return family ? CAPTION_FONTS[family] : undefined;
}

/**
 * The FontFaceSet for whichever thread this is running on.
 *
 * A window exposes `document.fonts`; a DedicatedWorkerGlobalScope exposes `self.fonts`.
 * Note it is NOT `globalThis.fonts` in the page — reading that gets you undefined and a
 * silent no-op, which is the exact failure mode this whole module exists to end.
 */
function fontFaceSet(): FontFaceSet | undefined {
  if (typeof document !== 'undefined' && document.fonts) return document.fonts;
  const workerScope = globalThis as unknown as { fonts?: FontFaceSet };
  return workerScope.fonts;
}

const byteCache = new Map<string, Promise<ArrayBuffer>>();
const registered = new Set<string>();

async function fetchFontBytes(spec: CaptionFontSpec): Promise<ArrayBuffer> {
  const response = await fetch(spec.url);
  if (!response.ok) {
    throw new Error(`Caption font "${spec.family}" failed to load (${response.status})`);
  }
  return response.arrayBuffer();
}

/**
 * Main thread: fetch each family's bytes once and hand back payloads to ride with a worker
 * job. A family with no registered file is skipped rather than faked — callers surface that
 * to the user through `isRegistrableCaptionFont`.
 */
export async function loadCaptionFonts(families: readonly string[]): Promise<CaptionFontPayload[]> {
  const specs = [...new Set(families)]
    .map(captionFontSpec)
    .filter((s): s is CaptionFontSpec => !!s);
  return Promise.all(
    specs.map(async (spec) => {
      let pending = byteCache.get(spec.family);
      if (!pending) {
        pending = fetchFontBytes(spec);
        byteCache.set(spec.family, pending);
      }
      try {
        // Hand every consumer its own copy: FontFace takes ownership of the buffer it is
        // constructed from, and the same cached ArrayBuffer is posted to the worker too.
        return {
          family: spec.family,
          weightRange: spec.weightRange,
          bytes: (await pending).slice(0),
        };
      } catch (error) {
        byteCache.delete(spec.family); // a network blip must not poison the cache forever
        throw error;
      }
    }),
  );
}

/**
 * Register payloads on this thread's FontFaceSet. Idempotent by family, so the worker can
 * call it at the top of every job without re-parsing the same face.
 *
 * Returns the families that are actually usable now. A caller that renders text before this
 * resolves gets Helvetica, which is why the worker awaits it BEFORE the first draw.
 */
export async function registerCaptionFonts(
  payloads: readonly CaptionFontPayload[],
): Promise<string[]> {
  const fonts = fontFaceSet();
  if (!fonts || typeof FontFace === 'undefined') return [];

  const results = await Promise.all(
    payloads.map(async (payload) => {
      if (registered.has(payload.family)) return payload.family;
      try {
        const face = new FontFace(payload.family, payload.bytes, {
          weight: payload.weightRange,
          style: 'normal',
        });
        await face.load();
        fonts.add(face);
        registered.add(payload.family);
        return payload.family;
      } catch {
        // A face that will not parse must not take the render down with it — the caption
        // still draws, in the fallback stack. The bench is what catches the difference.
        return null;
      }
    }),
  );
  return results.filter((family): family is string => family !== null);
}

/** Fetch + register in one call. The preview path; the worker gets bytes with its job. */
export async function ensureCaptionFonts(families: readonly string[]): Promise<string[]> {
  return registerCaptionFonts(await loadCaptionFonts(families));
}

/** Test seam: forget every cached byte buffer and registration. */
export function resetCaptionFontsForTest(): void {
  byteCache.clear();
  registered.clear();
}
