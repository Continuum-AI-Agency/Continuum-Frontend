import {
  assetFieldValueSchema,
  listAssetFieldValuesResponseSchema,
  setAssetFieldValueRequestSchema,
} from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateFieldValue } from '@/lib/library/customFields';
import { loadAssetFieldValues, loadCustomField } from '@/lib/library/customFields.server';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const listQuerySchema = z.object({
  brandId: z.string().uuid(),
  assetId: z.string().uuid(),
});

type Session = { userId: string; client: Awaited<ReturnType<typeof createSupabaseServerClient>> };

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

// GET /api/library/asset-fields?brandId&assetId — every value this asset holds.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    brandId: url.searchParams.get('brandId'),
    assetId: url.searchParams.get('assetId'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId } = parsed.data;

  const session = await openSession(brandId);
  if (isResponse(session)) return session;

  try {
    const rows = await loadAssetFieldValues(session.client, brandId, assetId);
    const values = rows.map((row) => ({
      fieldId: row.field_id,
      value: row.value,
      updatedAt: row.updated_at,
    }));
    return NextResponse.json(listAssetFieldValuesResponseSchema.parse({ values }));
  } catch {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

// PUT /api/library/asset-fields — set ONE value on ONE asset.
//
// The value column is jsonb: the database will happily store a single_select
// holding an option id the field never defined, or a date holding "banana". So
// the field is resolved from the DB (never taken on the client's word that it
// belongs to this brand) and the value is narrowed against its declared type.
export async function PUT(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = setAssetFieldValueRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }
  const { brandId, assetId, fieldId, value } = parsed.data;

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

  const { data: asset, error: assetError } = await mediaSchema(session.client)
    .from('assets')
    .select('id')
    .eq('id', assetId)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .maybeSingle();
  if (assetError) {
    console.error('[library/asset-fields] asset lookup failed', assetError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const check = validateFieldValue(field, value);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 422 });
  }

  // Cleared means the row goes away, not a row holding an empty value: "no value"
  // has one representation, so the is_empty filter has one thing to look for.
  if (check.value === null) {
    const { error } = await mediaSchema(session.client)
      .from('asset_field_values')
      .delete()
      .eq('asset_id', assetId)
      .eq('field_id', fieldId)
      .eq('brand_id', brandId);
    if (error) {
      console.error('[library/asset-fields] clear failed', error);
      return NextResponse.json({ error: 'Save failed' }, { status: 500 });
    }
    return NextResponse.json({
      value: assetFieldValueSchema.parse({ fieldId, value: null, updatedAt: null }),
    });
  }

  const { data, error } = await mediaSchema(session.client)
    .from('asset_field_values')
    .upsert(
      {
        asset_id: assetId,
        field_id: fieldId,
        brand_id: brandId,
        value: check.value,
        updated_by: session.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'asset_id,field_id' },
    )
    .select('field_id, value, updated_at')
    .single();

  if (error || !data) {
    console.error('[library/asset-fields] save failed', error);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }

  const row = data as unknown as { field_id: string; value: unknown; updated_at: string | null };
  return NextResponse.json({
    value: assetFieldValueSchema.parse({
      fieldId: row.field_id,
      value: row.value,
      updatedAt: row.updated_at,
    }),
  });
}
