import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  productAdActivityRecordSchema,
  catalogProductRecordSchema,
  paidMediaAdObjectRecordSchema,
  productCatalogLinkRecordSchema,
  removeCatalogProductSchema,
  renameCatalogProductSchema,
  toNullableText,
  upsertProductCatalogLinkSchema,
  type ProductCatalogLinkRecord,
} from "@/lib/schemas/productCatalogLinks";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PRODUCT_TABLE = "paid_media_catalog_products" as never;
const AD_OBJECT_TABLE = "paid_media_ad_objects" as never;
const ACTIVITY_TABLE = "paid_media_product_ad_activity" as never;
const CATALOG_TABLE = "paid_media_product_catalogs" as never;

const paramsSchema = z.object({
  catalogId: z.string().uuid(),
});

const querySchema = z.object({
  brandId: z.string().uuid(),
  activeOnly: z.enum(["true", "false"]).optional(),
});

type ProductRow = {
  id: string;
  brand_id: string;
  catalog_id: string;
  external_product_id: string;
  title: string | null;
  availability: string;
  image_url: string | null;
  product_url: string | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
};

type AdObjectRow = {
  id: string;
  brand_id: string;
  platform: string;
  object_type: string;
  external_object_id: string;
  name: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  brand_id: string;
  catalog_id: string;
  product_id: string;
  ad_object_id: string;
  is_active: boolean;
  first_seen_at: string;
  last_seen_at: string;
  active_from: string | null;
  active_to: string | null;
  source: string;
  sync_job_id: string | null;
  created_at: string;
  updated_at: string;
};

const PRODUCT_SELECT =
  "id, brand_id, catalog_id, external_product_id, title, availability, image_url, product_url, currency, created_at, updated_at";
const AD_OBJECT_SELECT =
  "id, brand_id, platform, object_type, external_object_id, name, status, created_at, updated_at";
const ACTIVITY_SELECT =
  "id, brand_id, catalog_id, product_id, ad_object_id, is_active, first_seen_at, last_seen_at, active_from, active_to, source, sync_job_id, created_at, updated_at";

function normalizeProductRow(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const parsed = catalogProductRecordSchema.safeParse({
    id: row.id,
    brandId: row.brand_id,
    catalogId: row.catalog_id,
    externalProductId: row.external_product_id,
    title: row.title,
    availability: row.availability,
    imageUrl: row.image_url,
    productUrl: row.product_url,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  return parsed.success ? parsed.data : null;
}

function normalizeAdObjectRow(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const parsed = paidMediaAdObjectRecordSchema.safeParse({
    id: row.id,
    brandId: row.brand_id,
    platform: row.platform,
    objectType: row.object_type,
    externalObjectId: row.external_object_id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  return parsed.success ? parsed.data : null;
}

function normalizeActivityRow(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const parsed = productAdActivityRecordSchema.safeParse({
    id: row.id,
    brandId: row.brand_id,
    catalogId: row.catalog_id,
    productId: row.product_id,
    adObjectId: row.ad_object_id,
    isActive: row.is_active,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    activeFrom: row.active_from,
    activeTo: row.active_to,
    source: row.source,
    syncJobId: row.sync_job_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  return parsed.success ? parsed.data : null;
}

function buildLinkRecord(
  activity: ReturnType<typeof normalizeActivityRow>,
  product: ReturnType<typeof normalizeProductRow>,
  adObject: ReturnType<typeof normalizeAdObjectRow>
): ProductCatalogLinkRecord | null {
  if (!activity || !product || !adObject) return null;
  const parsed = productCatalogLinkRecordSchema.safeParse({ activity, product, adObject });
  return parsed.success ? parsed.data : null;
}

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ catalogId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid catalog id" }, { status: 400 });
  }

  const query = querySchema.safeParse({
    brandId: request.nextUrl.searchParams.get("brandId"),
    activeOnly: request.nextUrl.searchParams.get("activeOnly") ?? undefined,
  });

  if (!query.success) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  const activeOnly = query.data.activeOnly !== "false";

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: catalogMatch, error: catalogMatchError } = await supabase
      .schema("brand_profiles")
      .from(CATALOG_TABLE)
      .select("id")
      .eq("id", params.data.catalogId)
      .eq("brand_id", query.data.brandId)
      .maybeSingle();

    if (catalogMatchError) {
      return NextResponse.json({ error: catalogMatchError.message }, { status: 500 });
    }

    if (!catalogMatch) {
      return NextResponse.json({ error: "Catalog not found for brand" }, { status: 404 });
    }

    let activityQuery = supabase
      .schema("brand_profiles")
      .from(ACTIVITY_TABLE)
      .select(ACTIVITY_SELECT)
      .eq("brand_id", query.data.brandId)
      .eq("catalog_id", params.data.catalogId)
      .order("last_seen_at", { ascending: false });

    if (activeOnly) {
      activityQuery = activityQuery.eq("is_active", true);
    }

    const { data: activityRows, error: activityError } = await activityQuery;

    if (activityError) {
      return NextResponse.json({ error: activityError.message }, { status: 500 });
    }

    const activities = (activityRows ?? [])
      .map((row) => normalizeActivityRow(row as ActivityRow))
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (activities.length === 0) {
      return NextResponse.json({ links: [] }, { status: 200 });
    }

    const productIds = Array.from(new Set(activities.map((row) => row.productId)));
    const adObjectIds = Array.from(new Set(activities.map((row) => row.adObjectId)));

    const [{ data: productRows, error: productError }, { data: adObjectRows, error: adObjectError }] = await Promise.all([
      supabase
        .schema("brand_profiles")
        .from(PRODUCT_TABLE)
        .select(PRODUCT_SELECT)
        .eq("brand_id", query.data.brandId)
        .eq("catalog_id", params.data.catalogId)
        .in("id", productIds),
      supabase
        .schema("brand_profiles")
        .from(AD_OBJECT_TABLE)
        .select(AD_OBJECT_SELECT)
        .eq("brand_id", query.data.brandId)
        .in("id", adObjectIds),
    ]);

    if (productError) {
      return NextResponse.json({ error: productError.message }, { status: 500 });
    }
    if (adObjectError) {
      return NextResponse.json({ error: adObjectError.message }, { status: 500 });
    }

    const productsById = new Map(
      (productRows ?? [])
        .map((row) => normalizeProductRow(row as ProductRow))
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .map((row) => [row.id, row])
    );

    const adObjectsById = new Map(
      (adObjectRows ?? [])
        .map((row) => normalizeAdObjectRow(row as AdObjectRow))
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .map((row) => [row.id, row])
    );

    const links = activities
      .map((activity) => buildLinkRecord(activity, productsById.get(activity.productId) ?? null, adObjectsById.get(activity.adObjectId) ?? null))
      .filter((link): link is ProductCatalogLinkRecord => link !== null);

    return NextResponse.json({ links }, { status: 200 });
  } catch (error) {
    console.error("Failed to list product catalog links", error);
    return NextResponse.json({ error: "Failed to list product catalog links" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ catalogId: string }> }) {
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

  const parsed = upsertProductCatalogLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const seenAt = parsed.data.activity.seenAt ?? new Date().toISOString();

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: catalogMatch, error: catalogMatchError } = await supabase
      .schema("brand_profiles")
      .from(CATALOG_TABLE)
      .select("id")
      .eq("id", params.data.catalogId)
      .eq("brand_id", parsed.data.brandId)
      .maybeSingle();

    if (catalogMatchError) {
      return NextResponse.json({ error: catalogMatchError.message }, { status: 500 });
    }

    if (!catalogMatch) {
      return NextResponse.json({ error: "Catalog not found for brand" }, { status: 404 });
    }

    const { data: productUpsertData, error: productUpsertError } = await supabase
      .schema("brand_profiles")
      .from(PRODUCT_TABLE)
      .upsert(
        {
          brand_id: parsed.data.brandId,
          catalog_id: params.data.catalogId,
          external_product_id: parsed.data.product.externalProductId.trim(),
          title: toNullableText(parsed.data.product.title),
          availability: parsed.data.product.availability,
          image_url: toNullableText(parsed.data.product.imageUrl),
          product_url: toNullableText(parsed.data.product.productUrl),
          currency: toNullableText(parsed.data.product.currency)?.toUpperCase() ?? null,
        } as never,
        { onConflict: "brand_id,catalog_id,external_product_id" }
      )
      .select(PRODUCT_SELECT)
      .single();

    if (productUpsertError) {
      return NextResponse.json({ error: productUpsertError.message }, { status: 500 });
    }

    const product = normalizeProductRow(productUpsertData as ProductRow);
    if (!product) {
      return NextResponse.json({ error: "Invalid product response" }, { status: 502 });
    }

    const { data: adObjectUpsertData, error: adObjectUpsertError } = await supabase
      .schema("brand_profiles")
      .from(AD_OBJECT_TABLE)
      .upsert(
        {
          brand_id: parsed.data.brandId,
          platform: parsed.data.adObject.platform,
          object_type: parsed.data.adObject.objectType,
          external_object_id: parsed.data.adObject.externalObjectId.trim(),
          name: toNullableText(parsed.data.adObject.name),
          status: toNullableText(parsed.data.adObject.status),
        } as never,
        { onConflict: "brand_id,platform,object_type,external_object_id" }
      )
      .select(AD_OBJECT_SELECT)
      .single();

    if (adObjectUpsertError) {
      return NextResponse.json({ error: adObjectUpsertError.message }, { status: 500 });
    }

    const adObject = normalizeAdObjectRow(adObjectUpsertData as AdObjectRow);
    if (!adObject) {
      return NextResponse.json({ error: "Invalid ad object response" }, { status: 502 });
    }

    const { data: existingActivityData, error: existingActivityError } = await supabase
      .schema("brand_profiles")
      .from(ACTIVITY_TABLE)
      .select(ACTIVITY_SELECT)
      .eq("brand_id", parsed.data.brandId)
      .eq("catalog_id", params.data.catalogId)
      .eq("product_id", product.id)
      .eq("ad_object_id", adObject.id)
      .maybeSingle();

    if (existingActivityError) {
      return NextResponse.json({ error: existingActivityError.message }, { status: 500 });
    }

    let activityData: ActivityRow | null = null;

    if (existingActivityData) {
      const existing = existingActivityData as ActivityRow;
      const { data: updatedActivity, error: updateActivityError } = await supabase
        .schema("brand_profiles")
        .from(ACTIVITY_TABLE)
        .update(
          {
            is_active: parsed.data.activity.isActive,
            last_seen_at: seenAt,
            active_from:
              parsed.data.activity.activeFrom ??
              (parsed.data.activity.isActive
                ? existing.active_from ?? seenAt
                : existing.active_from),
            active_to:
              parsed.data.activity.isActive
                ? null
                : parsed.data.activity.activeTo ?? seenAt,
            source: parsed.data.activity.source,
            sync_job_id: parsed.data.activity.syncJobId ?? null,
          } as never
        )
        .eq("id", existing.id)
        .select(ACTIVITY_SELECT)
        .single();

      if (updateActivityError) {
        return NextResponse.json({ error: updateActivityError.message }, { status: 500 });
      }

      activityData = updatedActivity as ActivityRow;
    } else {
      const { data: insertedActivity, error: insertActivityError } = await supabase
        .schema("brand_profiles")
        .from(ACTIVITY_TABLE)
        .insert(
          {
            brand_id: parsed.data.brandId,
            catalog_id: params.data.catalogId,
            product_id: product.id,
            ad_object_id: adObject.id,
            is_active: parsed.data.activity.isActive,
            first_seen_at: seenAt,
            last_seen_at: seenAt,
            active_from:
              parsed.data.activity.activeFrom ??
              (parsed.data.activity.isActive ? seenAt : null),
            active_to:
              parsed.data.activity.isActive
                ? null
                : parsed.data.activity.activeTo ?? seenAt,
            source: parsed.data.activity.source,
            sync_job_id: parsed.data.activity.syncJobId ?? null,
          } as never
        )
        .select(ACTIVITY_SELECT)
        .single();

      if (insertActivityError) {
        return NextResponse.json({ error: insertActivityError.message }, { status: 500 });
      }

      activityData = insertedActivity as ActivityRow;
    }

    const activity = normalizeActivityRow(activityData);
    const link = buildLinkRecord(activity, product, adObject);

    if (!link) {
      return NextResponse.json({ error: "Invalid link response" }, { status: 502 });
    }

    return NextResponse.json({ link }, { status: 200 });
  } catch (error) {
    console.error("Failed to upsert product catalog link", error);
    return NextResponse.json({ error: "Failed to upsert product catalog link" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ catalogId: string }> }) {
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

  const parsed = renameCatalogProductSchema.safeParse(body);
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

    const { data: catalogMatch, error: catalogMatchError } = await supabase
      .schema("brand_profiles")
      .from(CATALOG_TABLE)
      .select("id")
      .eq("id", params.data.catalogId)
      .eq("brand_id", parsed.data.brandId)
      .maybeSingle();

    if (catalogMatchError) {
      return NextResponse.json({ error: catalogMatchError.message }, { status: 500 });
    }

    if (!catalogMatch) {
      return NextResponse.json({ error: "Catalog not found for brand" }, { status: 404 });
    }

    const { data: updatedProduct, error: updateError } = await supabase
      .schema("brand_profiles")
      .from(PRODUCT_TABLE)
      .update(
        {
          title: toNullableText(parsed.data.title),
        } as never
      )
      .eq("brand_id", parsed.data.brandId)
      .eq("catalog_id", params.data.catalogId)
      .eq("external_product_id", parsed.data.externalProductId.trim())
      .select("id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updatedProduct) {
      return NextResponse.json({ error: "Product not found in catalog" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to rename catalog product", error);
    return NextResponse.json({ error: "Failed to rename catalog product" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ catalogId: string }> }) {
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

  const parsed = removeCatalogProductSchema.safeParse(body);
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

    const { data: catalogMatch, error: catalogMatchError } = await supabase
      .schema("brand_profiles")
      .from(CATALOG_TABLE)
      .select("id")
      .eq("id", params.data.catalogId)
      .eq("brand_id", parsed.data.brandId)
      .maybeSingle();

    if (catalogMatchError) {
      return NextResponse.json({ error: catalogMatchError.message }, { status: 500 });
    }

    if (!catalogMatch) {
      return NextResponse.json({ error: "Catalog not found for brand" }, { status: 404 });
    }

    const productLookup = await supabase
      .schema("brand_profiles")
      .from(PRODUCT_TABLE)
      .select("id")
      .eq("brand_id", parsed.data.brandId)
      .eq("catalog_id", params.data.catalogId)
      .eq("external_product_id", parsed.data.externalProductId.trim())
      .maybeSingle();
    const productLookupError = productLookup.error;
    const productRow = productLookup.data as { id: string } | null;

    if (productLookupError) {
      return NextResponse.json({ error: productLookupError.message }, { status: 500 });
    }

    if (!productRow?.id) {
      return NextResponse.json({ error: "Product not found in catalog" }, { status: 404 });
    }

    const { error: activityDeleteError } = await supabase
      .schema("brand_profiles")
      .from(ACTIVITY_TABLE)
      .delete()
      .eq("brand_id", parsed.data.brandId)
      .eq("catalog_id", params.data.catalogId)
      .eq("product_id", productRow.id);

    if (activityDeleteError) {
      return NextResponse.json({ error: activityDeleteError.message }, { status: 500 });
    }

    const { error: productDeleteError } = await supabase
      .schema("brand_profiles")
      .from(PRODUCT_TABLE)
      .delete()
      .eq("id", productRow.id)
      .eq("brand_id", parsed.data.brandId);

    if (productDeleteError) {
      return NextResponse.json({ error: productDeleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to remove catalog product", error);
    return NextResponse.json({ error: "Failed to remove catalog product" }, { status: 500 });
  }
}
