import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    (
      globalThis as { __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown }
    ).__testCreateSupabaseServerClient?.(...args),
}));

type FunnelCall = { path: string; method?: string; body?: unknown };
const funnelCalls: FunnelCall[] = [];
let funnelError: unknown = null;

// The durable write is no longer this route's own UPDATE — it goes through the Backend's
// planner funnel, so what this suite verifies is the REQUEST that funnel receives.
mock.module('@/lib/api/http.server', () => ({
  httpServer: {
    request: async (options: FunnelCall) => {
      funnelCalls.push(options);
      if (funnelError) throw funnelError;
      return {
        draftId: '44444444-4444-4444-8444-444444444444',
        format: 'image',
        updatedAt: '2026-09-09T12:00:00.000Z',
      };
    },
  },
  request: async () => undefined,
}));

mock.module('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: (...args: unknown[]) =>
    (
      globalThis as { __testCreateSupabaseAdminClient?: (...params: unknown[]) => unknown }
    ).__testCreateSupabaseAdminClient?.(...args),
}));

import { ApiError } from '@/lib/api/errors';
import { POST } from './route';

const BRAND_ID = '33333333-3333-4333-8333-333333333333';
const REGISTERED_ASSET_ID = '55555555-5555-4555-8555-555555555555';
const REGISTERED_VERSION_ID = '66666666-6666-4666-8666-666666666666';
const DRAFT_UPDATED_AT = '2026-09-09T11:59:00.000Z';

function applyRequest(): Request {
  return new Request('http://localhost/api/organic/ai-studio/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: 'planner_ai_apply_v1',
      draftId: 'draft-1',
      brandProfileId: BRAND_ID,
      postType: 'post',
      platform: 'instagram',
      overwrite: true,
      contentPatch: { captionPreview: 'Updated caption' },
      assets: [
        {
          role: 'primary',
          kind: 'image',
          sourceDataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5M4V8AAAAASUVORK5CYII=',
        },
      ],
    }),
  });
}

/** A signed-in user with brand access, a working bucket, and a registrable library. */
function seedApplyClients(): void {
  (
    globalThis as { __testCreateSupabaseAdminClient?: (...params: unknown[]) => unknown }
  ).__testCreateSupabaseAdminClient = () => ({
    schema: (schema: string) => ({
      rpc: async () => ({
        data: {
          assetId: REGISTERED_ASSET_ID,
          versionId: REGISTERED_VERSION_ID,
          lineageCount: 0,
          status: 'created',
        },
        error: null,
      }),
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          single: async () =>
            schema === 'organic' && table === 'organic_calendar_drafts'
              ? { data: { updated_at: DRAFT_UPDATED_AT }, error: null }
              : { data: { id: 'asset-1' }, error: null },
        };
        return query;
      },
    }),
  });

  (
    globalThis as { __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown }
  ).__testCreateSupabaseServerClient = mock().mockResolvedValue({
    auth: { getUser: mock().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
    schema: mock().mockReturnValue({ rpc: mock().mockResolvedValue({ data: true, error: null }) }),
    storage: {
      from: mock().mockReturnValue({
        upload: mock().mockResolvedValue({ error: null }),
        createSignedUrl: mock().mockResolvedValue({
          data: { signedUrl: 'https://signed.example.com/file.png' },
          error: null,
        }),
      }),
    },
  });
}

describe('POST /api/organic/ai-studio/apply', () => {
  beforeEach(() => {
    mock.restore();
    funnelCalls.length = 0;
    funnelError = null;
  });

  afterEach(() => {
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = undefined;
    (
      globalThis as {
        __testCreateSupabaseAdminClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseAdminClient = undefined;
  });

  it('returns 400 for invalid payload', async () => {
    const response = await POST(
      new Request('http://localhost/api/organic/ai-studio/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('persists assets and returns normalized apply payload', async () => {
    const uploadMock = mock().mockResolvedValue({ error: null });
    const createSignedUrlMock = mock().mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/file.png' },
      error: null,
    });
    const rpcMock = mock().mockResolvedValue({ data: true, error: null });
    const getUserMock = mock().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    // Registration now goes through media.library_execute_operation, so what this
    // captures is the Creative Operations payload rather than a raw assets row.
    const registerOperations: Array<Record<string, unknown>> = [];

    (
      globalThis as {
        __testCreateSupabaseAdminClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseAdminClient = () => ({
      schema: (schema: string) => ({
        rpc: async (_action: string, args: { p_payload: Record<string, unknown> }) => {
          registerOperations.push(args.p_payload);
          return {
            data: {
              assetId: '55555555-5555-4555-8555-555555555555',
              versionId: '66666666-6666-4666-8666-666666666666',
              lineageCount: 0,
              status: 'created',
            },
            error: null,
          };
        },
        from: (table: string) => {
          let action: 'select' | 'insert' | 'update' = 'select';
          const query = {
            select: () => query,
            insert: (row: Record<string, unknown>) => {
              action = 'insert';
              insertedMediaRows.push(row);
              return query;
            },
            update: () => {
              action = 'update';
              return query;
            },
            eq: () => query,
            single: async () =>
              schema === 'organic' && table === 'organic_calendar_drafts'
                ? { data: { updated_at: '2026-09-09T11:59:00.000Z' }, error: null }
                : { data: { id: 'asset-1' }, error: null },
            then: (resolve: (value: { data?: unknown; error: null }) => unknown) =>
              Promise.resolve(
                action === 'insert' || action === 'update'
                  ? { data: null, error: null }
                  : { data: [], error: null },
              ).then(resolve),
          };
          return query;
        },
      }),
    });

    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = mock().mockResolvedValue({
      auth: { getUser: getUserMock },
      schema: mock().mockReturnValue({ rpc: rpcMock }),
      storage: {
        from: mock().mockReturnValue({
          upload: uploadMock,
          createSignedUrl: createSignedUrlMock,
        }),
      },
    });

    const response = await POST(applyRequest());

    expect(response.status).toBe(200);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
    // Registration reached Creative Operations with the real byte count, and did so
    // as a register_generated_asset operation rather than a direct table write.
    expect(registerOperations).toHaveLength(1);
    expect(registerOperations[0]?.action).toBe('register_generated_asset');
    expect(registerOperations[0]?.sizeBytes).toBe(68);
    expect(registerOperations[0]?.actor).toBe('user-1');
    expect(registerOperations[0]?.idempotencyKey).toMatch(/^generated:[0-9a-f]{64}$/);
    const payload = await response.json();
    expect(payload.schemaVersion).toBe('planner_ai_apply_v1');
    expect(payload.assets[0].storageUrl).toBe('https://signed.example.com/file.png');

    // The load-bearing assertion: the durable write went through the planner funnel,
    // carrying the CAS token the route had just read and the LIBRARY ids the funnel
    // needs. A raw UPDATE here is the bug this route was rewritten to remove.
    expect(funnelCalls).toHaveLength(1);
    expect(funnelCalls[0]?.path).toBe('/api/ai-studio/publishing/organic/drafts/draft-1/creative');
    expect(funnelCalls[0]?.method).toBe('POST');
    expect(funnelCalls[0]?.body).toEqual({
      brandId: '33333333-3333-4333-8333-333333333333',
      expectedUpdatedAt: '2026-09-09T11:59:00.000Z',
      format: 'image',
      assets: [
        {
          assetId: '55555555-5555-4555-8555-555555555555',
          versionId: '66666666-6666-4666-8666-666666666666',
          kind: 'image',
          order: 0,
        },
      ],
    });
  });

  // A concurrent writer beat this apply to the row. That is the whole point of taking a
  // CAS token, and the user has to be told — the old raw UPDATE reported 200 and quietly
  // overwrote whatever had landed in between.
  it('passes the funnel refusal through instead of reporting a write that lost', async () => {
    seedApplyClients();
    funnelError = new ApiError(
      'The planner refused this write (rejected); re-read the draft and try again.',
      409,
      'draft_changed',
    );

    const response = await POST(applyRequest());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('draft_changed');
  });

  it('reports a format the assets would change as 422, not as success', async () => {
    seedApplyClients();
    funnelError = new ApiError(
      'draft already carries image creative',
      422,
      'draft_format_mismatch',
    );

    const response = await POST(applyRequest());

    expect(response.status).toBe(422);
  });
});
