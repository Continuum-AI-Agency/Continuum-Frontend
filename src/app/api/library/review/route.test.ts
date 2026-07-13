import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  listReviewEventsResponseSchema,
  reviewTransitionResponseSchema,
} from '@continuum/contracts';

type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testCreateSupabaseAdminClient?: (...args: unknown[]) => unknown;
  __testCallerHasBrandAccess?: (...args: unknown[]) => unknown;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseServerClient?.(...args),
}));
mock.module('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseAdminClient?.(...args),
}));
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: (...args: unknown[]) => hooks.__testCallerHasBrandAccess?.(...args),
}));

import { GET, POST } from './route';

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
function createAdminStub(plan: Record<string, DbResult[]>) {
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

function findQuery(queries: QueryStub[], key: string, method: string): QueryStub | undefined {
  return queries.find(
    (query) => query.key === key && query.calls.some((call) => call.method === method),
  );
}

function callArg(query: QueryStub | undefined, method: string): unknown {
  return query?.calls.find((call) => call.method === method)?.args[0];
}

function setAuth(user: { id: string; email?: string } | null) {
  hooks.__testCreateSupabaseServerClient = () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user }, error: null }) },
    });
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/library/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  hooks.__testCreateSupabaseAdminClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
});

describe('POST /api/library/review', () => {
  it('updates the asset status, appends an audit event, and echoes the contract shape', async () => {
    const { client, queries } = createAdminStub({
      'media.assets': [
        { data: { id: ASSET_ID, review_status: 'draft' }, error: null },
        { data: null, error: null },
      ],
      'media.asset_review_events': [{ data: EVENT_ROW, error: null }],
    });
    hooks.__testCreateSupabaseAdminClient = () => client;

    const response = await POST(
      postRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        toStatus: 'in_review',
        note: 'ready for eyes',
      }),
    );
    expect(response.status).toBe(200);

    const body = reviewTransitionResponseSchema.parse(await response.json());
    expect(body.assetId).toBe(ASSET_ID);
    expect(body.reviewStatus).toBe('in_review');
    expect(body.reviewStatusUpdatedAt).toBeTruthy();
    expect(body.event.fromStatus).toBe('draft');
    expect(body.event.toStatus).toBe('in_review');
    expect(body.event.actor).toBe(USER_ID);
    expect(body.event.actorName).toBe(USER_EMAIL);

    const update = callArg(findQuery(queries, 'media.assets', 'update'), 'update') as {
      review_status: string;
      review_status_updated_at: string;
    };
    expect(update.review_status).toBe('in_review');
    expect(typeof update.review_status_updated_at).toBe('string');

    const insert = callArg(
      findQuery(queries, 'media.asset_review_events', 'insert'),
      'insert',
    ) as Record<string, unknown>;
    expect(insert).toMatchObject({
      brand_id: BRAND_ID,
      asset_id: ASSET_ID,
      from_status: 'draft',
      to_status: 'in_review',
      actor: USER_ID,
      note: 'ready for eyes',
    });
  });

  it('rejects unauthenticated callers', async () => {
    setAuth(null);
    const response = await POST(
      postRequest({ brandId: BRAND_ID, assetId: ASSET_ID, toStatus: 'approved' }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects callers without brand access', async () => {
    hooks.__testCallerHasBrandAccess = () => Promise.resolve(false);
    const response = await POST(
      postRequest({ brandId: BRAND_ID, assetId: ASSET_ID, toStatus: 'approved' }),
    );
    expect(response.status).toBe(403);
  });

  it('rejects invalid transition payloads', async () => {
    const response = await POST(
      postRequest({ brandId: BRAND_ID, assetId: ASSET_ID, toStatus: 'not-a-status' }),
    );
    expect(response.status).toBe(422);
  });

  it('404s when the asset is not in the brand', async () => {
    const { client } = createAdminStub({
      'media.assets': [{ data: null, error: null }],
    });
    hooks.__testCreateSupabaseAdminClient = () => client;
    const response = await POST(
      postRequest({ brandId: BRAND_ID, assetId: ASSET_ID, toStatus: 'approved' }),
    );
    expect(response.status).toBe(404);
  });
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
    const { client } = createAdminStub({
      'media.asset_review_events': [{ data: [secondRow, EVENT_ROW], error: null }],
      'brand_profiles.permissions': [
        { data: [{ user_id: USER_ID, email: USER_EMAIL }], error: null },
      ],
    });
    hooks.__testCreateSupabaseAdminClient = () => client;

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
