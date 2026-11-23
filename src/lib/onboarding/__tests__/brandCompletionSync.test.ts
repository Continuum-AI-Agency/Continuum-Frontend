// Completion belongs to the brand row (MCP readiness and the brand switcher read
// brand_profiles.completed_at) while each member keeps their own onboarding state. These drive the
// real storage paths over an in-memory Supabase: a load never clears a completed brand, a member
// whose state never finished takes the brand's completion, and a teammate who finishes completes
// the brand once.

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDefaultOnboardingState, type OnboardingState } from '../state';

const activeClient: { current: unknown } = { current: null };

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => activeClient.current,
}));

const { applyOnboardingPatch } = await import('../storage');

const BRAND_ID = '522da6f6-0000-4000-8000-000000000001';
const CREATOR_ID = 'bb63c674-0000-4000-8000-000000000001';
const TEAMMATE_ID = '4c2e3e11-0000-4000-8000-000000000001';
const COMPLETED_AT = '2026-11-20T22:48:17.841Z';

type BrandRow = {
  id: string;
  brand_name: string | null;
  logo_path: string | null;
  completed_at: string | null;
  created_by: string | null;
  email_report_opt_in: boolean | null;
};
type Filter = { kind: 'eq' | 'is'; column: string; value: unknown };
type BrandUpdate = { values: Partial<BrandRow>; filters: Filter[] };

const matches = (row: Record<string, unknown>, filters: Filter[]) =>
  filters.every(({ column, value }) => row[column] === value);

/** Just enough of PostgREST for these storage paths, backed by one brand row. */
function createFakeSupabase(userId: string, brand: BrandRow, state: OnboardingState) {
  const onboarding = new Map([
    [BRAND_ID, { user_id: userId, brand_id: BRAND_ID, state, is_active: true }],
  ]);
  const brandUpdates: BrandUpdate[] = [];

  class Query implements PromiseLike<{ data: unknown; error: null }> {
    private op: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select';
    private values: unknown;
    private filters: Filter[] = [];

    constructor(private readonly table: string) {}

    select() {
      return this;
    }
    order() {
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push({ kind: 'eq', column, value });
      return this;
    }
    is(column: string, value: unknown) {
      this.filters.push({ kind: 'is', column, value });
      return this;
    }
    neq() {
      return this;
    }
    in() {
      return this;
    }
    update(values: unknown) {
      this.op = 'update';
      this.values = values;
      return this;
    }
    upsert(values: unknown) {
      this.op = 'upsert';
      this.values = values;
      return this;
    }
    insert(values: unknown) {
      this.op = 'insert';
      this.values = values;
      return this;
    }
    delete() {
      this.op = 'delete';
      return this;
    }
    async maybeSingle() {
      const { data } = this.run();
      return { data: Array.isArray(data) ? (data[0] ?? null) : data, error: null };
    }
    // biome-ignore lint/suspicious/noThenProperty: PostgREST builders are awaited directly.
    then<A = { data: unknown; error: null }, B = never>(
      onFulfilled?: ((value: { data: unknown; error: null }) => A | PromiseLike<A>) | null,
      onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> {
      return Promise.resolve(this.run()).then(onFulfilled, onRejected);
    }

    private run(): { data: unknown; error: null } {
      if (this.table === 'brand_documents') return { data: [], error: null };
      if (this.table === 'brand_profiles') {
        if (this.op === 'update') {
          const values = this.values as Partial<BrandRow>;
          brandUpdates.push({ values, filters: this.filters });
          if (matches(brand, this.filters)) Object.assign(brand, values);
          return { data: null, error: null };
        }
        return { data: [brand], error: null };
      }
      if (this.table !== 'user_onboarding_states') return { data: null, error: null };
      if (this.op === 'select') return { data: [...onboarding.values()], error: null };
      if (this.op === 'upsert') {
        const incoming = Array.isArray(this.values) ? this.values : [this.values];
        for (const row of incoming as Array<{ brand_id: string; state: OnboardingState }>) {
          onboarding.set(row.brand_id, { ...onboarding.get(BRAND_ID)!, ...row, user_id: userId });
        }
      }
      return { data: null, error: null };
    }
  }

  activeClient.current = {
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: userId, email: `${userId}@example.com`, user_metadata: {} } },
        error: null,
      }),
      updateUser: async () => ({ data: { user: null }, error: null }),
    },
    schema: () => ({ from: (table: string) => new Query(table) }),
  };

  return { brand, brandUpdates, savedState: () => onboarding.get(BRAND_ID)?.state };
}

function brandRow(completedAt: string | null): BrandRow {
  return {
    id: BRAND_ID,
    brand_name: 'Brand',
    logo_path: null,
    completed_at: completedAt,
    created_by: CREATOR_ID,
    email_report_opt_in: true,
  };
}

function stateFor(userId: string, step: number, completedAt: string | null = null) {
  const state = createDefaultOnboardingState({
    id: userId,
    email: `${userId}@example.com`,
    role: 'owner' as const,
  });
  return { ...state, brand: { ...state.brand, name: 'Brand' }, step, completedAt, documents: [] };
}

describe('brand completion across members', () => {
  beforeEach(() => {
    activeClient.current = null;
  });

  it("does not clear a completed brand when the creator's own state never finished", async () => {
    const fake = createFakeSupabase(CREATOR_ID, brandRow(COMPLETED_AT), stateFor(CREATOR_ID, 8));

    const next = await applyOnboardingPatch(BRAND_ID, { step: 8 });

    expect(fake.brand.completed_at).toBe(COMPLETED_AT);
    expect(fake.brandUpdates.some((update) => update.values.completed_at === null)).toBe(false);
    expect(next.completedAt).toBe(COMPLETED_AT);
    expect(fake.savedState()?.completedAt).toBe(COMPLETED_AT);
  });

  it("completes a teammate's state at step 0 on a brand that is already complete", async () => {
    const fake = createFakeSupabase(TEAMMATE_ID, brandRow(COMPLETED_AT), stateFor(TEAMMATE_ID, 0));

    const next = await applyOnboardingPatch(BRAND_ID, { emailReportOptIn: true });

    expect(next.completedAt).toBe(COMPLETED_AT);
    expect(fake.savedState()?.completedAt).toBe(COMPLETED_AT);
    expect(fake.brandUpdates).toHaveLength(0);
  });

  it('leaves an incomplete brand incomplete for a teammate who has not finished', async () => {
    const fake = createFakeSupabase(TEAMMATE_ID, brandRow(null), stateFor(TEAMMATE_ID, 0));

    const next = await applyOnboardingPatch(BRAND_ID, { step: 1 });

    expect(next.completedAt).toBeNull();
    expect(fake.brand.completed_at).toBeNull();
    expect(fake.brandUpdates).toHaveLength(0);
  });

  it('a teammate who finishes completes the brand: completed_at only, only if still unset', async () => {
    const fake = createFakeSupabase(TEAMMATE_ID, brandRow(null), stateFor(TEAMMATE_ID, 8));

    await applyOnboardingPatch(BRAND_ID, { completedAt: COMPLETED_AT, step: 8 });

    expect(fake.brand.completed_at).toBe(COMPLETED_AT);
    expect(fake.brand.brand_name).toBe('Brand');
    expect(fake.brandUpdates).toHaveLength(1);
    const [update] = fake.brandUpdates;
    expect(Object.keys(update.values).sort()).toEqual(['completed_at', 'updated_at']);
    expect(update.filters).toContainEqual({ kind: 'is', column: 'completed_at', value: null });
  });

  it("the creator's own completion still writes the brand row", async () => {
    const fake = createFakeSupabase(CREATOR_ID, brandRow(null), stateFor(CREATOR_ID, 8));

    await applyOnboardingPatch(BRAND_ID, { completedAt: COMPLETED_AT, step: 8 });

    expect(fake.brand.completed_at).toBe(COMPLETED_AT);
  });
});
