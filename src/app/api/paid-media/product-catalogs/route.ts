import { type NextRequest, NextResponse } from 'next/server';

import {
  normalizeNullableText,
  type ProductCatalogRecord,
  productCatalogCreateSchema,
  productCatalogRecordSchema,
  productCatalogVerticalSchema,
} from '@/lib/schemas/productCatalogs';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const PRODUCT_CATALOG_TABLE = 'paid_media_product_catalogs' as never;

type ProductCatalogRow = {
  id: string;
  brand_id: string;
  external_catalog_id: string;
  name: string;
  business_id: string | null;
  catalog_store_id: string | null;
  vertical: string;
  feed_url: string | null;
  default_image_url: string | null;
  fallback_image_url: string | null;
  linked_ad_object_level: string;
  linked_ad_object_ids: string[];
  data_feed_enabled: boolean;
  product_tagging_enabled: boolean;
  sync_status: string;
  product_count: number;
  feed_count: number;
  product_set_count: number;
  last_synced_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ProductCatalogInsertPayload = Omit<ProductCatalogRow, 'id' | 'created_at' | 'updated_at'>;

type MetaCatalogCreateResponse = {
  catalogId: string;
  vertical?: string | null;
  productCount?: number | null;
  feedCount?: number | null;
  productSetCount?: number | null;
};

function normalizeProductCatalogRow(input: unknown): ProductCatalogRecord | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;

  const parsed = productCatalogRecordSchema.safeParse({
    id: row.id,
    brandId: row.brand_id,
    externalCatalogId: row.external_catalog_id,
    name: row.name,
    businessId: row.business_id,
    catalogStoreId: row.catalog_store_id,
    vertical: row.vertical,
    feedUrl: row.feed_url,
    defaultImageUrl: row.default_image_url,
    fallbackImageUrl: row.fallback_image_url,
    linkedAdObjectLevel: row.linked_ad_object_level,
    linkedAdObjectIds: row.linked_ad_object_ids,
    dataFeedEnabled: row.data_feed_enabled,
    productTaggingEnabled: row.product_tagging_enabled,
    syncStatus: row.sync_status,
    productCount: row.product_count,
    feedCount: row.feed_count,
    productSetCount: row.product_set_count,
    lastSyncedAt: row.last_synced_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  return parsed.success ? parsed.data : null;
}

const SELECT_COLUMNS =
  'id, brand_id, external_catalog_id, name, business_id, catalog_store_id, vertical, feed_url, default_image_url, fallback_image_url, linked_ad_object_level, linked_ad_object_ids, data_feed_enabled, product_tagging_enabled, sync_status, product_count, feed_count, product_set_count, last_synced_at, notes, created_at, updated_at';

function normalizeMetaCatalogCreateResponse(input: unknown): MetaCatalogCreateResponse | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const catalogId =
    typeof row.catalogId === 'string' && row.catalogId.trim().length > 0
      ? row.catalogId.trim()
      : typeof row.id === 'string' && row.id.trim().length > 0
        ? row.id.trim()
        : null;

  if (!catalogId) return null;

  const vertical =
    typeof row.vertical === 'string' && row.vertical.trim().length > 0 ? row.vertical.trim() : null;

  const productCount =
    typeof row.productCount === 'number' && Number.isFinite(row.productCount)
      ? Math.max(0, Math.trunc(row.productCount))
      : null;
  const feedCount =
    typeof row.feedCount === 'number' && Number.isFinite(row.feedCount)
      ? Math.max(0, Math.trunc(row.feedCount))
      : null;
  const productSetCount =
    typeof row.productSetCount === 'number' && Number.isFinite(row.productSetCount)
      ? Math.max(0, Math.trunc(row.productSetCount))
      : null;

  return {
    catalogId,
    vertical,
    productCount,
    feedCount,
    productSetCount,
  };
}

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get('brandId');
  if (!brandId) {
    return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .schema('paid_media' as never)
      .from(PRODUCT_CATALOG_TABLE)
      .select(SELECT_COLUMNS)
      .eq('brand_id', brandId)
      .order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const catalogs = (Array.isArray(data) ? data : [])
      .map((row) => normalizeProductCatalogRow(row as ProductCatalogRow))
      .filter((value): value is ProductCatalogRecord => value !== null);

    return NextResponse.json({ catalogs }, { status: 200 });
  } catch (error) {
    console.error('Failed to list product catalogs', error);
    return NextResponse.json({ error: 'Failed to list product catalogs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = productCatalogCreateSchema.safeParse(body);
  if (!parsed.success) {
    console.error('[product-catalogs POST] 422 field errors:', parsed.error.flatten());
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json({ error: 'Supabase URL is not configured' }, { status: 500 });
    }

    const createResponse = await fetch(`${supabaseUrl}/functions/v1/catalog-create-meta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        brandId: parsed.data.brandId,
        businessId: parsed.data.businessId.trim(),
        catalogStoreId: parsed.data.catalogStoreId.trim(),
        name: parsed.data.name.trim(),
        metaAccountId: normalizeNullableText(parsed.data.metaAccountId) ?? undefined,
        vertical: parsed.data.vertical,
      }),
      cache: 'no-store',
    });

    const createBody = await createResponse
      .json()
      .catch(() => ({ error: 'Invalid edge function response' }));
    if (!createResponse.ok) {
      const edgeError =
        createBody && typeof createBody === 'object' && 'error' in createBody
          ? String((createBody as { error?: unknown }).error ?? 'Catalog create failed')
          : 'Catalog create failed';
      return NextResponse.json({ error: edgeError }, { status: createResponse.status });
    }

    const metaCatalog = normalizeMetaCatalogCreateResponse(createBody);
    if (!metaCatalog) {
      return NextResponse.json({ error: 'Invalid catalog-create-meta response' }, { status: 502 });
    }

    const payload: ProductCatalogInsertPayload = {
      brand_id: parsed.data.brandId,
      external_catalog_id: metaCatalog.catalogId,
      name: parsed.data.name.trim(),
      business_id: parsed.data.businessId.trim(),
      catalog_store_id: parsed.data.catalogStoreId.trim(),
      vertical: productCatalogVerticalSchema.safeParse(metaCatalog.vertical ?? '').success
        ? (metaCatalog.vertical as ProductCatalogInsertPayload['vertical'])
        : parsed.data.vertical,
      feed_url: null,
      default_image_url: null,
      fallback_image_url: null,
      linked_ad_object_level: 'adset',
      linked_ad_object_ids: [],
      data_feed_enabled: true,
      product_tagging_enabled: true,
      sync_status: 'draft',
      product_count: metaCatalog.productCount ?? 0,
      feed_count: metaCatalog.feedCount ?? 0,
      product_set_count: metaCatalog.productSetCount ?? 0,
      last_synced_at: null,
      notes: null,
    };

    const { data, error } = await supabase
      .schema('paid_media' as never)
      .from(PRODUCT_CATALOG_TABLE)
      .insert(payload as never)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const catalog = normalizeProductCatalogRow(data as ProductCatalogRow);
    if (!catalog) {
      return NextResponse.json({ error: 'Invalid product catalog response' }, { status: 502 });
    }

    return NextResponse.json({ catalog }, { status: 201 });
  } catch (error) {
    console.error('Failed to create product catalog', error);
    return NextResponse.json({ error: 'Failed to create product catalog' }, { status: 500 });
  }
}
