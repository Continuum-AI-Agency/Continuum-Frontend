import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testCallerHasBrandAccess?: (...args: unknown[]) => unknown;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseServerClient?.(...args),
}));
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: (...args: unknown[]) => hooks.__testCallerHasBrandAccess?.(...args),
}));

import { GET } from './route';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const ASSET_ID = '11111111-2222-4333-8444-555555555555';

type DbResult = { data: unknown; error: { message: string; code?: string } | null };
type Resolve = (columns: string) => DbResult;

class QueryStub implements PromiseLike<DbResult> {
  private columns = '';
  constructor(private readonly resolve: Resolve) {}
  select(columns: string) {
    this.columns = columns;
    return this;
  }
  eq() {
    return this;
  }
  is() {
    return this;
  }
  maybeSingle() {
    return this;
  }
  then<T1 = DbResult, T2 = never>(
    onfulfilled?: ((value: DbResult) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.resolve(this.columns)).then(onfulfilled, onrejected);
  }
}

function setClient(row: DbResult | Resolve, user: { id: string } | null = { id: 'viewer-1' }) {
  const resolve = typeof row === 'function' ? row : () => row;
  hooks.__testCreateSupabaseServerClient = () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user }, error: null }) },
      schema: () => ({ from: () => new QueryStub(resolve) }),
    });
}

function getRequest(params: Record<string, string>) {
  return new Request(`http://localhost/api/library/transcript?${new URLSearchParams(params)}`);
}

beforeEach(() => {
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(true);
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
});

describe('GET /api/library/transcript', () => {
  it('returns the timecoded segments for a transcribed video', async () => {
    setClient({
      data: {
        transcript: 'Cold pressed.\nNothing else.',
        transcript_segments: [
          { startMs: 0, endMs: 1500, text: 'Cold pressed.' },
          { startMs: 1500, endMs: 3000, text: 'Nothing else.' },
        ],
        transcript_source: 'gemini_video',
      },
      error: null,
    });

    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      assetId: ASSET_ID,
      transcript: 'Cold pressed.\nNothing else.',
      transcriptSegments: [
        { startMs: 0, endMs: 1500, text: 'Cold pressed.' },
        { startMs: 1500, endMs: 3000, text: 'Nothing else.' },
      ],
      transcriptSource: 'gemini_video',
      transcriptLanguage: null,
    });
  });

  it('returns the stored spoken language', async () => {
    setClient({
      data: {
        transcript: 'Hola.',
        transcript_segments: [{ startMs: 0, endMs: 900, text: 'Hola.' }],
        transcript_source: 'gemini_video',
        transcript_language: 'es',
      },
      error: null,
    });
    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    expect(await response.json()).toMatchObject({ transcriptLanguage: 'es' });
  });

  it('still serves the transcript before the language column exists', async () => {
    const selects: string[] = [];
    setClient((columns) => {
      selects.push(columns);
      return columns.includes('transcript_language')
        ? {
            data: null,
            error: {
              code: '42703',
              message: 'column assets.transcript_language does not exist',
            },
          }
        : {
            data: { transcript: 'Hi.', transcript_segments: null, transcript_source: 'x' },
            error: null,
          };
    });
    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ transcript: 'Hi.', transcriptLanguage: null });
    expect(selects).toHaveLength(2);
  });

  it('500s any other query failure instead of retrying it', async () => {
    setClient({ data: null, error: { code: '57014', message: 'timeout' } });
    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    expect(response.status).toBe(500);
  });

  it('passes through analyzed-no-speech distinctly from never-transcribed', async () => {
    setClient({
      data: { transcript: '', transcript_segments: [], transcript_source: 'gemini_video' },
      error: null,
    });
    const analyzed = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    expect(await analyzed.json()).toMatchObject({ transcript: '', transcriptSegments: [] });

    setClient({
      data: { transcript: null, transcript_segments: null, transcript_source: null },
      error: null,
    });
    const never = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    expect(await never.json()).toMatchObject({ transcript: null, transcriptSegments: null });
  });

  it('drops a malformed segment instead of failing the whole read', async () => {
    setClient({
      data: {
        transcript: 'Only one good line.',
        transcript_segments: [
          { startMs: 0, endMs: 900, text: 'Only one good line.' },
          { startMs: 'oops', text: 42 },
        ],
        transcript_source: 'gemini_video',
      },
      error: null,
    });

    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    const body = (await response.json()) as { transcriptSegments: unknown[] };
    expect(body.transcriptSegments).toEqual([
      { startMs: 0, endMs: 900, text: 'Only one good line.' },
    ]);
  });

  it('401s an unauthenticated caller and 403s one without brand access', async () => {
    setClient({ data: null, error: null }, null);
    expect((await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }))).status).toBe(401);

    setClient({ data: null, error: null });
    hooks.__testCallerHasBrandAccess = () => Promise.resolve(false);
    expect((await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }))).status).toBe(403);
  });

  it('404s an asset that is not in the brand, and 422s a malformed query', async () => {
    setClient({ data: null, error: null });
    expect((await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }))).status).toBe(404);
    expect((await GET(getRequest({ brandId: 'nope', assetId: ASSET_ID }))).status).toBe(422);
  });
});
