import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACTIVITY_TABLE = "paid_media_product_ad_activity" as never;
const CATALOG_TABLE = "paid_media_product_catalogs" as never;

type ReconcilePayload = {
  brandId: string;
  catalogId?: string;
  staleAfterHours?: number;
  dryRun?: boolean;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parsePayload(req: Request, body: unknown): ReconcilePayload {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const url = new URL(req.url);
  const brandId = String(raw.brandId ?? url.searchParams.get("brandId") ?? "").trim();
  const catalogId = String(raw.catalogId ?? url.searchParams.get("catalogId") ?? "").trim();
  const staleAfterHours = Number(raw.staleAfterHours ?? url.searchParams.get("staleAfterHours") ?? 48);
  const dryRunCandidate = raw.dryRun ?? url.searchParams.get("dryRun");

  if (!brandId) {
    throw new Error("brandId is required.");
  }

  return {
    brandId,
    catalogId: catalogId || undefined,
    staleAfterHours: Number.isFinite(staleAfterHours) ? Math.max(1, Math.min(24 * 90, Math.trunc(staleAfterHours))) : 48,
    dryRun: dryRunCandidate === true || dryRunCandidate === "true",
  };
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (message: string, extra?: unknown) =>
    console.log(`[catalog-reconcile-activity] ${requestId} ${message}`, extra ?? "");

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

    const staleAfterHours = payload.staleAfterHours ?? 48;
    const cutoffDate = new Date(Date.now() - staleAfterHours * 60 * 60 * 1000);
    const cutoffIso = cutoffDate.toISOString();
    const nowIso = new Date().toISOString();

    let baseQuery = supabase
      .schema("paid_media")
      .from(ACTIVITY_TABLE)
      .select("id", { count: "exact" })
      .eq("brand_id", payload.brandId)
      .eq("is_active", true)
      .lt("last_seen_at", cutoffIso);

    if (payload.catalogId) {
      baseQuery = baseQuery.eq("catalog_id", payload.catalogId);
    }

    const { data: staleRows, error: staleError, count } = await baseQuery;
    if (staleError) {
      log("Failed to load stale activity rows", staleError);
      return jsonResponse({ error: "Failed to load stale activity rows" }, 500);
    }

    const staleIds = (staleRows ?? []).map((row) => (row as { id: string }).id);
    if (payload.dryRun) {
      return jsonResponse({
        success: true,
        requestId,
        dryRun: true,
        cutoffIso,
        staleRows: count ?? staleIds.length,
        sampleActivityIds: staleIds.slice(0, 25),
      });
    }

    if (staleIds.length === 0) {
      return jsonResponse({
        success: true,
        requestId,
        dryRun: false,
        cutoffIso,
        reconciled: 0,
      });
    }

    const { data: updatedRows, error: updateError } = await supabase
      .schema("paid_media")
      .from(ACTIVITY_TABLE)
      .update({
        is_active: false,
        active_to: nowIso,
        source: "reconcile",
      } as never)
      .in("id", staleIds)
      .select("id");

    if (updateError) {
      log("Failed to reconcile activity rows", updateError);
      return jsonResponse({ error: "Failed to reconcile stale activity rows" }, 500);
    }

    return jsonResponse({
      success: true,
      requestId,
      dryRun: false,
      cutoffIso,
      staleRows: staleIds.length,
      reconciled: (updatedRows ?? []).length,
    });
  } catch (error) {
    console.error("[catalog-reconcile-activity] unhandled error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Internal Server Error" }, 500);
  }
});
