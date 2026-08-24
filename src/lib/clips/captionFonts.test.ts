import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  CAPTION_FONTS,
  captionFontSpec,
  isRegistrableCaptionFont,
  loadCaptionFonts,
  registerCaptionFonts,
  resetCaptionFontsForTest,
} from './captionFonts';

type FakeFace = { family: string; descriptors: { weight?: string }; loaded: boolean };

const originalFetch = globalThis.fetch;
const originalFontFace = (globalThis as { FontFace?: unknown }).FontFace;
const originalDocument = (globalThis as { document?: unknown }).document;

let fetchCalls: string[] = [];
let added: FakeFace[] = [];
let failLoadFor: string | null = null;

function installBrowserDoubles(): void {
  fetchCalls = [];
  added = [];
  failLoadFor = null;

  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    fetchCalls.push(url);
    // A distinct byte length per family so a mixed-up cache is visible.
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(url.length) };
  }) as unknown as typeof fetch;

  (globalThis as { FontFace?: unknown }).FontFace = class {
    family: string;
    descriptors: { weight?: string };
    loaded = false;
    constructor(family: string, _bytes: ArrayBuffer, descriptors: { weight?: string }) {
      this.family = family;
      this.descriptors = descriptors;
    }
    async load(): Promise<void> {
      if (failLoadFor === this.family) throw new Error('bad face');
      this.loaded = true;
    }
  };

  (globalThis as { document?: unknown }).document = {
    fonts: { add: (face: FakeFace) => added.push(face) },
  };
}

beforeEach(() => {
  resetCaptionFontsForTest();
  installBrowserDoubles();
});

afterEach(() => {
  resetCaptionFontsForTest();
  globalThis.fetch = originalFetch;
  if (originalFontFace === undefined) delete (globalThis as { FontFace?: unknown }).FontFace;
  else (globalThis as { FontFace?: unknown }).FontFace = originalFontFace;
  if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document;
  else (globalThis as { document?: unknown }).document = originalDocument;
});

describe('CAPTION_FONTS', () => {
  it('carries exactly the four preset faces, each pointing at a public /fonts path', () => {
    expect(Object.keys(CAPTION_FONTS).sort()).toEqual([
      'Anton',
      'Inter',
      'JetBrains Mono',
      'Montserrat',
    ]);
    for (const [key, spec] of Object.entries(CAPTION_FONTS)) {
      expect(spec.family).toBe(key);
      expect(spec.url.startsWith('/fonts/')).toBe(true);
      expect(spec.url.endsWith('.woff2')).toBe(true);
    }
  });

  it('gives every variable face a weight RANGE, so emphasis.weight is not a silent no-op', () => {
    expect(CAPTION_FONTS.Inter.weightRange).toBe('100 900');
    expect(CAPTION_FONTS.Montserrat.weightRange).toBe('100 900');
    expect(CAPTION_FONTS['JetBrains Mono'].weightRange).toBe('100 800');
    // Anton genuinely has one weight; a range would be a lie.
    expect(CAPTION_FONTS.Anton.weightRange).toBe('400');
  });
});

describe('isRegistrableCaptionFont', () => {
  it('is the honest answer for a brand family with no file behind it', () => {
    expect(isRegistrableCaptionFont('Inter')).toBe(true);
    expect(isRegistrableCaptionFont('JetBrains Mono')).toBe(true);
    expect(isRegistrableCaptionFont('Gotham Rounded')).toBe(false);
    expect(isRegistrableCaptionFont(undefined)).toBe(false);
    expect(captionFontSpec('Gotham Rounded')).toBeUndefined();
  });
});

describe('loadCaptionFonts', () => {
  it('fetches each requested family once and returns its bytes', async () => {
    const payloads = await loadCaptionFonts(['Anton', 'Inter']);
    expect(payloads.map((p) => p.family).sort()).toEqual(['Anton', 'Inter']);
    expect(payloads.every((p) => p.bytes.byteLength > 0)).toBe(true);
    expect(fetchCalls).toHaveLength(2);
  });

  it('caches bytes across calls — a second render must not re-download the face', async () => {
    await loadCaptionFonts(['Anton']);
    await loadCaptionFonts(['Anton']);
    expect(fetchCalls).toHaveLength(1);
  });

  it('hands every consumer a distinct buffer, so one FontFace cannot detach another', async () => {
    const [first] = await loadCaptionFonts(['Anton']);
    const [second] = await loadCaptionFonts(['Anton']);
    expect(first.bytes).not.toBe(second.bytes);
    expect(first.bytes.byteLength).toBe(second.bytes.byteLength);
  });

  it('de-duplicates repeated families in one request', async () => {
    const payloads = await loadCaptionFonts(['Inter', 'Inter', 'Inter']);
    expect(payloads).toHaveLength(1);
    expect(fetchCalls).toHaveLength(1);
  });

  it('skips a family with no registered file rather than inventing a URL', async () => {
    const payloads = await loadCaptionFonts(['Gotham Rounded', 'Anton']);
    expect(payloads.map((p) => p.family)).toEqual(['Anton']);
    expect(fetchCalls).toHaveLength(1);
  });

  it('does not poison the cache when a fetch fails', async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(loadCaptionFonts(['Anton'])).rejects.toThrow(/Anton/);

    installBrowserDoubles();
    const payloads = await loadCaptionFonts(['Anton']);
    expect(payloads).toHaveLength(1);
  });
});

describe('registerCaptionFonts', () => {
  it('registers each face on the thread FontFaceSet with its weight descriptor', async () => {
    const families = await registerCaptionFonts(await loadCaptionFonts(['Inter', 'Anton']));
    expect(families.sort()).toEqual(['Anton', 'Inter']);
    expect(added).toHaveLength(2);
    expect(added.find((f) => f.family === 'Inter')?.descriptors.weight).toBe('100 900');
    expect(added.every((f) => f.loaded)).toBe(true);
  });

  it('is idempotent by family, so a worker can call it on every job', async () => {
    await registerCaptionFonts(await loadCaptionFonts(['Anton']));
    await registerCaptionFonts(await loadCaptionFonts(['Anton']));
    expect(added).toHaveLength(1);
  });

  it('drops a face that will not parse instead of taking the render down', async () => {
    failLoadFor = 'Anton';
    const families = await registerCaptionFonts(await loadCaptionFonts(['Anton', 'Inter']));
    expect(families).toEqual(['Inter']);
    expect(added.map((f) => f.family)).toEqual(['Inter']);
  });

  it('returns nothing when the environment has no FontFace at all', async () => {
    const payloads = await loadCaptionFonts(['Anton']);
    delete (globalThis as { FontFace?: unknown }).FontFace;
    expect(await registerCaptionFonts(payloads)).toEqual([]);
  });

  it('falls back to the worker global fonts set when there is no document', async () => {
    const payloads = await loadCaptionFonts(['Anton']);
    delete (globalThis as { document?: unknown }).document;
    const workerAdded: FakeFace[] = [];
    (globalThis as { fonts?: unknown }).fonts = { add: (f: FakeFace) => workerAdded.push(f) };
    try {
      expect(await registerCaptionFonts(payloads)).toEqual(['Anton']);
      expect(workerAdded.map((f) => f.family)).toEqual(['Anton']);
    } finally {
      delete (globalThis as { fonts?: unknown }).fonts;
    }
  });
});
