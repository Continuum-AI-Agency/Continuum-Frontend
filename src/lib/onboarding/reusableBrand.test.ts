import { describe, expect, it } from 'bun:test';
import {
  findMatchingActiveBrandId,
  findPendingInviteBrandId,
  findReusableBrandId,
} from './reusableBrand';

function makeInviteSupabase(opts: {
  invites?: Array<{ brand_profile_id: string }>;
  error?: unknown;
}) {
  const result = { data: opts.invites ?? [], error: opts.error ?? null };
  // The invites query chains select→ilike→is→is→gt→order→limit; every step
  // returns the same chainable object and limit() resolves the result.
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'ilike', 'is', 'gt', 'order']) {
    chain[method] = () => chain;
  }
  chain.limit = async () => result;
  return { schema: () => ({ from: () => chain }) } as never;
}

function makeSupabase(opts: {
  perms?: Array<{ brand_profile_id: string }>;
  permErr?: unknown;
  brands?: Array<{
    id: string;
    brand_name?: string | null;
    context?: unknown;
    completed_at?: string | null;
  }>;
  brandErr?: unknown;
}) {
  return {
    schema: () => ({
      from: (table: string) => {
        if (table === 'permissions') {
          return {
            select: () => ({
              eq: async () => ({ data: opts.perms ?? [], error: opts.permErr ?? null }),
            }),
          };
        }
        // brand_profiles — `.eq(...)` must satisfy two shapes: awaited
        // directly (findMatchingActiveBrandId) AND chained with `.order(...)`
        // (findReusableBrandId), so the eq() result is both thenable and
        // exposes `.order()`.
        const result = { data: opts.brands ?? [], error: opts.brandErr ?? null };
        const eqResult = {
          then: (onFulfilled: (value: typeof result) => unknown) =>
            Promise.resolve(result).then(onFulfilled),
          order: async () => result,
        };
        return {
          select: () => ({
            in: () => ({
              eq: () => eqResult,
            }),
          }),
        };
      },
    }),
  } as never;
}

describe('findReusableBrandId', () => {
  it('returns the oldest active brand the user has ANY permission row on', async () => {
    const result = await findReusableBrandId(
      makeSupabase({
        perms: [{ brand_profile_id: 'old' }, { brand_profile_id: 'new' }],
        brands: [{ id: 'old' }, { id: 'new' }],
      }),
      'u1',
    );
    expect(result).toBe('old');
  });

  // Regression (ticket #162): an invited operator has a permissions row with
  // role "operator" (never "owner"). Their own onboarding metadata is empty
  // (first login after accepting an invite). Before this fix,
  // findReusableBrandId only looked at role === "owner" and returned null,
  // so the caller minted a brand new duplicate brand instead of routing the
  // operator to the brand they already have access to.
  it('resolves an invited operator (non-owner role) to their EXISTING brand_id, not a newly minted one', async () => {
    const result = await findReusableBrandId(
      makeSupabase({
        perms: [{ brand_profile_id: 'existing-brand' }],
        brands: [{ id: 'existing-brand' }],
      }),
      'invited-operator-1',
    );
    expect(result).toBe('existing-brand');
    expect(result).not.toBeNull();
  });

  it('returns null when the user has no permission rows', async () => {
    expect(await findReusableBrandId(makeSupabase({ perms: [] }), 'u1')).toBeNull();
  });

  it('returns null when the user has permission rows but none are active', async () => {
    const result = await findReusableBrandId(
      makeSupabase({ perms: [{ brand_profile_id: 'dead' }], brands: [] }),
      'u1',
    );
    expect(result).toBeNull();
  });

  it('fails safe (null) when the permissions lookup errors', async () => {
    expect(await findReusableBrandId(makeSupabase({ permErr: { code: 'XX' } }), 'u1')).toBeNull();
  });

  it('fails safe (null) when the brand lookup errors', async () => {
    const result = await findReusableBrandId(
      makeSupabase({ perms: [{ brand_profile_id: 'x' }], brandErr: { code: 'XX' } }),
      'u1',
    );
    expect(result).toBeNull();
  });
});

describe('findPendingInviteBrandId', () => {
  // Root-cause fix: an invited user has a pending `invites` row (by email) but
  // NO permissions row until they accept, so findReusableBrandId can't see the
  // invited brand. Without reusing it here they'd get a junk "<name>'s Brand".
  it('returns the invited brand_id when a pending invite exists for the email', async () => {
    const result = await findPendingInviteBrandId(
      makeInviteSupabase({ invites: [{ brand_profile_id: 'invited-brand' }] }),
      'duane@continuumai.agency',
    );
    expect(result).toBe('invited-brand');
  });

  it('returns null when there is no pending invite', async () => {
    expect(
      await findPendingInviteBrandId(
        makeInviteSupabase({ invites: [] }),
        'duane@continuumai.agency',
      ),
    ).toBeNull();
  });

  it('returns null (no query) when the email is missing', async () => {
    expect(await findPendingInviteBrandId(makeInviteSupabase({}), null)).toBeNull();
    expect(await findPendingInviteBrandId(makeInviteSupabase({}), '  ')).toBeNull();
  });

  it('fails safe (null) when the invites lookup errors', async () => {
    expect(
      await findPendingInviteBrandId(
        makeInviteSupabase({ error: { code: 'XX' } }),
        'duane@continuumai.agency',
      ),
    ).toBeNull();
  });
});

describe('findMatchingActiveBrandId', () => {
  it('matches on normalized brand_name', async () => {
    const result = await findMatchingActiveBrandId(
      makeSupabase({
        perms: [{ brand_profile_id: 'existing-brand' }],
        brands: [{ id: 'existing-brand', brand_name: '  Acme Co  ', context: {} }],
      }),
      'u1',
      { brandName: 'acme co' },
    );
    expect(result).toBe('existing-brand');
  });

  it('matches on normalized context.website_url', async () => {
    const result = await findMatchingActiveBrandId(
      makeSupabase({
        perms: [{ brand_profile_id: 'existing-brand' }],
        brands: [
          {
            id: 'existing-brand',
            brand_name: 'Something Else',
            context: { website_url: 'https://www.Example.com/' },
          },
        ],
      }),
      'u1',
      { brandName: 'totally different name', websiteUrl: 'example.com' },
    );
    expect(result).toBe('existing-brand');
  });

  it('returns null when neither name nor website match', async () => {
    const result = await findMatchingActiveBrandId(
      makeSupabase({
        perms: [{ brand_profile_id: 'existing-brand' }],
        brands: [
          { id: 'existing-brand', brand_name: 'Acme Co', context: { website_url: 'acme.com' } },
        ],
      }),
      'u1',
      { brandName: 'Untitled Brand', websiteUrl: 'example.com' },
    );
    expect(result).toBeNull();
  });

  it('returns null when the user has no accessible brands', async () => {
    const result = await findMatchingActiveBrandId(makeSupabase({ perms: [] }), 'u1', {
      brandName: 'Acme Co',
    });
    expect(result).toBeNull();
  });

  it('fails safe (null) when the brand lookup errors', async () => {
    const result = await findMatchingActiveBrandId(
      makeSupabase({ perms: [{ brand_profile_id: 'x' }], brandErr: { code: 'XX' } }),
      'u1',
      { brandName: 'Acme Co' },
    );
    expect(result).toBeNull();
  });
});

// The "+ Add brand" button (BrandSwitcher) sends NO name, so every click produced
// another default-named "<handle>'s Brand". In prod one user stacked 4 brands in
// 4 minutes that way. With onlyEmptyShell the click lands back on the untouched
// shell — but must never swallow a brand the user actually filled in.
describe('findMatchingActiveBrandId — onlyEmptyShell', () => {
  const shell = {
    id: 'shell',
    brand_name: "duanecscott's Brand",
    context: {},
    completed_at: null,
  };

  it('reuses an unfinished shell: empty context and no completed_at', async () => {
    const result = await findMatchingActiveBrandId(
      makeSupabase({ perms: [{ brand_profile_id: 'shell' }], brands: [shell] }),
      'u1',
      { brandName: "duanecscott's Brand", onlyEmptyShell: true },
    );
    expect(result).toBe('shell');
  });

  it('treats a null context as an empty shell too', async () => {
    const result = await findMatchingActiveBrandId(
      makeSupabase({
        perms: [{ brand_profile_id: 'shell' }],
        brands: [{ ...shell, context: null }],
      }),
      'u1',
      { brandName: "duanecscott's Brand", onlyEmptyShell: true },
    );
    expect(result).toBe('shell');
  });

  it('refuses a same-named brand that finished onboarding', async () => {
    const result = await findMatchingActiveBrandId(
      makeSupabase({
        perms: [{ brand_profile_id: 'shell' }],
        brands: [{ ...shell, completed_at: '2026-08-14T00:13:38.140Z' }],
      }),
      'u1',
      { brandName: "duanecscott's Brand", onlyEmptyShell: true },
    );
    expect(result).toBeNull();
  });

  it('refuses a same-named brand that has a populated context', async () => {
    const result = await findMatchingActiveBrandId(
      makeSupabase({
        perms: [{ brand_profile_id: 'shell' }],
        brands: [{ ...shell, context: { platform_urls: ['www.instagram.com/x/'] } }],
      }),
      'u1',
      { brandName: "duanecscott's Brand", onlyEmptyShell: true },
    );
    expect(result).toBeNull();
  });

  it('still matches a filled-in brand when onlyEmptyShell is off (ticket #162 path)', async () => {
    const result = await findMatchingActiveBrandId(
      makeSupabase({
        perms: [{ brand_profile_id: 'shell' }],
        brands: [{ ...shell, completed_at: '2026-08-14T00:13:38.140Z' }],
      }),
      'u1',
      { brandName: "duanecscott's Brand" },
    );
    expect(result).toBe('shell');
  });
});
