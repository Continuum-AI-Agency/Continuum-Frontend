// The auth user_metadata mirror of the active brand. Each onboarding save once ran
// supabase.auth.updateUser; one 2026-11-13 session sent 64 in 82 s, Auth answered 429 and the
// step save failed with it. These drive the real storage paths over an in-memory Supabase.

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { AuthApiError } from '@supabase/supabase-js';
import { createDefaultOnboardingState, type OnboardingState } from '../state';

const activeClient: { current: unknown } = { current: null };

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => activeClient.current,
}));

const { applyOnboardingPatch } = await import('../storage');

const USER_ID = 'user-1';
const EMAIL = 'owner@example.com';
const owner = { id: USER_ID, email: EMAIL, role: 'owner' as const };

type OnboardingRow = { brand_id: string; state: OnboardingState; is_active: boolean };
type DocumentRow = { id: string; name: string; status: string; created_at: string };
type Filter = { kind: 'eq' | 'neq' | 'in'; column: string; value: unknown };

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every(({ kind, column, value }) => {
    if (kind === 'eq') return row[column] === value;
    if (kind === 'neq') return row[column] !== value;
    return (value as unknown[]).includes(row[column]);
  });
}

/** Just enough of PostgREST for the onboarding storage paths, backed by mutable tables. */
function createFakeSupabase(options: {
  rows: OnboardingRow[];
  documents?: DocumentRow[];
  userMetadata?: Record<string, unknown>;
  updateUserError?: Error;
}) {
  const onboarding = new Map(
    options.rows.map((row) => [row.brand_id, { user_id: USER_ID, ...row }]),
  );
  const documents = options.documents ?? [];
  const updateUser = mock(async (_attributes: unknown) => ({
    data: { user: null },
    error: options.updateUserError ?? null,
  }));

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
    neq(column: string, value: unknown) {
      this.filters.push({ kind: 'neq', column, value });
      return this;
    }
    in(column: string, value: unknown[]) {
      this.filters.push({ kind: 'in', column, value });
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
      if (this.table === 'brand_documents') return { data: documents, error: null };
      if (this.table === 'brand_profiles') {
        // The caller created the brand and its row already carries the state's fields.
        return {
          data: [
            {
              id: 'brand-a',
              brand_name: 'Untitled Brand',
              logo_path: null,
              completed_at: null,
              created_by: USER_ID,
              email_report_opt_in: true,
            },
          ],
          error: null,
        };
      }
      if (this.table !== 'user_onboarding_states') return { data: null, error: null };

      if (this.op === 'select') {
        return {
          data: [...onboarding.values()].filter((r) => matches(r, this.filters)),
          error: null,
        };
      }
      if (this.op === 'update') {
        const updated = [...onboarding.values()].filter((r) => matches(r, this.filters));
        for (const row of updated) Object.assign(row, this.values);
        return { data: updated, error: null };
      }
      if (this.op === 'upsert') {
        const incoming = Array.isArray(this.values) ? this.values : [this.values];
        for (const row of incoming as OnboardingRow[]) {
          onboarding.set(row.brand_id, {
            ...onboarding.get(row.brand_id),
            ...row,
            user_id: USER_ID,
          });
        }
      }
      return { data: null, error: null };
    }
  }

  activeClient.current = {
    auth: {
      getClaims: async () => ({
        data: {
          claims: { sub: USER_ID, email: EMAIL, user_metadata: options.userMetadata ?? {} },
        },
        error: null,
      }),
      updateUser,
    },
    schema: () => ({ from: (table: string) => new Query(table) }),
  };

  return { updateUser, onboarding, documents };
}

const stateAt = (step: number): OnboardingState => ({
  ...createDefaultOnboardingState(owner),
  step,
  documents: [],
});

describe('active brand mirror in user_metadata', () => {
  beforeEach(() => {
    activeClient.current = null;
  });

  it('calls updateUser at most once over a run of patches that keep the active brand', async () => {
    // brand-a is active; the patches target brand-b, so the first one switches the active brand.
    // Documents keep finishing processing between patches, which marks each load dirty.
    const { updateUser, onboarding, documents } = createFakeSupabase({
      rows: [
        { brand_id: 'brand-a', state: stateAt(0), is_active: true },
        { brand_id: 'brand-b', state: stateAt(1), is_active: false },
      ],
      documents: [
        {
          id: 'doc-1',
          name: '1.jpg',
          status: 'processing',
          created_at: '2026-11-13T20:46:00.000Z',
        },
        {
          id: 'doc-2',
          name: '2.jpg',
          status: 'processing',
          created_at: '2026-11-13T20:46:01.000Z',
        },
      ],
    });

    await applyOnboardingPatch('brand-b', { step: 1 });
    documents[0].status = 'ready';
    await applyOnboardingPatch('brand-b', { brand: { name: 'Cali' } });
    documents[1].status = 'ready';
    await applyOnboardingPatch('brand-b', { step: 2 });
    await applyOnboardingPatch('brand-b', { step: 2 });

    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser.mock.calls[0][0]).toEqual({
      data: { onboarding: { activeBrandId: 'brand-b' } },
    });
    const saved = onboarding.get('brand-b');
    expect(saved?.is_active).toBe(true);
    expect(saved?.state.step).toBe(2);
    expect(saved?.state.documents.map((doc) => doc.status)).toEqual(['ready', 'ready']);
  });

  it('skips updateUser when the metadata already names the active brand', async () => {
    const { updateUser, onboarding } = createFakeSupabase({
      rows: [
        { brand_id: 'brand-a', state: stateAt(0), is_active: true },
        { brand_id: 'brand-b', state: stateAt(1), is_active: false },
      ],
      userMetadata: { onboarding: { activeBrandId: 'brand-b' } },
    });

    await applyOnboardingPatch('brand-b', { step: 2 });

    expect(updateUser).not.toHaveBeenCalled();
    expect(onboarding.get('brand-b')?.is_active).toBe(true);
  });

  it('skips updateUser in the legacy branch when the legacy blob already names the active brand', async () => {
    const { updateUser } = createFakeSupabase({
      rows: [{ brand_id: 'brand-a', state: stateAt(1), is_active: true }],
      userMetadata: {
        onboarding: { activeBrandId: 'brand-a', brands: { 'brand-a': stateAt(0) } },
      },
    });

    await applyOnboardingPatch('brand-a', { step: 2 });

    expect(updateUser).not.toHaveBeenCalled();
  });

  it('still mirrors from the legacy branch when the legacy blob names another brand', async () => {
    const { updateUser } = createFakeSupabase({
      rows: [{ brand_id: 'brand-a', state: stateAt(1), is_active: true }],
      userMetadata: {
        onboarding: { activeBrandId: 'brand-old', brands: { 'brand-old': stateAt(0) } },
      },
    });

    await applyOnboardingPatch('brand-a', { step: 2 });

    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser.mock.calls[0][0]).toEqual({
      data: { onboarding: { activeBrandId: 'brand-a' } },
    });
  });

  it('does not fail the step save when updateUser answers 429', async () => {
    const warn = mock(() => {});
    const originalWarn = console.warn;
    console.warn = warn;
    try {
      const { updateUser, onboarding } = createFakeSupabase({
        rows: [
          { brand_id: 'brand-a', state: stateAt(0), is_active: true },
          { brand_id: 'brand-b', state: stateAt(1), is_active: false },
        ],
        updateUserError: new AuthApiError(
          'Request rate limit reached',
          429,
          'over_request_rate_limit',
        ),
      });

      const next = await applyOnboardingPatch('brand-b', { step: 2 });

      expect(updateUser).toHaveBeenCalledTimes(1);
      expect(next.step).toBe(2);
      expect(onboarding.get('brand-b')?.state.step).toBe(2);
      expect(onboarding.get('brand-b')?.is_active).toBe(true);
      expect(warn).toHaveBeenCalledWith('[onboarding.metadata] active brand mirror skipped', {
        status: 429,
        code: 'over_request_rate_limit',
        message: 'Request rate limit reached',
      });
    } finally {
      console.warn = originalWarn;
    }
  });
});
