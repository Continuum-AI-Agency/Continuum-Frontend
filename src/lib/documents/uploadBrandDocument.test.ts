/**
 * The browser half of attaching a file to Draft with AI: the type gate, the object written to
 * Storage and the metadata the server is told. A CSV that Excel labels `application/vnd.ms-excel`
 * used to be refused here as "Unsupported file type" and never reached the draft.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const upload = mock(async (_path: string, _file: File, _options: { contentType?: string }) => ({
  error: null as { message: string } | null,
}));
const remove = mock(async (_paths: string[]) => ({ error: null }));

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ storage: { from: () => ({ upload, remove }) } }),
}));
mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  requireBrowserAccessToken: async () => 'token',
}));

import { uploadBrandDocument } from './uploadBrandDocument';

const BRAND = '22222222-2222-4222-8222-222222222222';
const originalFetch = globalThis.fetch;
const recorded = mock(async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body)) as { displayName: string };
  return new Response(JSON.stringify({ document: { id: 'doc', name: body.displayName } }), {
    status: 200,
  });
});

beforeEach(() => {
  upload.mockClear();
  remove.mockClear();
  recorded.mockClear();
  globalThis.fetch = recorded as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sentBody = () => JSON.parse(String(recorded.mock.calls[0]?.[1].body)) as { mimeType: string };

describe('uploadBrandDocument', () => {
  test.each([
    ['report.pdf', 'application/pdf', 'application/pdf'],
    ['offers.csv', 'text/csv', 'text/csv'],
    ['offers.csv', 'application/vnd.ms-excel', 'text/csv'],
    ['offers.csv', 'application/csv', 'text/csv'],
  ])('uploads %s reported as %s and records it as %s', async (name, reported, recordedAs) => {
    await uploadBrandDocument({
      brandId: BRAND,
      file: new File(['a,b\n1,2'], name, { type: reported }),
    });
    expect(upload.mock.calls[0]?.[2].contentType).toBe(recordedAs);
    expect(sentBody().mimeType).toBe(recordedAs);
  });

  test('refuses a type the extractor cannot read, by name, before anything is uploaded', async () => {
    await expect(
      uploadBrandDocument({
        brandId: BRAND,
        file: new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' }),
      }),
    ).rejects.toThrow('Unsupported file type: application/x-msdownload');
    expect(upload).not.toHaveBeenCalled();
  });

  test('refuses an oversized file before anything is uploaded', async () => {
    const big = new File([new Uint8Array(1)], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    await expect(uploadBrandDocument({ brandId: BRAND, file: big })).rejects.toThrow(
      'File exceeds 25 MB limit',
    );
    expect(upload).not.toHaveBeenCalled();
  });
});
