import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  DEFAULT_CUSTOM_FIELDS,
  listCustomFieldsResponseSchema,
  MAX_CUSTOM_FIELDS_PER_BRAND,
} from '@continuum/contracts';
import { createFakeSupabaseClient, FakeDb, type FakeRow } from '../__tests__/fakeSupabase';

type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testCallerHasBrandAccess?: (...args: unknown[]) => unknown;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseServerClient?.(...args),
}));
// bun's mock.module is process-wide, so a sibling route spec's mock of this
// module would otherwise leak in and 403 everything here.
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: (...args: unknown[]) => hooks.__testCallerHasBrandAccess?.(...args),
}));

import { DELETE, GET, PATCH, POST } from './route';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const FIELD_ID = '7c2cc78f-6d3b-4d10-8e37-4fa03fabab21';
const FOREIGN_FIELD_ID = '2d3e4f50-6172-4839-9a0b-1c2d3e4f5061';
const OTHER_BRAND = '11111111-2222-3333-4444-555555555555';

function useDb(db: FakeDb, options: { hasBrandAccess?: boolean } = {}) {
  const hasBrandAccess = options.hasBrandAccess ?? true;
  hooks.__testCreateSupabaseServerClient = () =>
    Promise.resolve(createFakeSupabaseClient({ db, userId: 'user-1', hasBrandAccess }));
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(hasBrandAccess);
  return db;
}

function fieldRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: FIELD_ID,
    brand_id: BRAND_ID,
    name: 'Campaign',
    type: 'text',
    options: [],
    position: 0,
    is_default: false,
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
    ...overrides,
  };
}

function jsonRequest(method: 'POST' | 'PATCH', body: unknown) {
  return new Request('http://localhost/api/library/custom-fields', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function queryRequest(params: Record<string, string>) {
  return new Request(`http://localhost/api/library/custom-fields?${new URLSearchParams(params)}`);
}

beforeEach(() => {
  useDb(new FakeDb({ 'media.custom_fields': [] }));
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
});

describe('GET /api/library/custom-fields', () => {
  it('seeds the defaults on the brand’s first read', async () => {
    const db = useDb(new FakeDb({ 'media.custom_fields': [] }));

    const response = await GET(queryRequest({ brandId: BRAND_ID }));
    expect(response.status).toBe(200);

    const body = listCustomFieldsResponseSchema.parse(await response.json());
    expect(body.fields.map((field) => field.name)).toEqual(
      DEFAULT_CUSTOM_FIELDS.map((field) => field.name),
    );
    expect(db.rows('media.custom_fields')).toHaveLength(DEFAULT_CUSTOM_FIELDS.length);
  });

  it('seeds exactly once when two readers race', async () => {
    const db = useDb(new FakeDb({ 'media.custom_fields': [] }));
    db.onBeforeInsert((table) => {
      if (table !== 'media.custom_fields') return;
      db.onBeforeInsert(null);
      for (const [index, field] of DEFAULT_CUSTOM_FIELDS.entries()) {
        db.rows(table).push(
          fieldRow({ id: `rival-${index}`, name: field.name, type: field.type, position: index }),
        );
      }
    });

    const response = await GET(queryRequest({ brandId: BRAND_ID }));
    expect(response.status).toBe(200);

    const body = listCustomFieldsResponseSchema.parse(await response.json());
    expect(body.fields).toHaveLength(DEFAULT_CUSTOM_FIELDS.length);
    expect(db.rows('media.custom_fields')).toHaveLength(DEFAULT_CUSTOM_FIELDS.length);
  });

  it('returns an authored vocabulary in position order without seeding', async () => {
    const db = useDb(
      new FakeDb({
        'media.custom_fields': [
          fieldRow({ id: FIELD_ID, name: 'Shoot date', type: 'date', position: 1 }),
          fieldRow({ id: FOREIGN_FIELD_ID, name: 'Campaign', position: 0 }),
        ],
      }),
    );

    const response = await GET(queryRequest({ brandId: BRAND_ID }));
    const body = listCustomFieldsResponseSchema.parse(await response.json());

    expect(body.fields.map((field) => field.name)).toEqual(['Campaign', 'Shoot date']);
    expect(db.rows('media.custom_fields')).toHaveLength(2);
  });

  it('rejects callers without brand access', async () => {
    useDb(new FakeDb({ 'media.custom_fields': [] }), { hasBrandAccess: false });
    const response = await GET(queryRequest({ brandId: BRAND_ID }));
    expect(response.status).toBe(403);
  });

  it('rejects a malformed brandId', async () => {
    const response = await GET(queryRequest({ brandId: 'not-a-uuid' }));
    expect(response.status).toBe(422);
  });
});

describe('POST /api/library/custom-fields', () => {
  it('creates a select and places it at the end of the order', async () => {
    const db = useDb(
      new FakeDb({ 'media.custom_fields': [fieldRow({ name: 'Campaign', position: 4 })] }),
    );

    const response = await POST(
      jsonRequest('POST', {
        brandId: BRAND_ID,
        name: 'Usage rights',
        type: 'single_select',
        options: [{ id: 'unlimited', label: 'Unlimited' }],
      }),
    );
    expect(response.status).toBe(201);

    const body = (await response.json()) as { field: { name: string; position: number } };
    expect(body.field.name).toBe('Usage rights');
    expect(body.field.position).toBe(5);
    expect(db.rows('media.custom_fields')).toHaveLength(2);
  });

  it('rejects a select with no options', async () => {
    const response = await POST(
      jsonRequest('POST', { brandId: BRAND_ID, name: 'Rating', type: 'single_select' }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects a select with an empty option list', async () => {
    const response = await POST(
      jsonRequest('POST', {
        brandId: BRAND_ID,
        name: 'Rating',
        type: 'multi_select',
        options: [],
      }),
    );
    expect(response.status).toBe(422);
  });

  it('drops options supplied for a type that cannot use them', async () => {
    const db = useDb(new FakeDb({ 'media.custom_fields': [] }));
    const response = await POST(
      jsonRequest('POST', {
        brandId: BRAND_ID,
        name: 'Shoot date',
        type: 'date',
        options: [{ id: 'nonsense', label: 'Nonsense' }],
      }),
    );
    expect(response.status).toBe(201);
    expect(db.rows('media.custom_fields')[0]?.options).toEqual([]);
  });

  it('409s on a duplicate name, case-insensitively', async () => {
    useDb(new FakeDb({ 'media.custom_fields': [fieldRow({ name: 'Campaign' })] }));
    const response = await POST(
      jsonRequest('POST', { brandId: BRAND_ID, name: 'campaign', type: 'text' }),
    );
    expect(response.status).toBe(409);
  });

  it('409s once the brand is at the field cap', async () => {
    const rows = Array.from({ length: MAX_CUSTOM_FIELDS_PER_BRAND }, (_, index) =>
      fieldRow({ id: `field-${index}`, name: `Field ${index}`, position: index }),
    );
    const db = useDb(new FakeDb({ 'media.custom_fields': rows }));

    const response = await POST(
      jsonRequest('POST', { brandId: BRAND_ID, name: 'One too many', type: 'text' }),
    );
    expect(response.status).toBe(409);
    expect(db.rows('media.custom_fields')).toHaveLength(MAX_CUSTOM_FIELDS_PER_BRAND);
  });

  it('rejects callers without brand access', async () => {
    useDb(new FakeDb({ 'media.custom_fields': [] }), { hasBrandAccess: false });
    const response = await POST(
      jsonRequest('POST', { brandId: BRAND_ID, name: 'Campaign', type: 'text' }),
    );
    expect(response.status).toBe(403);
  });
});

describe('PATCH /api/library/custom-fields', () => {
  it('renames, re-orders, and relabels options', async () => {
    const db = useDb(
      new FakeDb({
        'media.custom_fields': [
          fieldRow({
            type: 'single_select',
            name: 'Rating',
            options: [{ id: 'r1', label: '★' }],
          }),
        ],
      }),
    );

    const response = await PATCH(
      jsonRequest('PATCH', {
        brandId: BRAND_ID,
        fieldId: FIELD_ID,
        name: 'Star rating',
        position: 3,
        options: [
          { id: 'r1', label: 'One star' },
          { id: 'r2', label: 'Two stars' },
        ],
      }),
    );
    expect(response.status).toBe(200);

    const stored = db.rows('media.custom_fields')[0];
    expect(stored?.name).toBe('Star rating');
    expect(stored?.position).toBe(3);
    expect(stored?.options).toHaveLength(2);
  });

  it('rejects options on a type that cannot hold them', async () => {
    useDb(new FakeDb({ 'media.custom_fields': [fieldRow({ type: 'text' })] }));
    const response = await PATCH(
      jsonRequest('PATCH', {
        brandId: BRAND_ID,
        fieldId: FIELD_ID,
        options: [{ id: 'x', label: 'X' }],
      }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects emptying a select’s options', async () => {
    useDb(
      new FakeDb({
        'media.custom_fields': [
          fieldRow({ type: 'multi_select', options: [{ id: 'a', label: 'A' }] }),
        ],
      }),
    );
    const response = await PATCH(
      jsonRequest('PATCH', { brandId: BRAND_ID, fieldId: FIELD_ID, options: [] }),
    );
    expect(response.status).toBe(422);
  });

  it('409s when a rename collides with a sibling', async () => {
    useDb(
      new FakeDb({
        'media.custom_fields': [
          fieldRow({ id: FIELD_ID, name: 'Campaign' }),
          fieldRow({ id: FOREIGN_FIELD_ID, name: 'Shoot date', type: 'date', position: 1 }),
        ],
      }),
    );
    const response = await PATCH(
      jsonRequest('PATCH', { brandId: BRAND_ID, fieldId: FOREIGN_FIELD_ID, name: 'Campaign' }),
    );
    expect(response.status).toBe(409);
  });

  it('404s on a field that belongs to another brand', async () => {
    useDb(
      new FakeDb({
        'media.custom_fields': [fieldRow({ id: FOREIGN_FIELD_ID, brand_id: OTHER_BRAND })],
      }),
    );
    const response = await PATCH(
      jsonRequest('PATCH', { brandId: BRAND_ID, fieldId: FOREIGN_FIELD_ID, name: 'Mine now' }),
    );
    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/library/custom-fields', () => {
  it('drops the field', async () => {
    const db = useDb(new FakeDb({ 'media.custom_fields': [fieldRow()] }));

    const response = await DELETE(queryRequest({ brandId: BRAND_ID, fieldId: FIELD_ID }));
    expect(response.status).toBe(200);
    expect(db.rows('media.custom_fields')).toHaveLength(0);
  });

  it('404s on a field that belongs to another brand', async () => {
    const db = useDb(
      new FakeDb({
        'media.custom_fields': [fieldRow({ id: FOREIGN_FIELD_ID, brand_id: OTHER_BRAND })],
      }),
    );

    const response = await DELETE(queryRequest({ brandId: BRAND_ID, fieldId: FOREIGN_FIELD_ID }));
    expect(response.status).toBe(404);
    expect(db.rows('media.custom_fields')).toHaveLength(1);
  });

  it('rejects a malformed fieldId', async () => {
    const response = await DELETE(queryRequest({ brandId: BRAND_ID, fieldId: 'nope' }));
    expect(response.status).toBe(422);
  });
});
