import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    (
      globalThis as { __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown }
    ).__testCreateSupabaseServerClient?.(...args),
}));

mock.module('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: (...args: unknown[]) =>
    (
      globalThis as { __testCreateSupabaseAdminClient?: (...params: unknown[]) => unknown }
    ).__testCreateSupabaseAdminClient?.(...args),
}));

import { POST } from './route';

describe('POST /api/organic/ai-studio/apply', () => {
  beforeEach(() => {
    mock.restore();
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
                ? { data: { content_json: {} }, error: null }
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

    const response = await POST(
      new Request('http://localhost/api/organic/ai-studio/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schemaVersion: 'planner_ai_apply_v1',
          draftId: 'draft-1',
          brandProfileId: '33333333-3333-4333-8333-333333333333',
          postType: 'post',
          platform: 'instagram',
          overwrite: true,
          contentPatch: {
            captionPreview: 'Updated caption',
          },
          assets: [
            {
              role: 'primary',
              kind: 'image',
              sourceDataUrl:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5M4V8AAAAASUVORK5CYII=',
            },
          ],
        }),
      }),
    );

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
  });
});
