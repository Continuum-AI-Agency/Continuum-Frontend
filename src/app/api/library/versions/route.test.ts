import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { listVersionsResponseSchema, registerVersionResponseSchema } from '@continuum/contracts';
import { createFakeSupabaseClient, FakeDb, type FakeRow } from '../__tests__/fakeSupabase';

type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testCreateSupabaseAdminClient?: (...args: unknown[]) => unknown;
  __testCallerHasBrandAccess?: (...args: unknown[]) => unknown;
  __testMintSignedUrl?: (...args: unknown[]) => unknown;
  __testMintSignedUrls?: (...args: unknown[]) => unknown;
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
mock.module('@/lib/media/signed-urls', () => ({
  mintSignedUrl: (...args: unknown[]) => hooks.__testMintSignedUrl?.(...args),
  mintSignedUrls: (...args: unknown[]) => hooks.__testMintSignedUrls?.(...args),
}));

import { GET, PATCH, POST } from './route';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const ASSET_ID = '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22';
const USER_ID = 'uploader-1';
const ORIGINAL_PATH = `${BRAND_ID}/${ASSET_ID}/original.png`;
const V2_PATH = `${BRAND_ID}/${ASSET_ID}/v2/new.png`;

const REGISTER_BODY = {
  brandId: BRAND_ID,
  assetId: ASSET_ID,
  bucket: 'media-library',
  storagePath: V2_PATH,
  fileName: 'new.png',
  mimeType: 'image/png',
  sizeBytes: 2048,
  note: 'sharper export',
};

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

function seed(params: { asset?: FakeRow; versions?: FakeRow[] } = {}): FakeDb {
  return new FakeDb({
    'media.assets': [params.asset ?? assetRow()],
    'media.asset_versions': params.versions ?? [],
    'media.asset_review_events': [],
    'brand_profiles.permissions': [
      { brand_profile_id: BRAND_ID, user_id: 'creator-1', email: 'creator@continuum.test' },
      { brand_profile_id: BRAND_ID, user_id: USER_ID, email: 'uploader@continuum.test' },
    ],
  });
}

function operationFailure(message: string, status: number) {
  return { data: null, error: { message, context: new Response(null, { status }) } };
}

function versionResponse(db: FakeDb, head: FakeRow) {
  const rows = [...versionsOf(db)].sort(
    (left, right) => Number(right.version_number) - Number(left.version_number),
  );
  const headVersionId = rows.find(
    (row) => row.bucket === head.bucket && row.storage_path === head.storage_path,
  )?.id;
  return {
    versions: rows.map((row) => ({
      id: row.id,
      brandId: row.brand_id,
      assetId: row.asset_id,
      versionNumber: row.version_number,
      bucket: row.bucket,
      storagePath: row.storage_path,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
      durationMs: row.duration_ms,
      checksum: row.checksum,
      note: row.note,
      createdBy: row.created_by,
      authorName:
        row.created_by === USER_ID
          ? 'uploader@continuum.test'
          : row.created_by === 'creator-1'
            ? 'creator@continuum.test'
            : null,
      signedUrl: `https://signed/${String(row.storage_path)}`,
      isHead: row.id === headVersionId,
      createdAt: row.created_at,
    })),
  };
}

function ensureV1(
  db: FakeDb,
  head: FakeRow,
): { maxVersionNumber: number } | ReturnType<typeof operationFailure> {
  if (versionsOf(db).length === 0) {
    const insert = db.insert('media.asset_versions', {
      brand_id: head.brand_id,
      asset_id: head.id,
      version_number: 1,
      bucket: head.bucket,
      storage_path: head.storage_path,
      file_name: head.file_name,
      mime_type: head.mime_type,
      size_bytes: head.size_bytes,
      width: head.width,
      height: head.height,
      duration_ms: head.duration_ms,
      checksum: head.checksum,
      note: null,
      created_by: head.created_by,
    });
    if (insert.error && insert.error.code !== '23505')
      return operationFailure(insert.error.message, 500);
  }
  const newest = [...versionsOf(db)].sort(
    (left, right) => Number(right.version_number) - Number(left.version_number),
  )[0];
  return { maxVersionNumber: Number(newest?.version_number ?? 1) };
}

function fakeCreativeOperations(db: FakeDb, body: Record<string, unknown>) {
  const head = db
    .rows('media.assets')
    .find((row) => row.id === body.assetId && row.brand_id === body.brandId);
  if (!head) return operationFailure('Asset not found', 404);

  if (body.action === 'list_asset_versions')
    return { data: versionResponse(db, head), error: null };

  if (body.action === 'register_asset_version') {
    const bucket = body.bucket;
    const storagePath = body.storagePath;
    if (
      typeof bucket !== 'string' ||
      typeof storagePath !== 'string' ||
      bucket !== head.bucket ||
      !storagePath.startsWith(`${String(body.brandId)}/${String(body.assetId)}/`)
    ) {
      return operationFailure('Invalid storage location', 422);
    }
    const ensured = ensureV1(db, head);
    if ('error' in ensured) return ensured;
    const versionNumber = ensured.maxVersionNumber + 1;
    const insert = db.insert('media.asset_versions', {
      brand_id: body.brandId,
      asset_id: body.assetId,
      version_number: versionNumber,
      bucket,
      storage_path: storagePath,
      file_name: body.fileName,
      mime_type: body.mimeType,
      size_bytes: body.sizeBytes,
      width: null,
      height: null,
      duration_ms: null,
      checksum: null,
      note: body.note ?? null,
      created_by: USER_ID,
    });
    if (insert.error)
      return operationFailure(insert.error.message, insert.error.code === '23505' ? 409 : 500);
    Object.assign(head, {
      bucket,
      storage_path: storagePath,
      file_name: body.fileName,
      mime_type: body.mimeType,
      size_bytes: body.sizeBytes,
      width: null,
      height: null,
      duration_ms: null,
      checksum: null,
    });
    if (head.review_status === 'approved' || head.review_status === 'needs_changes') {
      const fromStatus = head.review_status;
      head.review_status = 'in_review';
      head.review_status_updated_at = '2026-07-11T00:00:00Z';
      db.insert('media.asset_review_events', {
        brand_id: body.brandId,
        asset_id: body.assetId,
        from_status: fromStatus,
        to_status: 'in_review',
        actor: USER_ID,
        note: `v${versionNumber} uploaded — review reset`,
      });
    }
    return {
      data: { assetId: body.assetId, versionNumber, ...versionResponse(db, head) },
      error: null,
    };
  }

  if (body.action === 'rollback_asset_version') {
    const target = versionsOf(db).find((row) => row.id === body.versionId);
    if (!target) return operationFailure('Version not found', 404);
    if (target.bucket === head.bucket && target.storage_path === head.storage_path) {
      return {
        data: {
          assetId: body.assetId,
          versionNumber: target.version_number,
          ...versionResponse(db, head),
        },
        error: null,
      };
    }
    const versionNumber = Math.max(...versionsOf(db).map((row) => Number(row.version_number))) + 1;
    const { id: _id, created_at: _createdAt, ...targetCopy } = target;
    const insert = db.insert('media.asset_versions', {
      ...targetCopy,
      version_number: versionNumber,
      note: `Rolled back to v${String(target.version_number)}`,
      created_by: USER_ID,
    });
    if (insert.error)
      return operationFailure(insert.error.message, insert.error.code === '23505' ? 409 : 500);
    Object.assign(head, {
      bucket: target.bucket,
      storage_path: target.storage_path,
      file_name: target.file_name,
      mime_type: target.mime_type,
      size_bytes: target.size_bytes,
      width: target.width,
      height: target.height,
      duration_ms: target.duration_ms,
      checksum: target.checksum,
    });
    return {
      data: { assetId: body.assetId, versionNumber, ...versionResponse(db, head) },
      error: null,
    };
  }

  return operationFailure('Unexpected operation', 400);
}

function useDb(db: FakeDb): FakeDb {
  const client = createFakeSupabaseClient({
    db,
    userId: USER_ID,
    userEmail: 'uploader@continuum.test',
  });
  Object.assign(client as object, {
    functions: {
      invoke: async (_name: string, input: { body: Record<string, unknown> }) =>
        fakeCreativeOperations(db, input.body),
    },
  });
  hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);
  hooks.__testCreateSupabaseAdminClient = () => {
    throw new Error('Version routes must not construct an admin client');
  };
  return db;
}

function useDbForGet(db: FakeDb): FakeDb {
  return useDb(db);
}

function jsonRequest(method: string, body: unknown) {
  return new Request('http://localhost/api/library/versions', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function versionsOf(db: FakeDb): FakeRow[] {
  return db.rows('media.asset_versions');
}

function reviewEventsOf(db: FakeDb): FakeRow[] {
  return db.rows('media.asset_review_events');
}

function assetOf(db: FakeDb): FakeRow {
  const row = db.rows('media.assets')[0];
  if (!row) throw new Error('asset missing from the fake db');
  return row;
}

beforeEach(() => {
  hooks.__testCreateSupabaseServerClient = () =>
    Promise.resolve({
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: USER_ID, email: 'uploader@continuum.test' } },
            error: null,
          }),
      },
    });
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(true);
  hooks.__testMintSignedUrls = (items: { path: string; bucket: string }[]) =>
    Promise.resolve(new Map(items.map((item) => [item.path, `https://signed/${item.path}`])));
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCreateSupabaseAdminClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
  hooks.__testMintSignedUrl = undefined;
  hooks.__testMintSignedUrls = undefined;
});

describe('POST /api/library/versions (register)', () => {
  it('materializes v1 from the head on first use, inserts v2, and promotes the head', async () => {
    const db = useDb(seed());

    const response = await POST(jsonRequest('POST', REGISTER_BODY));
    expect(response.status).toBe(200);

    const body = registerVersionResponseSchema.parse(await response.json());
    expect(body.versionNumber).toBe(2);
    expect(body.versions).toHaveLength(2);
    expect(body.versions[0]).toMatchObject({
      versionNumber: 2,
      isHead: true,
      signedUrl: `https://signed/${V2_PATH}`,
      authorName: 'uploader@continuum.test',
    });
    expect(body.versions[1]).toMatchObject({
      versionNumber: 1,
      isHead: false,
      authorName: 'creator@continuum.test',
    });

    // v1 carries the ASSET's provenance, not the uploader's.
    const rows = versionsOf(db);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      version_number: 1,
      storage_path: ORIGINAL_PATH,
      created_by: 'creator-1',
      checksum: 'head-sum',
    });
    expect(rows[1]).toMatchObject({
      version_number: 2,
      storage_path: V2_PATH,
      created_by: USER_ID,
      note: 'sharper export',
      width: null,
    });

    expect(assetOf(db)).toMatchObject({
      storage_path: V2_PATH,
      file_name: 'new.png',
      size_bytes: 2048,
      checksum: null,
    });
  });

  it('creates v1 exactly once when two first uploads race', async () => {
    const db = useDb(seed());
    // The rival's v1 commits between our empty read and our insert, so ours hits
    // the unique (asset_id, version_number) constraint. Swallowing 23505 and
    // re-reading is what keeps a second v1 row from ever existing.
    db.onBeforeInsert((table, row) => {
      if (table === 'media.asset_versions' && row.version_number === 1) {
        db.onBeforeInsert(null);
        db.rows(table).push(versionRow({ id: 'rival-v1', version_number: 1 }));
      }
    });

    const response = await POST(jsonRequest('POST', REGISTER_BODY));
    expect(response.status).toBe(200);

    const rows = versionsOf(db);
    expect(rows.filter((row) => row.version_number === 1)).toHaveLength(1);
    expect(rows.find((row) => row.version_number === 1)?.id).toBe('rival-v1');
    expect(rows.filter((row) => row.version_number === 2)).toHaveLength(1);
  });

  it('skips the backfill once history exists and numbers from the max version', async () => {
    const db = useDb(
      seed({
        asset: assetRow({ storage_path: V2_PATH, file_name: 'new.png' }),
        versions: [
          versionRow({ id: 'row-v1', version_number: 1 }),
          versionRow({ id: 'row-v2', version_number: 2, storage_path: V2_PATH }),
        ],
      }),
    );

    const response = await POST(jsonRequest('POST', REGISTER_BODY));
    expect(response.status).toBe(200);
    const body = registerVersionResponseSchema.parse(await response.json());
    expect(body.versionNumber).toBe(3);
    expect(versionsOf(db).filter((row) => row.version_number === 1)).toHaveLength(1);
  });

  it('maps a version-number collision to 409 so the client can retry', async () => {
    const db = useDb(seed({ versions: [versionRow({ id: 'row-v1', version_number: 1 })] }));
    db.onBeforeInsert((table, row) => {
      if (table === 'media.asset_versions' && row.version_number === 2) {
        db.onBeforeInsert(null);
        db.rows(table).push(versionRow({ id: 'rival-v2', version_number: 2 }));
      }
    });

    const response = await POST(jsonRequest('POST', REGISTER_BODY));
    expect(response.status).toBe(409);
  });

  it('404s when the asset is not in the brand', async () => {
    useDb(new FakeDb({ 'media.assets': [] }));
    const response = await POST(jsonRequest('POST', REGISTER_BODY));
    expect(response.status).toBe(404);
  });

  it('rejects a storage location outside the asset prefix', async () => {
    useDb(seed());
    const response = await POST(
      jsonRequest('POST', { ...REGISTER_BODY, storagePath: 'other-brand/other-asset/v2/x.png' }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects callers without brand access', async () => {
    hooks.__testCallerHasBrandAccess = () => Promise.resolve(false);
    const response = await POST(jsonRequest('POST', REGISTER_BODY));
    expect(response.status).toBe(403);
  });
});

describe('POST /api/library/versions — stale review verdicts', () => {
  it('knocks an approved asset back to in_review and records who did it', async () => {
    const db = useDb(seed({ asset: assetRow({ review_status: 'approved' }) }));

    const response = await POST(jsonRequest('POST', REGISTER_BODY));
    expect(response.status).toBe(200);

    expect(assetOf(db).review_status).toBe('in_review');
    expect(typeof assetOf(db).review_status_updated_at).toBe('string');

    const events = reviewEventsOf(db);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      brand_id: BRAND_ID,
      asset_id: ASSET_ID,
      from_status: 'approved',
      to_status: 'in_review',
      actor: USER_ID,
      note: 'v2 uploaded — review reset',
    });
  });

  it('knocks needs_changes back to in_review too', async () => {
    const db = useDb(seed({ asset: assetRow({ review_status: 'needs_changes' }) }));

    await POST(jsonRequest('POST', REGISTER_BODY));

    expect(assetOf(db).review_status).toBe('in_review');
    expect(reviewEventsOf(db)[0]).toMatchObject({ from_status: 'needs_changes' });
  });

  it.each([
    'none',
    'draft',
    'in_review',
  ])('leaves %s alone — it is not a verdict on the replaced file', async (status) => {
    const db = useDb(seed({ asset: assetRow({ review_status: status }) }));

    const response = await POST(jsonRequest('POST', REGISTER_BODY));
    expect(response.status).toBe(200);

    expect(assetOf(db).review_status).toBe(status);
    expect(reviewEventsOf(db)).toHaveLength(0);
  });

  it('still returns the new version when the reset write fails', async () => {
    const db = useDb(seed({ asset: assetRow({ review_status: 'approved' }) }));
    db.onBeforeInsert((table) =>
      table === 'media.asset_review_events'
        ? { code: '42501', message: 'permission denied' }
        : undefined,
    );

    const response = await POST(jsonRequest('POST', REGISTER_BODY));
    // A failed reset is logged, never a 500 that loses the file the user just
    // uploaded: the version is registered and the head is promoted regardless.
    expect(response.status).toBe(200);

    const body = registerVersionResponseSchema.parse(await response.json());
    expect(body.versionNumber).toBe(2);
    expect(versionsOf(db).filter((row) => row.version_number === 2)).toHaveLength(1);
    expect(assetOf(db)).toMatchObject({ storage_path: V2_PATH });
    expect(reviewEventsOf(db)).toHaveLength(0);
  });
});

describe('GET /api/library/versions', () => {
  it('lists versions newest first, flags the head, and resolves authors', async () => {
    useDbForGet(
      seed({
        versions: [
          versionRow({ id: 'row-v1', version_number: 1, storage_path: 'somewhere/else.png' }),
          versionRow({ id: 'row-v2', version_number: 2, created_by: USER_ID }),
        ],
      }),
    );

    const query = new URLSearchParams({ brandId: BRAND_ID, assetId: ASSET_ID });
    const response = await GET(
      new Request(`http://localhost/api/library/versions?${query.toString()}`),
    );
    expect(response.status).toBe(200);

    const body = listVersionsResponseSchema.parse(await response.json());
    expect(body.versions.map((version) => version.isHead)).toEqual([true, false]);
    expect(body.versions[0]?.authorName).toBe('uploader@continuum.test');
    expect(body.versions[1]?.signedUrl).toBe('https://signed/somewhere/else.png');
  });

  it('returns an empty list for a never-versioned asset (a read never materializes v1)', async () => {
    const db = useDbForGet(seed());

    const query = new URLSearchParams({ brandId: BRAND_ID, assetId: ASSET_ID });
    const response = await GET(
      new Request(`http://localhost/api/library/versions?${query.toString()}`),
    );
    expect(response.status).toBe(200);
    const body = listVersionsResponseSchema.parse(await response.json());
    expect(body.versions).toEqual([]);
    expect(versionsOf(db)).toHaveLength(0);
  });
});

describe('PATCH /api/library/versions (rollback)', () => {
  it('appends a copy of the target as a new version and promotes the head to its file', async () => {
    const db = useDb(
      seed({
        asset: assetRow({ storage_path: V2_PATH, file_name: 'new.png' }),
        versions: [
          versionRow({ id: 'row-v1', version_number: 1 }),
          versionRow({
            id: 'row-v2',
            version_number: 2,
            storage_path: V2_PATH,
            file_name: 'new.png',
          }),
        ],
      }),
    );

    const response = await PATCH(
      jsonRequest('PATCH', { brandId: BRAND_ID, assetId: ASSET_ID, versionId: 'row-v1' }),
    );
    expect(response.status).toBe(200);

    const body = registerVersionResponseSchema.parse(await response.json());
    expect(body.versionNumber).toBe(3);
    // v3 (the promoted copy) and v1 share bucket+path — only the newest is head.
    expect(body.versions.map((version) => version.isHead)).toEqual([true, false, false]);

    const v3 = versionsOf(db).find((row) => row.version_number === 3);
    expect(v3).toMatchObject({
      storage_path: ORIGINAL_PATH,
      note: 'Rolled back to v1',
      created_by: USER_ID,
      width: 640,
      checksum: 'head-sum',
    });
    expect(assetOf(db)).toMatchObject({ storage_path: ORIGINAL_PATH, file_name: 'original.png' });
  });

  it('is a no-op when the target already backs the head file', async () => {
    const db = useDb(seed({ versions: [versionRow({ id: 'row-v2', version_number: 2 })] }));

    const response = await PATCH(
      jsonRequest('PATCH', { brandId: BRAND_ID, assetId: ASSET_ID, versionId: 'row-v2' }),
    );
    expect(response.status).toBe(200);
    const body = registerVersionResponseSchema.parse(await response.json());
    expect(body.versionNumber).toBe(2);
    expect(versionsOf(db)).toHaveLength(1);
  });

  it('404s when the version does not belong to the asset', async () => {
    useDb(seed());
    const response = await PATCH(
      jsonRequest('PATCH', { brandId: BRAND_ID, assetId: ASSET_ID, versionId: 'row-missing' }),
    );
    expect(response.status).toBe(404);
  });
});
