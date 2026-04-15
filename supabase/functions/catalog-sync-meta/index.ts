import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const META_API_VERSION = "v23.0";
const PRODUCT_TABLE = "paid_media_catalog_products" as never;
const AD_OBJECT_TABLE = "paid_media_ad_objects" as never;
const ACTIVITY_TABLE = "paid_media_product_ad_activity" as never;
const CATALOG_TABLE = "paid_media_product_catalogs" as never;

type CatalogRow = {
  id: string;
  brand_id: string;
  linked_ad_object_level: "campaign" | "adset" | "ad";
  linked_ad_object_ids: string[];
};

type ProductRow = {
  id: string;
  external_product_id: string;
};

type AdObjectRow = {
  id: string;
  external_object_id: string;
};

type ActivityRow = {
  id: string;
  product_id: string;
  ad_object_id: string;
  first_seen_at: string;
  active_from: string | null;
};

type SyncPayload = {
  brandId: string;
  catalogId: string;
  adAccountId: string;
  pageSize?: number;
  maxPages?: number;
  maxActivityRows?: number;
  source?: string;
};

type MetaCatalogProduct = {
  externalProductId: string;
  title: string | null;
  availability: "in_stock" | "out_of_stock" | "preorder" | "unknown";
  imageUrl: string | null;
  productUrl: string | null;
  currency: string | null;
};

type MetaAdObject = {
  externalObjectId: string;
  name: string | null;
  status: string | null;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parsePayload(req: Request, body: unknown): SyncPayload {
  const url = new URL(req.url);
  const raw = (body && typeof body === "object" ? (body as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  const brandId = String(raw.brandId ?? url.searchParams.get("brandId") ?? "").trim();
  const catalogId = String(raw.catalogId ?? url.searchParams.get("catalogId") ?? "").trim();
  const adAccountId = String(raw.adAccountId ?? url.searchParams.get("adAccountId") ?? "").trim();
  const source = String(raw.source ?? "sync").trim() || "sync";
  const pageSize = Number(raw.pageSize ?? 100);
  const maxPages = Number(raw.maxPages ?? 5);
  const maxActivityRows = Number(raw.maxActivityRows ?? 5000);

  if (!brandId || !catalogId || !adAccountId) {
    throw new Error("brandId, catalogId, and adAccountId are required.");
  }

  return {
    brandId,
    catalogId,
    adAccountId,
    source,
    pageSize: Number.isFinite(pageSize) ? Math.max(1, Math.min(200, Math.trunc(pageSize))) : 100,
    maxPages: Number.isFinite(maxPages) ? Math.max(1, Math.min(20, Math.trunc(maxPages))) : 5,
    maxActivityRows: Number.isFinite(maxActivityRows)
      ? Math.max(1, Math.min(50000, Math.trunc(maxActivityRows)))
      : 5000,
  };
}

function toNullableTrimmedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toAvailability(value: unknown): "in_stock" | "out_of_stock" | "preorder" | "unknown" {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("in stock") || normalized === "in_stock") return "in_stock";
  if (normalized.includes("out of stock") || normalized === "out_of_stock") return "out_of_stock";
  if (normalized.includes("preorder") || normalized === "preorder") return "preorder";
  return "unknown";
}

function toCurrency(value: unknown): string | null {
  const text = toNullableTrimmedText(value);
  if (!text) return null;
  return text.slice(0, 3).toUpperCase();
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchMetaCatalogProducts(args: {
  catalogId: string;
  accessToken: string;
  pageSize: number;
  maxPages: number;
  log: (message: string, extra?: unknown) => void;
}): Promise<{ products: MetaCatalogProduct[]; pagesFetched: number }> {
  let nextUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${args.catalogId}/products`);
  nextUrl.searchParams.set("fields", "id,retailer_id,name,availability,image_url,url,currency");
  nextUrl.searchParams.set("limit", String(args.pageSize));
  nextUrl.searchParams.set("access_token", args.accessToken);

  const products: MetaCatalogProduct[] = [];
  let pagesFetched = 0;

  while (nextUrl && pagesFetched < args.maxPages) {
    const response = await fetch(nextUrl.toString());
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      args.log("Meta product fetch failed", { status: response.status, payload });
      throw new Error("Failed to fetch catalog products from Meta API");
    }

    const rows = Array.isArray((payload as { data?: unknown[] }).data)
      ? ((payload as { data: Record<string, unknown>[] }).data ?? [])
      : [];

    for (const row of rows) {
      const externalProductId = toNullableTrimmedText(row.retailer_id) ?? toNullableTrimmedText(row.id);
      if (!externalProductId) continue;
      products.push({
        externalProductId,
        title: toNullableTrimmedText(row.name),
        availability: toAvailability(row.availability),
        imageUrl: toNullableTrimmedText(row.image_url),
        productUrl: toNullableTrimmedText(row.url),
        currency: toCurrency(row.currency),
      });
    }

    const paging = payload && typeof payload === "object" ? (payload as { paging?: { next?: unknown } }).paging : null;
    const next = typeof paging?.next === "string" ? paging.next : null;
    nextUrl = next ? new URL(next) : null;
    pagesFetched += 1;
  }

  return { products, pagesFetched };
}

async function fetchMetaAdObjectDetails(args: {
  externalObjectIds: string[];
  accessToken: string;
  log: (message: string, extra?: unknown) => void;
}): Promise<MetaAdObject[]> {
  const results = await Promise.all(
    args.externalObjectIds.map(async (externalObjectId) => {
      const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${externalObjectId}`);
      url.searchParams.set("fields", "id,name,status,effective_status");
      url.searchParams.set("access_token", args.accessToken);
      try {
        const response = await fetch(url.toString());
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          args.log("Meta ad object lookup failed", { externalObjectId, status: response.status, payload });
          return { externalObjectId, name: null, status: null };
        }

        return {
          externalObjectId: toNullableTrimmedText((payload as Record<string, unknown>).id) ?? externalObjectId,
          name: toNullableTrimmedText((payload as Record<string, unknown>).name),
          status:
            toNullableTrimmedText((payload as Record<string, unknown>).effective_status) ??
            toNullableTrimmedText((payload as Record<string, unknown>).status),
        };
      } catch (error) {
        args.log("Meta ad object lookup exception", {
          externalObjectId,
          message: error instanceof Error ? error.message : String(error),
        });
        return { externalObjectId, name: null, status: null };
      }
    }),
  );

  return results;
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (message: string, extra?: unknown) =>
    console.log(`[catalog-sync-meta] ${requestId} ${message}`, extra ?? "");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Supabase environment not configured" }, 500);
    }

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const payload = parsePayload(req, body);
    log("Parsed payload", payload);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(supabaseToken);
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: permissionRow, error: permissionError } = await supabase
      .schema("brand_profiles")
      .from("permissions")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("brand_profile_id", payload.brandId)
      .maybeSingle();

    if (permissionError) {
      log("Permission lookup failed", permissionError);
      return jsonResponse({ error: "Failed to validate brand access" }, 500);
    }
    if (!permissionRow) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: catalogRow, error: catalogError } = await supabase
      .schema("paid_media")
      .from(CATALOG_TABLE)
      .select("id, brand_id, linked_ad_object_level, linked_ad_object_ids")
      .eq("id", payload.catalogId)
      .eq("brand_id", payload.brandId)
      .maybeSingle();

    if (catalogError) {
      log("Catalog lookup failed", catalogError);
      return jsonResponse({ error: "Failed to resolve catalog" }, 500);
    }
    if (!catalogRow) {
      return jsonResponse({ error: "Catalog not found for brand" }, 404);
    }

    log("Resolving Meta access token via RPC", { adAccountId: payload.adAccountId });
    const { data: accessToken, error: tokenError } = await supabase.rpc("get_meta_access_token", {
      p_ad_account_id: payload.adAccountId,
    });
    if (tokenError) {
      log("Meta token RPC failed", tokenError);
    }
    if (!accessToken) {
      return jsonResponse({ error: "Meta account not configured or access token missing" }, 404);
    }

    const fetchedProducts = await fetchMetaCatalogProducts({
      catalogId: payload.catalogId,
      accessToken,
      pageSize: payload.pageSize ?? 100,
      maxPages: payload.maxPages ?? 5,
      log,
    });

    const dedupedProducts = Array.from(
      new Map(
        fetchedProducts.products.map((product) => [
          product.externalProductId.toLowerCase(),
          product,
        ]),
      ).values(),
    );
    log("Fetched catalog products", { count: dedupedProducts.length, pagesFetched: fetchedProducts.pagesFetched });

    const productRows: ProductRow[] = [];
    if (dedupedProducts.length > 0) {
      for (const productBatch of chunk(dedupedProducts, 250)) {
        const { data, error } = await supabase
          .schema("paid_media")
          .from(PRODUCT_TABLE)
          .upsert(
            productBatch.map((product) => ({
              brand_id: payload.brandId,
              catalog_id: payload.catalogId,
              external_product_id: product.externalProductId,
              title: product.title,
              availability: product.availability,
              image_url: product.imageUrl,
              product_url: product.productUrl,
              currency: product.currency,
            })) as never,
            { onConflict: "brand_id,catalog_id,external_product_id" },
          )
          .select("id, external_product_id");

        if (error) {
          log("Product upsert failed", error);
          return jsonResponse({ error: "Failed to upsert catalog products" }, 500);
        }

        for (const row of (data ?? []) as ProductRow[]) {
          productRows.push(row);
        }
      }
    }

    const catalog = catalogRow as CatalogRow;
    const linkedObjectIds = Array.from(
      new Set(
        (Array.isArray(catalog.linked_ad_object_ids) ? catalog.linked_ad_object_ids : [])
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    );

    const metaObjects = await fetchMetaAdObjectDetails({
      externalObjectIds: linkedObjectIds,
      accessToken,
      log,
    });

    const adObjectRows: AdObjectRow[] = [];
    if (metaObjects.length > 0) {
      for (const adObjectBatch of chunk(metaObjects, 200)) {
        const { data, error } = await supabase
          .schema("paid_media")
          .from(AD_OBJECT_TABLE)
          .upsert(
            adObjectBatch.map((adObject) => ({
              brand_id: payload.brandId,
              platform: "meta",
              object_type: catalog.linked_ad_object_level,
              external_object_id: adObject.externalObjectId,
              name: adObject.name,
              status: adObject.status,
            })) as never,
            { onConflict: "brand_id,platform,object_type,external_object_id" },
          )
          .select("id, external_object_id");

        if (error) {
          log("Ad object upsert failed", error);
          return jsonResponse({ error: "Failed to upsert ad objects" }, 500);
        }

        for (const row of (data ?? []) as AdObjectRow[]) {
          adObjectRows.push(row);
        }
      }
    }

    const productIds = productRows.map((row) => row.id);
    const adObjectIds = adObjectRows.map((row) => row.id);
    const desiredPairs: Array<{ productId: string; adObjectId: string }> = [];
    const maxActivityRows = payload.maxActivityRows ?? 5000;
    for (const productId of productIds) {
      for (const adObjectId of adObjectIds) {
        if (desiredPairs.length >= maxActivityRows) break;
        desiredPairs.push({ productId, adObjectId });
      }
      if (desiredPairs.length >= maxActivityRows) break;
    }

    const nowIso = new Date().toISOString();
    let activityInserted = 0;
    let activityUpdated = 0;

    if (desiredPairs.length > 0) {
      const { data: existingRows, error: existingError } = await supabase
        .schema("paid_media")
        .from(ACTIVITY_TABLE)
        .select("id, product_id, ad_object_id, first_seen_at, active_from")
        .eq("brand_id", payload.brandId)
        .eq("catalog_id", payload.catalogId)
        .in("product_id", productIds)
        .in("ad_object_id", adObjectIds);

      if (existingError) {
        log("Failed to load existing activity rows", existingError);
        return jsonResponse({ error: "Failed to resolve existing activity rows" }, 500);
      }

      const existingByPair = new Map<string, ActivityRow>();
      for (const row of (existingRows ?? []) as ActivityRow[]) {
        existingByPair.set(`${row.product_id}::${row.ad_object_id}`, row);
      }

      const updates: Array<Record<string, unknown>> = [];
      const inserts: Array<Record<string, unknown>> = [];

      for (const pair of desiredPairs) {
        const key = `${pair.productId}::${pair.adObjectId}`;
        const existing = existingByPair.get(key);
        if (existing) {
          updates.push({
            id: existing.id,
            is_active: true,
            last_seen_at: nowIso,
            active_from: existing.active_from ?? existing.first_seen_at ?? nowIso,
            active_to: null,
            source: payload.source ?? "sync",
          });
        } else {
          inserts.push({
            brand_id: payload.brandId,
            catalog_id: payload.catalogId,
            product_id: pair.productId,
            ad_object_id: pair.adObjectId,
            is_active: true,
            first_seen_at: nowIso,
            last_seen_at: nowIso,
            active_from: nowIso,
            active_to: null,
            source: payload.source ?? "sync",
          });
        }
      }

      if (updates.length > 0) {
        for (const updateBatch of chunk(updates, 500)) {
          const { error } = await supabase
            .schema("paid_media")
            .from(ACTIVITY_TABLE)
            .upsert(updateBatch as never, { onConflict: "id" });
          if (error) {
            log("Activity update batch failed", error);
            return jsonResponse({ error: "Failed to update activity rows" }, 500);
          }
          activityUpdated += updateBatch.length;
        }
      }

      if (inserts.length > 0) {
        for (const insertBatch of chunk(inserts, 500)) {
          const { error } = await supabase
            .schema("paid_media")
            .from(ACTIVITY_TABLE)
            .upsert(insertBatch as never, {
              onConflict: "brand_id,catalog_id,product_id,ad_object_id",
            });
          if (error) {
            log("Activity insert batch failed", error);
            return jsonResponse({ error: "Failed to insert activity rows" }, 500);
          }
          activityInserted += insertBatch.length;
        }
      }
    }

    return jsonResponse({
      success: true,
      requestId,
      tokenStrategy: "get_meta_access_token RPC (p_ad_account_id)",
      summary: {
        pagesFetched: fetchedProducts.pagesFetched,
        productsFetched: dedupedProducts.length,
        productsUpserted: productRows.length,
        adObjectsLinked: adObjectRows.length,
        desiredActivityPairs: desiredPairs.length,
        activityInserted,
        activityUpdated,
      },
    });
  } catch (error) {
    console.error("[catalog-sync-meta] unhandled error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal Server Error" }, 500);
  }
});
