import { describe, expect, it, mock } from 'bun:test';

// active-brand-context.ts imports "server-only"; the focused test runner doesn't apply
// the FE preload that stubs it, so mock it here before loading the module.
mock.module('server-only', () => ({}));

const { redeemPendingInvites } = await import('./active-brand-context');

const USER = '22222222-2222-4222-8222-222222222222';
const INVITED = '11111111-1111-4111-8111-111111111111';
const OWNED = '33333333-3333-4333-8333-333333333333';

type Rows = Parameters<typeof redeemPendingInvites>[2];

// The same client claimPendingInvite drives: a membership lookup, a session, an invoke.
function makeSupabase() {
  const invokes: Array<{ body: unknown }> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) chain[method] = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: null });

  const supabase = {
    schema: () => ({ from: () => chain }),
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt_abc' } } }) },
    functions: {
      invoke: async (_name: string, options: { body: unknown }) => {
        invokes.push({ body: options.body });
        return { data: null, error: null };
      },
    },
  } as never;
  return { supabase, invokes };
}

const redeemed: Rows = {
  permissions: [{ brand_profile_id: INVITED, role: 'admin' }],
  invites: [],
};

describe('redeemPendingInvites', () => {
  it('claims an invite the user holds no permission for, then re-reads access', async () => {
    const { supabase, invokes } = makeSupabase();
    const rows: Rows = { permissions: [], invites: [{ brand_profile_id: INVITED, role: 'admin' }] };

    const result = await redeemPendingInvites(supabase, USER, rows, async () => redeemed);

    expect(invokes).toEqual([{ body: { action: 'accept', brandId: INVITED } }]);
    expect(result).toBe(redeemed);
  });

  it('claims only the invited brands, not ones the user already belongs to', async () => {
    const { supabase, invokes } = makeSupabase();
    const rows: Rows = {
      permissions: [{ brand_profile_id: OWNED, role: 'owner' }],
      invites: [
        { brand_profile_id: OWNED, role: 'admin' },
        { brand_profile_id: INVITED, role: 'admin' },
        { brand_profile_id: INVITED, role: 'admin' },
      ],
    };

    await redeemPendingInvites(supabase, USER, rows, async () => redeemed);

    expect(invokes).toEqual([{ body: { action: 'accept', brandId: INVITED } }]);
  });

  it('touches nothing and skips the re-read when there is no pending invite', async () => {
    const { supabase, invokes } = makeSupabase();
    const rows: Rows = { permissions: [{ brand_profile_id: OWNED, role: 'owner' }], invites: [] };
    let refetched = false;

    const result = await redeemPendingInvites(supabase, USER, rows, async () => {
      refetched = true;
      return redeemed;
    });

    expect(invokes).toHaveLength(0);
    expect(refetched).toBe(false);
    expect(result).toBe(rows);
  });
});
