import { afterAll, afterEach, expect, spyOn, test } from 'bun:test';
import * as supabaseClient from '@/lib/supabase/client';
import { fetchTemplateSources, streamTemplateSources } from './templateSources';

const BRAND = '22222222-2222-4222-8222-222222222222';
const [A, B, C] = ['a', 'b', 'c'].map((letter) => `${letter.repeat(8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);

function summary(assetId: string) {
  return {
    assetId,
    brandId: BRAND,
    versionId: crypto.randomUUID(),
    family: 'after_effects',
    parseState: 'pending',
    parser: null,
    parse: null,
    fonts: [],
    ratios: [],
    slotCount: null,
    forgeRunId: null,
    forgeState: null,
    templateKey: null,
    displayName: null,
    parseError: null,
    parsedAt: null,
    createdAt: '2026-10-14T00:00:00Z',
    updatedAt: null,
  };
}

// Three pages behind two cursors; the middle page is empty, as a page whose rows are all hidden is.
const PAGES: Record<string, { items: unknown[]; nextCursor: string | null }> = {
  first: { items: [summary(A as string), summary(B as string)], nextCursor: 'c1' },
  c1: { items: [], nextCursor: 'c2' },
  c2: { items: [summary(C as string)], nextCursor: null },
};

const requested: URL[] = [];
const session = spyOn(supabaseClient, 'createSupabaseBrowserClient').mockReturnValue({
  auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
} as never);
const network = spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
  const url = new URL(String(input), 'http://api.test');
  requested.push(url);
  return Response.json(PAGES[url.searchParams.get('cursor') ?? 'first']);
}) as typeof fetch);

afterEach(() => {
  requested.length = 0;
});
afterAll(() => {
  session.mockRestore();
  network.mockRestore();
});

test('the list arrives a page at a time, each read resuming from the cursor before it', async () => {
  const pages: string[][] = [];
  for await (const page of streamTemplateSources(BRAND, 2))
    pages.push(page.map((source) => source.assetId));
  expect(pages).toEqual([[A, B], [], [C]]);
  expect(requested.map((url) => url.searchParams.get('cursor'))).toEqual([null, 'c1', 'c2']);
  expect(requested.every((url) => url.searchParams.get('limit') === '2')).toBe(true);
});

test('a caller that needs the whole list gets every page joined', async () => {
  expect((await fetchTemplateSources(BRAND)).map((source) => source.assetId)).toEqual([A, B, C]);
});
