import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { versionSignUploadResponseSchema } from '@continuum/contracts';

type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testCreateSupabaseAdminClient?: (...args: unknown[]) => unknown;
  __testCallerHasBrandAccess?: (...args: unknown[]) => unknown;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseServerClient?.(...args),
}));
mock.module('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseAdminClient?.(...args),
}));
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: (...args: unknown[]) => hooks.__testCallerHasBrandAccess?.(...args),
}));

import { POST } from './route';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const ASSET_ID = '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22';

type DbResult = { data: unknown; error: { message: string } | null };

// Minimal chainable stub: every builder method returns the chain, awaiting it
// resolves the queued result for the table it was created from.
function createAdminStub(plan: Record<string, DbResult[]>, signedBuckets: string[]) {
  const chain = (result: DbResult) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'order', 'limit', 'maybeSingle', 'single']) {
      query[method] = () => query;
    }
    query.then = (
      onfulfilled?: (value: DbResult) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onfulfilled, onrejected);
    return query;
  };
  return {
    schema: (schemaName: string) => ({
      from(table: string) {
        return chain(plan[`${schemaName}.${table}`]?.shift() ?? { data: null, error: null });
      },
    }),
    storage: {
      from(bucket: string) {
        signedBuckets.push(bucket);
        return {
          createSignedUploadUrl: (path: string) =>
            Promise.resolve({
              data: { signedUrl: `https://upload/${path}`, token: 'upload-token', path },
              error: null,
            }),
        };
      },
    },
  };
}

function signRequest(body: unknown) {
  return new Request('http://localhost/api/library/versions/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  hooks.__testCreateSupabaseServerClient = () =>
    Promise.resolve({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'uploader-1' } }, error: null }),
      },
    });
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(true);
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCreateSupabaseAdminClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
});

describe('POST /api/library/versions/sign', () => {
  it("mints an upload ticket at brand/asset/vN with a sanitized name on the asset's own bucket", async () => {
    const signedBuckets: string[] = [];
    hooks.__testCreateSupabaseAdminClient = () =>
      createAdminStub(
        {
          'media.assets': [{ data: { id: ASSET_ID, bucket: 'brand-profile-assets' }, error: null }],
          'media.asset_versions': [{ data: { version_number: 2 }, error: null }],
        },
        signedBuckets,
      );

    const response = await POST(
      signRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        fileName: 'Final Cut (v3).MP4',
        mimeType: 'video/mp4',
      }),
    );
    expect(response.status).toBe(200);

    const body = versionSignUploadResponseSchema.parse(await response.json());
    expect(body.versionNumber).toBe(3);
    expect(body.bucket).toBe('brand-profile-assets');
    expect(body.path).toBe(`${BRAND_ID}/${ASSET_ID}/v3/final-cut-v3.mp4`);
    expect(body.token).toBe('upload-token');
    expect(signedBuckets).toEqual(['brand-profile-assets']);
  });

  it('numbers the first versioned upload as v2 (the head is implicit v1)', async () => {
    hooks.__testCreateSupabaseAdminClient = () =>
      createAdminStub(
        {
          'media.assets': [{ data: { id: ASSET_ID, bucket: 'media-library' }, error: null }],
          'media.asset_versions': [{ data: null, error: null }],
        },
        [],
      );

    const response = await POST(
      signRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        fileName: 'a.png',
        mimeType: 'image/png',
      }),
    );
    expect(response.status).toBe(200);
    const body = versionSignUploadResponseSchema.parse(await response.json());
    expect(body.versionNumber).toBe(2);
  });

  it('404s for an asset outside the brand and 422s malformed bodies', async () => {
    hooks.__testCreateSupabaseAdminClient = () =>
      createAdminStub({ 'media.assets': [{ data: null, error: null }] }, []);

    const missing = await POST(
      signRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        fileName: 'a.png',
        mimeType: 'image/png',
      }),
    );
    expect(missing.status).toBe(404);

    const malformed = await POST(signRequest({ brandId: BRAND_ID }));
    expect(malformed.status).toBe(422);
  });
});
