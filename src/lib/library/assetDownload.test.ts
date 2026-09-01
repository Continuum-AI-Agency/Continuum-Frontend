import { afterEach, describe, expect, it } from 'bun:test';
import { downloadLibraryAsset } from './assetDownload';

// The unit under test is the SEQUENCE — sign the stored original, force
// Content-Disposition, click — because that sequence is what four Airtable filings
// kept re-deriving per screen.

type Captured = { url: string; body: unknown };

const realFetch = globalThis.fetch;
const realCreateElement = document.createElement.bind(document);

afterEach(() => {
  globalThis.fetch = realFetch;
  document.createElement = realCreateElement;
});

function stubFetch(response: { ok: boolean; status?: number; json?: unknown }) {
  const calls: Captured[] = [];
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.json ?? {},
    // Recording happens in the factory body so a caller can read `calls` after await.
    ...(calls.push({ url: String(url), body: JSON.parse(init?.body ?? 'null') }) ? {} : {}),
  })) as unknown as typeof fetch;
  return calls;
}

/** Captures the anchor the helper builds instead of letting jsdom navigate. */
function captureAnchor() {
  const clicked: { href: string; download: string }[] = [];
  document.createElement = ((tag: string) => {
    const element = realCreateElement(tag);
    if (tag === 'a') {
      element.click = () => {
        clicked.push({
          href: (element as HTMLAnchorElement).href,
          download: (element as HTMLAnchorElement).download,
        });
      };
    }
    return element;
  }) as typeof document.createElement;
  return clicked;
}

describe('downloadLibraryAsset', () => {
  it('signs the asset head and saves it under its own file name', async () => {
    const calls = stubFetch({ ok: true, json: { signedUrl: 'https://cdn.test/o/abc?token=t' } });
    const clicked = captureAnchor();

    await downloadLibraryAsset({
      brandId: 'brand-1',
      assetId: 'asset-1',
      fileName: 'hero shot.jpg',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/library/sign');
    expect(calls[0]?.body).toEqual({ brandId: 'brand-1', assetId: 'asset-1' });
    expect(clicked).toHaveLength(1);
    // The forced param is the whole reason a cross-origin signed URL saves at all.
    expect(clicked[0]?.href).toBe('https://cdn.test/o/abc?token=t&download=hero%20shot.jpg');
    expect(clicked[0]?.download).toBe('hero shot.jpg');
  });

  it('pins an exact version when the reviewer is looking at one', async () => {
    const calls = stubFetch({ ok: true, json: { signedUrl: 'https://cdn.test/v2' } });
    captureAnchor();

    await downloadLibraryAsset({
      brandId: 'brand-1',
      assetId: 'asset-1',
      fileName: 'v2.jpg',
      versionId: 'ver-2',
    });

    expect(calls[0]?.body).toEqual({
      brandId: 'brand-1',
      assetId: 'asset-1',
      versionId: 'ver-2',
    });
  });

  it('throws rather than silently doing nothing when the sign fails', async () => {
    stubFetch({ ok: false, status: 403 });
    const clicked = captureAnchor();

    await expect(
      downloadLibraryAsset({ brandId: 'b', assetId: 'a', fileName: 'x.jpg' }),
    ).rejects.toThrow('403');
    expect(clicked).toHaveLength(0);
  });

  it('throws when the route answers 200 with no url', async () => {
    stubFetch({ ok: true, json: {} });
    const clicked = captureAnchor();

    await expect(
      downloadLibraryAsset({ brandId: 'b', assetId: 'a', fileName: 'x.jpg' }),
    ).rejects.toThrow('Could not mint a download link.');
    expect(clicked).toHaveLength(0);
  });
});
