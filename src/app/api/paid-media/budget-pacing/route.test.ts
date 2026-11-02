import { afterEach, describe, expect, it, mock } from 'bun:test';
import { FunctionsHttpError } from '@supabase/supabase-js';

// APP-SWEEP-budget-pacing-500-on-meta-refusal: Pink Elephant's paid dashboard got a 500 from
// this route when Meta refused the ad account's read ("(#200) … ads_management or ads_read
// permission"). The edge answered 403 with errorCode PERMISSIONS_MISSING; the route threw both
// away and called it a server failure. A refusal keeps its status and its typed code.
type Invoke = (name: string, options: unknown) => Promise<{ data: unknown; error: unknown }>;
let invoke: Invoke = async () => ({ data: null, error: null });

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    functions: { invoke: (name: string, options: unknown) => invoke(name, options) },
  }),
}));

const { POST } = await import('./route');

const request = () =>
  new Request('http://localhost/api/paid-media/budget-pacing', {
    method: 'POST',
    body: JSON.stringify({ brandId: 'brand-1', adAccountId: 'act_1' }),
  });

afterEach(() => {
  invoke = async () => ({ data: null, error: null });
});

describe('POST /api/paid-media/budget-pacing', () => {
  it("keeps a Meta permission refusal's status and typed code instead of answering 500", async () => {
    invoke = async () => ({
      data: null,
      error: new FunctionsHttpError(
        new Response(
          JSON.stringify({
            error: '(#200) Ad account owner has NOT grant ads_management or ads_read permission',
            errorCode: 'PERMISSIONS_MISSING',
          }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      ),
    });

    const response = await POST(request());
    const body = (await response.json()) as { error: string; errorCode?: string };

    expect(response.status).toBe(403);
    expect(body.errorCode).toBe('PERMISSIONS_MISSING');
  });

  it('still answers a failure with no status of its own as a gateway error', async () => {
    invoke = async () => ({ data: null, error: new Error('network down') });

    const response = await POST(request());

    expect(response.status).toBe(502);
  });
});
