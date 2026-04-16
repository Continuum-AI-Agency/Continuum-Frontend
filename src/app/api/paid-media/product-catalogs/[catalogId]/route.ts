import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  normalizeNullableText,
  productCatalogRecordSchema,
  productCatalogUpdateSchema,
  type ProductCatalogRecord,
} from "@/lib/schemas/productCatalogs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PRODUCT_CATALOG_TABLE = "paid_media_product_catalogs" as never;

const paramsSchema = z.object({
  catalogId: z.string().uuid(),
});

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

type ProductCatalogUpdatePayload = Partial<Omit<ProductCatalogRow, "id" | "brand_id" | "created_at" | "updated_at">>;

function normalizeProductCatalogRow(input: unknown): ProductCatalogRecord | null {
  if (!input || typeof input !== "object") return null;
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
  "id, brand_id, external_catalog_id, name, business_id, catalog_store_id, vertical, feed_url, default_image_url, fallback_image_url, linked_ad_object_level, linked_ad_object_ids, data_feed_enabled, product_tagging_enabled, sync_status, product_count, feed_count, product_set_count, last_synced_at, notes, created_at, updated_at";

function hasOwn<T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export const runtime = "nodejs";

export async function PUT(request: NextRequest, context: { params: Promise<{ catalogId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid catalog id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = productCatalogUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updates: ProductCatalogUpdatePayload = {};
    if (hasOwn(parsed.data, "name")) {
      updates.name = parsed.data.name?.trim();
    }
    if (hasOwn(parsed.data, "externalCatalogId")) {
      updates.external_catalog_id = parsed.data.externalCatalogId?.trim();
    }
    if (hasOwn(parsed.data, "businessId")) {
      updates.business_id = normalizeNullableText(parsed.data.businessId);
    }
    if (hasOwn(parsed.data, "catalogStoreId")) {
      updates.catalog_store_id = normalizeNullableText(parsed.data.catalogStoreId);
    }
    if (hasOwn(parsed.data, "vertical")) {
      updates.vertical = parsed.data.vertical;
    }
    if (hasOwn(parsed.data, "feedUrl")) {
      updates.feed_url = normalizeNullableText(parsed.data.feedUrl);
    }
    if (hasOwn(parsed.data, "defaultImageUrl")) {
      updates.default_image_url = normalizeNullableText(parsed.data.defaultImageUrl);
    }
    if (hasOwn(parsed.data, "fallbackImageUrl")) {
      updates.fallback_image_url = normalizeNullableText(parsed.data.fallbackImageUrl);
    }
    if (hasOwn(parsed.data, "linkedAdObjectLevel")) {
      updates.linked_ad_object_level = parsed.data.linkedAdObjectLevel;
    }
    if (hasOwn(parsed.data, "linkedAdObjectIds")) {
      updates.linked_ad_object_ids = Array.from(new Set(parsed.data.linkedAdObjectIds ?? []));
    }
    if (hasOwn(parsed.data, "dataFeedEnabled")) {
      updates.data_feed_enabled = parsed.data.dataFeedEnabled;
    }
    if (hasOwn(parsed.data, "productTaggingEnabled")) {
      updates.product_tagging_enabled = parsed.data.productTaggingEnabled;
    }
    if (hasOwn(parsed.data, "syncStatus")) {
      updates.sync_status = parsed.data.syncStatus;
    }
    if (hasOwn(parsed.data, "productCount")) {
      updates.product_count = parsed.data.productCount;
    }
    if (hasOwn(parsed.data, "feedCount")) {
      updates.feed_count = parsed.data.feedCount;
    }
    if (hasOwn(parsed.data, "productSetCount")) {
      updates.product_set_count = parsed.data.productSetCount;
    }
    if (hasOwn(parsed.data, "lastSyncedAt")) {
      updates.last_synced_at = parsed.data.lastSyncedAt ?? null;
    }
    if (hasOwn(parsed.data, "notes")) {
      updates.notes = normalizeNullableText(parsed.data.notes);
    }

    const { data, error } = await supabase
      .schema("paid_media" as never)
      .from(PRODUCT_CATALOG_TABLE)
      .update(updates as never)
      .eq("id", params.data.catalogId)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const catalog = normalizeProductCatalogRow(data as ProductCatalogRow);
    if (!catalog) {
      return NextResponse.json({ error: "Invalid product catalog response" }, { status: 502 });
    }

    return NextResponse.json({ catalog }, { status: 200 });
  } catch (error) {
    console.error("Failed to update product catalog", error);
    return NextResponse.json({ error: "Failed to update product catalog" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ catalogId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid catalog id" }, { status: 400 });
  }

  // Optional Meta deletion params — if provided, catalog is also removed from Meta before DB delete.
  let brandId: string | undefined;
  let metaAccountId: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (typeof b.brandId === "string" && b.brandId.trim()) brandId = b.brandId.trim();
    if (typeof b.metaAccountId === "string" && b.metaAccountId.trim()) metaAccountId = b.metaAccountId.trim();
  } catch {
    // body is optional — proceed without it
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch catalog to get externalCatalogId for Meta deletion
    const { data: catalogRow, error: fetchError } = await supabase
      .schema("paid_media" as never)
      .from(PRODUCT_CATALOG_TABLE)
      .select("id, external_catalog_id")
      .eq("id", params.data.catalogId)
      .single();

    if (fetchError || !catalogRow) {
      return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
    }

    const externalCatalogId = (catalogRow as { external_catalog_id: string }).external_catalog_id?.trim();

    // Attempt Meta deletion — log failures but never block the DB delete
    if (brandId && metaAccountId && externalCatalogId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) {
        try {
          const metaResp = await fetch(`${supabaseUrl}/functions/v1/catalog-delete-meta`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ brandId, externalCatalogId, metaAccountId }),
            cache: "no-store",
          });
          if (!metaResp.ok) {
            const detail = await metaResp.json().catch(() => ({}));
            console.error("catalog-delete-meta failed", { status: metaResp.status, detail });
          }
        } catch (metaError) {
          console.error("Failed to invoke catalog-delete-meta", metaError);
        }
      }
    }

    const { error } = await supabase
      .schema("paid_media" as never)
      .from(PRODUCT_CATALOG_TABLE)
      .delete()
      .eq("id", params.data.catalogId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete product catalog", error);
    return NextResponse.json({ error: "Failed to delete product catalog" }, { status: 500 });
  }
}
