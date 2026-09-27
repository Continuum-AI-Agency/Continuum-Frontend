import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { listReviewEventsResponseSchema } from '@continuum/contracts';

type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testCallerHasBrandAccess?: (...args: unknown[]) => unknown;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseServerClient?.(...args),
}));
// Vercel has no service-role key: a route that reaches for the admin client
// fails in production, so here it fails the test.
mock.module('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('the service-role key is not available on Vercel');
  },
}));
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: (...args: unknown[]) => hooks.__testCallerHasBrandAccess?.(...args),
}));

import { GET } from './route';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const ASSET_ID = '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22';
const USER_ID = 'reviewer-1';
const USER_EMAIL = 'reviewer@continuum.test';

type DbResult = { data: unknown; error: { code?: string; message: string } | null };
type RecordedCall = { method: string; args: unknown[] };

class QueryStub implements PromiseLike<DbResult> {
  readonly calls: RecordedCall[] = [];
  constructor(
    readonly key: string,
    private readonly result: DbResult,
  ) {}
  private chain(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }
  select(...args: unknown[]) {
    return this.chain('select', args);
  }
  insert(...args: unknown[]) {
    return this.chain('insert', args);
  }
  update(...args: unknown[]) {
    return this.chain('update', args);
  }
  eq(...args: unknown[]) {
    return this.chain('eq', args);
  }
  is(...args: unknown[]) {
    return this.chain('is', args);
  }
  order(...args: unknown[]) {
    return this.chain('order', args);
  }
  limit(...args: unknown[]) {
    return this.chain('limit', args);
  }
  single() {
    return this.chain('single', []);
  }
  maybeSingle() {
    return this.chain('maybeSingle', []);
  }
  then<T1 = DbResult, T2 = never>(
    onfulfilled?: ((value: DbResult) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

// Plan keys are `${schema}.${table}`; each .from() consumes the next queued result.
function createClientStub(plan: Record<string, DbResult[]>) {
  const queries: QueryStub[] = [];
  const client = {
    schema: (schemaName: string) => ({
      from(table: string) {
        const key = `${schemaName}.${table}`;
        const next = plan[key]?.shift() ?? { data: null, error: null };
        const query = new QueryStub(key, next);
        queries.push(query);
        return query;
      },
    }),
  };
  return { client, queries };
}

function setAuth(user: { id: string; email?: string } | null) {
  hooks.__testCreateSupabaseServerClient = () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user }, error: null }) },
    });
}

function getRequest(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return new Request(`http://localhost/api/library/review?${query.toString()}`);
}

const EVENT_ROW = {
  id: 'evt-1',
  brand_id: BRAND_ID,
  asset_id: ASSET_ID,
  from_status: 'draft',
  to_status: 'in_review',
  actor: USER_ID,
  note: 'ready for eyes',
  created_at: '2026-07-10T12:00:00.000Z',
};

beforeEach(() => {
  setAuth({ id: USER_ID, email: USER_EMAIL });
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(true);
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
});

describe('GET /api/library/review', () => {
  it('lists events newest first with actor names resolved from brand permissions', async () => {
    const secondRow = {
      ...EVENT_ROW,
      id: 'evt-2',
      from_status: 'in_review',
      to_status: 'approved',
      actor: 'someone-unknown',
      note: null,
      created_at: '2026-07-11T09:00:00.000Z',
    };
    const { client } = createClientStub({
      'media.asset_review_events': [{ data: [secondRow, EVENT_ROW], error: null }],
      'brand_profiles.permissions': [
        { data: [{ user_id: USER_ID, email: USER_EMAIL }], error: null },
      ],
    });
    hooks.__testCreateSupabaseServerClient = () =>
      Promise.resolve({
        ...client,
        auth: {
          getUser: () =>
            Promise.resolve({ data: { user: { id: USER_ID, email: USER_EMAIL } }, error: null }),
        },
      });

    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    expect(response.status).toBe(200);

    const body = listReviewEventsResponseSchema.parse(await response.json());
    expect(body.events).toHaveLength(2);
    expect(body.events[0]?.id).toBe('evt-2');
    expect(body.events[0]?.actorName).toBeNull();
    expect(body.events[1]?.actorName).toBe(USER_EMAIL);
  });

  it('rejects malformed queries', async () => {
    const response = await GET(getRequest({ brandId: 'not-a-uuid', assetId: ASSET_ID }));
    expect(response.status).toBe(422);
  });
});
