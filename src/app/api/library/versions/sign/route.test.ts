import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createFakeSupabaseClient, FakeDb } from '../../__tests__/fakeSupabase';

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

import { POST } from './route';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const ASSET_ID = '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22';

function request(body: unknown) {
  return new Request('http://localhost/api/library/versions/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function seed(invoke: (name: string, options: { body: Record<string, unknown> }) => unknown) {
  const client = createFakeSupabaseClient({
    db: new FakeDb(),
    userId: 'uploader-1',
    userEmail: 'uploader@continuum.test',
  });
  Object.assign(client as object, { functions: { invoke } });
  hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);
}

beforeEach(() => {
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(true);
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
});

describe('POST /api/library/versions/sign', () => {
  it('delegates a signed-upload ticket to Creative Operations without an admin client', async () => {
    let invocation: { name: string; body: Record<string, unknown> } | null = null;
    seed(async (name, options) => {
      invocation = { name, body: options.body };
      return {
        data: {
          bucket: 'media-library',
          path: `${BRAND_ID}/${ASSET_ID}/v2/crisp-silver-lynx-20260713-c19435.jpg`,
          token: 'signed-upload-token',
          versionNumber: 2,
        },
        error: null,
      };
    });

    const response = await POST(
      request({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        fileName: 'crisp-silver-lynx-20260713-c19435.jpg',
        mimeType: 'image/jpeg',
      }),
    );

    expect(response.status).toBe(200);
    expect(invocation).toEqual({
      name: 'library-creative-operations',
      body: {
        action: 'sign_version_upload',
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        fileName: 'crisp-silver-lynx-20260713-c19435.jpg',
        mimeType: 'image/jpeg',
      },
    });
    expect(await response.json()).toMatchObject({ versionNumber: 2, token: 'signed-upload-token' });
  });

  it('keeps the Edge Function failure and status visible to the browser', async () => {
    seed(async () => ({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ error: 'Storage bucket unavailable' }), {
          status: 503,
        }),
      },
    }));

    const response = await POST(
      request({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        fileName: 'creative.jpg',
        mimeType: 'image/jpeg',
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Storage bucket unavailable' });
  });
});
