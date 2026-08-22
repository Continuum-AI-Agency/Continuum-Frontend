import {
  createCustomFieldRequestSchema,
  customFieldSchema,
  deleteCustomFieldRequestSchema,
  listCustomFieldsResponseSchema,
  MAX_CUSTOM_FIELDS_PER_BRAND,
  updateCustomFieldRequestSchema,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CUSTOM_FIELD_SELECT,
  type CustomFieldRow,
  ensureBrandCustomFields,
  loadBrandCustomFields,
  loadCustomField,
  rowToCustomField,
} from '@/lib/library/customFields.server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const UNIQUE_VIOLATION = '23505';

const listQuerySchema = z.object({ brandId: z.string().uuid() });

type Session = { userId: string; client: Awaited<ReturnType<typeof createSupabaseServerClient>> };

// Authenticate, then gate on brand membership. The tables' RLS would reject a
// non-member anyway; this turns that into an honest 403 instead of an empty list.
async function openSession(brandId: string): Promise<Session | Response> {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!(await callerHasBrandAccess(client, brandId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { userId: user.id, client };
}

function isResponse(value: Session | Response): value is Response {
  return value instanceof Response;
}

// A select is defined by its options; text and date have none, and letting an
// option list ride along on them would leave a vocabulary nothing can select.
function optionsFor(type: string, options: unknown[] | undefined): unknown[] {
  return type === 'single_select' || type === 'multi_select' ? (options ?? []) : [];
}

// GET /api/library/custom-fields?brandId — the brand's field vocabulary, seeded
// with the defaults on first read.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({ brandId: url.searchParams.get('brandId') });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId } = parsed.data;

  const session = await openSession(brandId);
  if (isResponse(session)) return session;

  try {
    const fields = await ensureBrandCustomFields(session.client, brandId, session.userId);
    return NextResponse.json(listCustomFieldsResponseSchema.parse({ fields }));
  } catch {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

// POST /api/library/custom-fields — create one field.
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = createCustomFieldRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, name, type, options } = parsed.data;

  const session = await openSession(brandId);
  if (isResponse(session)) return session;

  let existing: Awaited<ReturnType<typeof loadBrandCustomFields>>;
  try {
    existing = await loadBrandCustomFields(session.client, brandId);
  } catch {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (existing.length >= MAX_CUSTOM_FIELDS_PER_BRAND) {
    return NextResponse.json(
      { error: `A brand can hold at most ${MAX_CUSTOM_FIELDS_PER_BRAND} custom fields` },
      { status: 409 },
    );
  }

  // New fields land at the end of the manager's order.
  const position = existing.reduce((max, field) => Math.max(max, field.position + 1), 0);

  const { data, error } = await mediaSchema(session.client)
    .from('custom_fields')
    .insert({
      brand_id: brandId,
      name,
      type,
      options: optionsFor(type, options),
      position,
      is_default: false,
      created_by: session.userId,
    })
    .select(CUSTOM_FIELD_SELECT)
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    return NextResponse.json({ error: `A field named "${name}" already exists` }, { status: 409 });
  }
  if (error || !data) {
    console.error('[library/custom-fields] create failed', error);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }

  return NextResponse.json(
    { field: customFieldSchema.parse(rowToCustomField(data as unknown as CustomFieldRow)) },
    { status: 201 },
  );
}

// PATCH /api/library/custom-fields — rename, re-order, or revise the options.
export async function PATCH(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = updateCustomFieldRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, fieldId, name, options, position } = parsed.data;

  const session = await openSession(brandId);
  if (isResponse(session)) return session;

  let field: Awaited<ReturnType<typeof loadCustomField>>;
  try {
    field = await loadCustomField(session.client, brandId, fieldId);
  } catch {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  if (!field) {
    return NextResponse.json({ error: 'Field not found' }, { status: 404 });
  }

  const isSelect = field.type === 'single_select' || field.type === 'multi_select';
  if (options !== undefined) {
    if (!isSelect) {
      return NextResponse.json(
        { error: `A ${field.type} field does not take options` },
        { status: 422 },
      );
    }
    if (options.length === 0) {
      return NextResponse.json(
        { error: 'A select field needs at least one option' },
        { status: 422 },
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (options !== undefined) patch.options = options;
  if (position !== undefined) patch.position = position;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ field: customFieldSchema.parse(field) });
  }

  const { data, error } = await mediaSchema(session.client)
    .from('custom_fields')
    .update(patch)
    .eq('id', fieldId)
    .eq('brand_id', brandId)
    .select(CUSTOM_FIELD_SELECT)
    .single();

  if (error?.code === UNIQUE_VIOLATION) {
    return NextResponse.json({ error: `A field named "${name}" already exists` }, { status: 409 });
  }
  if (error || !data) {
    console.error('[library/custom-fields] update failed', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({
    field: customFieldSchema.parse(rowToCustomField(data as unknown as CustomFieldRow)),
  });
}

// DELETE /api/library/custom-fields?brandId&fieldId — drops the field and, by
// the value table's FK cascade, every value assets held under it.
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const parsed = deleteCustomFieldRequestSchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    fieldId: url.searchParams.get('fieldId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, fieldId } = parsed.data;

  const session = await openSession(brandId);
  if (isResponse(session)) return session;

  let field: Awaited<ReturnType<typeof loadCustomField>>;
  try {
    field = await loadCustomField(session.client, brandId, fieldId);
  } catch {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  if (!field) {
    return NextResponse.json({ error: 'Field not found' }, { status: 404 });
  }

  const { error } = await mediaSchema(session.client)
    .from('custom_fields')
    .delete()
    .eq('id', fieldId)
    .eq('brand_id', brandId);
  if (error) {
    console.error('[library/custom-fields] delete failed', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ deleted: fieldId });
}
