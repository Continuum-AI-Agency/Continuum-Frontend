import { describe, expect, it } from 'bun:test';
import { claimPendingInvite } from './claimInvite';

const BRAND = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

type InvokeCall = { name: string; options: { body: unknown; headers?: Record<string, string> } };

function makeSupabase(opts: {
  membership?: { id: string } | null;
  membershipThrows?: boolean;
  invokeError?: unknown;
  accessToken?: string | null;
}) {
  const invokes: InvokeCall[] = [];
  // permissions chains select→eq→eq→maybeSingle.
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = async () => ({ data: opts.membership ?? null, error: null });

  const accessToken = opts.accessToken === undefined ? 'jwt_abc' : opts.accessToken;

  const supabase = {
    schema: () => ({
      from: () => {
        if (opts.membershipThrows) throw new Error('connection reset');
        return chain;
      },
    }),
    auth: {
      getSession: async () => ({
        data: { session: accessToken ? { access_token: accessToken } : null },
      }),
    },
    functions: {
      invoke: async (name: string, options: InvokeCall["options"]) => {
        invokes.push({ name, options });
        return { data: null, error: opts.invokeError ?? null };
      },
    },
  } as never;

  return { supabase, invokes };
}

describe('claimPendingInvite', () => {
  it('claims the invite when the caller has no permissions row', async () => {
    const { supabase, invokes } = makeSupabase({ membership: null });

    await claimPendingInvite(supabase, BRAND, USER);

    expect(invokes).toEqual([
      {
        name: 'brand_invite',
        options: {
          body: { action: 'accept', brandId: BRAND },
          headers: { Authorization: 'Bearer jwt_abc' },
        },
      },
    ]);
  });

  it('passes the bearer explicitly — a per-request SSR client sends none of its own', async () => {
    // Without this the invoke goes out anonymous and the edge function 401s, which
    // reads as "no invite" and leaves the user locked out exactly as before.
    const { supabase, invokes } = makeSupabase({ membership: null });

    await claimPendingInvite(supabase, BRAND, USER);

    expect(invokes[0].options.headers).toEqual({ Authorization: 'Bearer jwt_abc' });
  });

  it('does not invoke at all without a session', async () => {
    const { supabase, invokes } = makeSupabase({ membership: null, accessToken: null });

    await claimPendingInvite(supabase, BRAND, USER);

    expect(invokes).toHaveLength(0);
  });

  it('sends no token — the edge function claims by the caller verified email', async () => {
    const { supabase, invokes } = makeSupabase({ membership: null });

    await claimPendingInvite(supabase, BRAND, USER);

    expect(invokes[0].options.body).not.toHaveProperty('token');
  });

  it('does nothing when the caller is already a member', async () => {
    // Onboarding runs this on every load; an existing member must not pay an
    // edge-function round trip, and must never re-open a settled invite.
    const { supabase, invokes } = makeSupabase({ membership: { id: 'perm_1' } });

    await claimPendingInvite(supabase, BRAND, USER);

    expect(invokes).toHaveLength(0);
  });

  it('swallows an invoke failure — no pending invite is the common case', async () => {
    const { supabase } = makeSupabase({
      membership: null,
      invokeError: new Error('Invalid or used invite'),
    });

    expect(await claimPendingInvite(supabase, BRAND, USER)).toBeUndefined();
  });

  it('swallows a thrown membership lookup', async () => {
    const { supabase } = makeSupabase({ membershipThrows: true });

    expect(await claimPendingInvite(supabase, BRAND, USER)).toBeUndefined();
  });
});
