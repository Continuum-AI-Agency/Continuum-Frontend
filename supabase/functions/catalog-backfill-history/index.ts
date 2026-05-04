import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIVITY_TABLE = "paid_media_product_ad_activity" as never;
const CATALOG_TABLE = "paid_media_product_catalogs" as never;

type BackfillPayload = {
  brandId: string;
  catalogId?: string;
  since?: string;
  until?: string;
  dryRun?: boolean;
  limitRows?: number;
};

type ActivityRow = {
  id: string;
  is_active: boolean;
  first_seen_at: string;
  last_seen_at: string;
  active_from: string | null;
  active_to: string | null;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toIsoDateTime(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function parsePayload(req: Request, body: unknown): BackfillPayload {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const url = new URL(req.url);

  const brandId = String(raw.brandId ?? url.searchParams.get("brandId") ?? "").trim();
  const catalogId = String(raw.catalogId ?? url.searchParams.get("catalogId") ?? "").trim();
  const since = toIsoDateTime(raw.since ?? url.searchParams.get("since"));
  const until = toIsoDateTime(raw.until ?? url.searchParams.get("until"));
  const dryRunCandidate = raw.dryRun ?? url.searchParams.get("dryRun");
  const limitRows = Number(raw.limitRows ?? url.searchParams.get("limitRows") ?? 2000);

  if (!brandId) {
    throw new Error("brandId is required.");
  }
  if (since && until && since > until) {
    throw new Error("since must be less than or equal to until.");
  }

  return {
    brandId,
    catalogId: catalogId || undefined,
    since,
    until,
    dryRun: dryRunCandidate === true || dryRunCandidate === "true",
    limitRows: Number.isFinite(limitRows) ? Math.max(1, Math.min(10000, Math.trunc(limitRows))) : 2000,
  };
}

function normalizeDates(row: ActivityRow) {
  const firstSeen = new Date(row.first_seen_at).toISOString();
  const lastSeen = new Date(row.last_seen_at).toISOString();

  const baselineFirst = firstSeen <= lastSeen ? firstSeen : lastSeen;
  const baselineLast = lastSeen >= firstSeen ? lastSeen : firstSeen;

  const activeFrom = row.active_from ? new Date(row.active_from).toISOString() : baselineFirst;
  const nextActiveFrom = activeFrom > baselineLast ? baselineFirst : activeFrom;

  let nextActiveTo: string | null = null;
  if (!row.is_active) {
    const current = row.active_to ? new Date(row.active_to).toISOString() : baselineLast;
    nextActiveTo = current < nextActiveFrom ? baselineLast : current;
  }

  return {
    first_seen_at: baselineFirst,
    last_seen_at: baselineLast,
    active_from: nextActiveFrom,
    active_to: nextActiveTo,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (message: string, extra?: unknown) =>
    console.log(`[catalog-backfill-history] ${requestId} ${message}`, extra ?? "");

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

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: claimsData, error: authError } = await supabase.auth.getClaims(supabaseToken);
    if (authError || !claimsData?.claims?.sub) {
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

    if (payload.catalogId) {
      const { data: catalogRow, error: catalogError } = await supabase
        .schema("paid_media")
        .from(CATALOG_TABLE)
        .select("id")
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
    }

    let query = supabase
      .schema("paid_media")
      .from(ACTIVITY_TABLE)
      .select("id, is_active, first_seen_at, last_seen_at, active_from, active_to")
      .eq("brand_id", payload.brandId)
      .order("last_seen_at", { ascending: false })
      .limit(payload.limitRows ?? 2000);

    if (payload.catalogId) {
      query = query.eq("catalog_id", payload.catalogId);
    }
    if (payload.since) {
      query = query.gte("last_seen_at", payload.since);
    }
    if (payload.until) {
      query = query.lte("last_seen_at", payload.until);
    }

    const { data: rows, error: rowsError } = await query;
    if (rowsError) {
      log("Failed to load activity rows for backfill", rowsError);
      return jsonResponse({ error: "Failed to load activity rows" }, 500);
    }

    const updates = ((rows ?? []) as ActivityRow[])
      .map((row) => {
        const normalized = normalizeDates(row);
        const changed =
          normalized.first_seen_at !== row.first_seen_at ||
          normalized.last_seen_at !== row.last_seen_at ||
          normalized.active_from !== row.active_from ||
          normalized.active_to !== row.active_to;
        if (!changed) return null;
        return { id: row.id, ...normalized, source: "backfill" };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    if (payload.dryRun) {
      return jsonResponse({
        success: true,
        requestId,
        dryRun: true,
        scanned: (rows ?? []).length,
        rowsNeedingRepair: updates.length,
        sampleActivityIds: updates.slice(0, 25).map((row) => row.id),
      });
    }

    if (updates.length === 0) {
      return jsonResponse({
        success: true,
        requestId,
        dryRun: false,
        scanned: (rows ?? []).length,
        repaired: 0,
      });
    }

    let repaired = 0;
    for (const updateBatch of chunk(updates, 500)) {
      const { error } = await supabase
        .schema("paid_media")
        .from(ACTIVITY_TABLE)
        .upsert(updateBatch as never, { onConflict: "id" });
      if (error) {
        log("Backfill update batch failed", error);
        return jsonResponse({ error: "Failed to write backfill updates" }, 500);
      }
      repaired += updateBatch.length;
    }

    return jsonResponse({
      success: true,
      requestId,
      dryRun: false,
      scanned: (rows ?? []).length,
      repaired,
    });
  } catch (error) {
    console.error("[catalog-backfill-history] unhandled error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal Server Error" }, 500);
  }
});
