import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { listCommentsResponseSchema, mediaCommentSchema } from '@continuum/contracts';
import { createFakeSupabaseClient, FakeDb, type FakeRow } from '../__tests__/fakeSupabase';

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
const OTHER_ASSET_ID = '7c3bb67e-5c2a-4c0f-9f26-3f9b2f9a9a33';
const USER_ID = 'commenter-1';
const ORIGINAL_PATH = `${BRAND_ID}/${ASSET_ID}/original.png`;
const V2_PATH = `${BRAND_ID}/${ASSET_ID}/v2/new.png`;

const BOX = { kind: 'box', x: 0.1, y: 0.2, width: 0.3, height: 0.4 } as const;

function assetRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: ASSET_ID,
    brand_id: BRAND_ID,
    created_by: 'creator-1',
    bucket: 'media-library',
    storage_path: ORIGINAL_PATH,
    file_name: 'original.png',
    mime_type: 'image/png',
    size_bytes: 111,
    width: 640,
    height: 480,
    duration_ms: null,
    checksum: 'head-sum',
    review_status: 'none',
    deleted_at: null,
    ...overrides,
  };
}

function versionRow(overrides: FakeRow & { id: string; version_number: number }): FakeRow {
  return {
    brand_id: BRAND_ID,
    asset_id: ASSET_ID,
    bucket: 'media-library',
    storage_path: ORIGINAL_PATH,
    file_name: 'original.png',
    mime_type: 'image/png',
    size_bytes: 111,
    width: 640,
    height: 480,
    duration_ms: null,
    checksum: 'head-sum',
    note: null,
    created_by: 'creator-1',
    created_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function seed(
  params: { asset?: FakeRow; versions?: FakeRow[]; comments?: FakeRow[] } = {},
): FakeDb {
  const db = new FakeDb({
    'media.assets': [params.asset ?? assetRow()],
    'media.asset_versions': params.versions ?? [],
    'media.comments': params.comments ?? [],
    'brand_profiles.permissions': [
      { brand_profile_id: BRAND_ID, user_id: USER_ID, email: 'commenter@continuum.test' },
    ],
  });
  const client = createFakeSupabaseClient({
    db,
    userId: USER_ID,
    userEmail: 'commenter@continuum.test',
  });
  hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);
  hooks.__testCreateSupabaseAdminClient = () => client;
  return db;
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/library/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(params: Record<string, string>) {
  const query = new URLSearchParams(params);
  return new Request(`http://localhost/api/library/comments?${query.toString()}`);
}

function versionsOf(db: FakeDb): FakeRow[] {
  return db.rows('media.asset_versions');
}

function commentsOf(db: FakeDb): FakeRow[] {
  return db.rows('media.comments');
}

beforeEach(() => {
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(true);
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCreateSupabaseAdminClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
});

describe('POST /api/library/comments — every comment is pinned to a version', () => {
  it('materializes v1 and pins a comment on a never-versioned asset to it', async () => {
    const db = seed();

    const response = await POST(
      postRequest({ brandId: BRAND_ID, assetId: ASSET_ID, body: 'crop tighter', annotation: BOX }),
    );
    expect(response.status).toBe(201);

    const comment = mediaCommentSchema.parse(await response.json());
    const versions = versionsOf(db);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version_number: 1, storage_path: ORIGINAL_PATH });
    expect(comment.versionId).toBe(versions[0]?.id as string);
    expect(commentsOf(db)[0]?.version_id).toBe(versions[0]?.id as string);
  });

  it('creates v1 exactly once when two first comments race', async () => {
    const db = seed();
    // The rival's v1 lands between our empty read and our insert. Swallowing the
    // resulting 23505 and re-reading is what keeps a second v1 from existing —
    // and both comments must end up on the SAME version.
    db.onBeforeInsert((table, row) => {
      if (table === 'media.asset_versions' && row.version_number === 1) {
        db.onBeforeInsert(null);
        db.rows(table).push(versionRow({ id: 'rival-v1', version_number: 1 }));
      }
    });

    const first = await POST(postRequest({ brandId: BRAND_ID, assetId: ASSET_ID, body: 'first' }));
    const second = await POST(
      postRequest({ brandId: BRAND_ID, assetId: ASSET_ID, body: 'second' }),
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    expect(versionsOf(db)).toHaveLength(1);
    expect(commentsOf(db).map((row) => row.version_id)).toEqual(['rival-v1', 'rival-v1']);
  });

  it('pins to the CURRENT head, not to v1, once the asset has been re-uploaded', async () => {
    const db = seed({
      asset: assetRow({ storage_path: V2_PATH, file_name: 'new.png' }),
      versions: [
        versionRow({ id: 'row-v1', version_number: 1 }),
        versionRow({ id: 'row-v2', version_number: 2, storage_path: V2_PATH }),
      ],
    });

    const response = await POST(
      postRequest({ brandId: BRAND_ID, assetId: ASSET_ID, body: 'on the new cut' }),
    );
    expect(response.status).toBe(201);

    const comment = mediaCommentSchema.parse(await response.json());
    expect(comment.versionId).toBe('row-v2');
    expect(versionsOf(db)).toHaveLength(2);
  });

  it('honors an explicit versionId when the author is viewing an older version', async () => {
    seed({
      asset: assetRow({ storage_path: V2_PATH }),
      versions: [
        versionRow({ id: 'row-v1', version_number: 1 }),
        versionRow({ id: 'row-v2', version_number: 2, storage_path: V2_PATH }),
      ],
    });

    const response = await POST(
      postRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        body: 'this was better in v1',
        versionId: 'row-v1',
      }),
    );
    expect(response.status).toBe(201);

    const comment = mediaCommentSchema.parse(await response.json());
    expect(comment.versionId).toBe('row-v1');
  });

  it('rejects a versionId belonging to another asset instead of trusting it', async () => {
    const db = seed({
      versions: [
        versionRow({ id: 'row-v1', version_number: 1 }),
        versionRow({ id: 'foreign-v1', version_number: 1, asset_id: OTHER_ASSET_ID }),
      ],
    });

    const response = await POST(
      postRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        body: 'pointing at somebody else',
        versionId: 'foreign-v1',
      }),
    );
    expect(response.status).toBe(404);
    expect(commentsOf(db)).toHaveLength(0);
  });

  it('makes a reply inherit its parent thread version, ignoring what the client sends', async () => {
    const db = seed({
      asset: assetRow({ storage_path: V2_PATH }),
      versions: [
        versionRow({ id: 'row-v1', version_number: 1 }),
        versionRow({ id: 'row-v2', version_number: 2, storage_path: V2_PATH }),
      ],
      comments: [
        {
          id: 'root-1',
          brand_id: BRAND_ID,
          asset_id: ASSET_ID,
          version_id: 'row-v1',
          parent_comment_id: null,
          body: 'the original note',
          annotation: null,
          resolved_at: null,
          resolved_by: null,
          created_by: USER_ID,
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:00:00.000Z',
          deleted_at: null,
        },
      ],
    });

    const response = await POST(
      postRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        body: 'agreed',
        parentCommentId: 'root-1',
        versionId: 'row-v2',
      }),
    );
    expect(response.status).toBe(201);

    // A thread lives on one version: the reply follows the root, not the head
    // and not the client's claim.
    const comment = mediaCommentSchema.parse(await response.json());
    expect(comment.versionId).toBe('row-v1');
    expect(comment.parentCommentId).toBe('root-1');
    expect(commentsOf(db)).toHaveLength(2);
  });

  it('404s for an asset outside the brand', async () => {
    const db = seed({ asset: assetRow({ brand_id: 'someone-else' }) });
    const response = await POST(
      postRequest({ brandId: BRAND_ID, assetId: ASSET_ID, body: 'nope' }),
    );
    expect(response.status).toBe(404);
    expect(commentsOf(db)).toHaveLength(0);
  });

  it('rejects callers without brand access', async () => {
    seed();
    hooks.__testCallerHasBrandAccess = () => Promise.resolve(false);
    const response = await POST(
      postRequest({ brandId: BRAND_ID, assetId: ASSET_ID, body: 'nope' }),
    );
    expect(response.status).toBe(403);
  });
});

describe('GET /api/library/comments', () => {
  it('returns the head version id alongside the comments', async () => {
    seed({
      asset: assetRow({ storage_path: V2_PATH }),
      versions: [
        versionRow({ id: 'row-v1', version_number: 1 }),
        versionRow({ id: 'row-v2', version_number: 2, storage_path: V2_PATH }),
      ],
      comments: [
        {
          id: 'c1',
          brand_id: BRAND_ID,
          asset_id: ASSET_ID,
          version_id: 'row-v1',
          parent_comment_id: null,
          body: 'stale note',
          annotation: null,
          resolved_at: null,
          resolved_by: null,
          created_by: USER_ID,
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:00:00.000Z',
          deleted_at: null,
        },
      ],
    });

    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    expect(response.status).toBe(200);

    const body = listCommentsResponseSchema.parse(await response.json());
    expect(body.headVersionId).toBe('row-v2');
    // The consumer can now see this note was written on a superseded cut.
    expect(body.comments[0]?.versionId).toBe('row-v1');
    expect(body.comments[0]?.authorName).toBe('Commenter');
  });

  it('reports a null head version for an asset with no history, and writes nothing', async () => {
    const db = seed();

    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    expect(response.status).toBe(200);

    const body = listCommentsResponseSchema.parse(await response.json());
    expect(body.headVersionId).toBeNull();
    expect(body.comments).toEqual([]);
    expect(versionsOf(db)).toHaveLength(0);
  });
});
