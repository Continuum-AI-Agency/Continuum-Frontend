import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface ActionLogResponseRow {
  id: string;
  brandId: string;
  metaAccountId: string;
  metaCampaignId: string | null;
  metaAdsetId: string | null;
  metaAdId: string | null;
  actionType: string;
  status: string;
  scopeType: string;
  scopeId: string | null;
  occurredAt: string;
  actionPayload: Record<string, unknown>;
  paramsChanged: Record<string, unknown>;
  result: Record<string, unknown>;
  decisionNote: string | null;
  error: string | null;
}

interface ResponseBody {
  data: ActionLogResponseRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseIntParam(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function readEntityIdFromPayload(payloads: unknown[], keys: string[]): string | null {
  for (const payload of payloads) {
    if (!payload || typeof payload !== "object") continue;
    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

function resolveCampaignId(row: Record<string, unknown>): string | null {
  const scopeType = readString(row.scope_type);
  const scopeId = readString(row.scope_id);
  const payloads = [row.action_payload, row.params_changed, row.result];

  return (
    readString(row.meta_campaign_id) ??
    (scopeType === "CAMPAIGN" ? scopeId : null) ??
    readEntityIdFromPayload(payloads, ["meta_campaign_id", "metaCampaignId", "campaign_id", "campaignId"])
  );
}

function resolveAdsetId(row: Record<string, unknown>): string | null {
  const scopeType = readString(row.scope_type);
  const scopeId = readString(row.scope_id);
  const payloads = [row.action_payload, row.params_changed, row.result];

  return (
    readString(row.meta_adset_id) ??
    (scopeType === "ADSET" ? scopeId : null) ??
    readEntityIdFromPayload(payloads, ["meta_adset_id", "metaAdsetId", "adset_id", "adSetId"])
  );
}

function resolveAdId(row: Record<string, unknown>): string | null {
  const scopeType = readString(row.scope_type);
  const scopeId = readString(row.scope_id);
  const payloads = [row.action_payload, row.params_changed, row.result];

  return (
    readString(row.meta_ad_id) ??
    (scopeType === "AD" ? scopeId : null) ??
    readEntityIdFromPayload(payloads, ["meta_ad_id", "metaAdId", "ad_id", "adId"])
  );
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) => 
    console.log(`[fetch-rule-action-logs] ${requestId} ${msg}`, extra ?? "");

  try {
    // 1. Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (req.method !== "GET" && req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // 2. Validate Authorization
    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    
    if (!accessToken) {
      log("no bearer token");
      return jsonResponse({ error: "Missing bearer token" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 3. Validate user has access to brand
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      log("auth failed", { authError });
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    // 4. Parse query/body parameters
    const url = new URL(req.url);
    let bodyParams: Record<string, unknown> = {};
    
    if (req.method === "POST") {
      try {
        bodyParams = await req.json();
      } catch {
        bodyParams = {};
      }
    }

    // Pagination
    const page = parseIntParam(bodyParams.page ?? url.searchParams.get("page"), 1, 1, 1000);
    const pageSize = parseIntParam(bodyParams.pageSize ?? url.searchParams.get("pageSize"), 20, 1, 100);
    
    // Filters
    const brandId = bodyParams.brandId as string ?? url.searchParams.get("brandId");
    const metaAccountId = bodyParams.metaAccountId as string ?? url.searchParams.get("metaAccountId");
    const campaignId = bodyParams.campaignId as string ?? url.searchParams.get("campaignId");
    const actionType = bodyParams.actionType as string ?? url.searchParams.get("actionType");
    const status = bodyParams.status as string ?? url.searchParams.get("status");
    const scopeType = bodyParams.scopeType as string ?? url.searchParams.get("scopeType");
    const dateFrom = bodyParams.dateFrom as string ?? url.searchParams.get("dateFrom");
    const dateTo = bodyParams.dateTo as string ?? url.searchParams.get("dateTo");
    
    // Sorting (default: occurred_at DESC)
    const sortBy = (bodyParams.sortBy as string ?? url.searchParams.get("sortBy")) || "occurred_at";
    const sortOrder = (bodyParams.sortOrder as string ?? url.searchParams.get("sortOrder")) === "asc" ? "asc" : "desc";

    if (!brandId) {
      return jsonResponse({ error: "brandId is required" }, 400);
    }

    // 5. Build dynamic query
    let query = supabase
      .schema("DCO_Campaigns")
      .from("rule_action_logs")
      .select("*", { count: "exact" })
      .eq("brand_id", brandId);

    // Apply optional filters
    if (metaAccountId) query = query.eq("meta_account_id", metaAccountId);
    if (campaignId) {
      query = query.or(`meta_campaign_id.eq.${campaignId},and(scope_type.eq.CAMPAIGN,scope_id.eq.${campaignId})`);
    }
    if (actionType) query = query.eq("action_type", actionType);
    if (status) query = query.eq("status", status);
    if (scopeType) query = query.eq("scope_type", scopeType);
    if (dateFrom) query = query.gte("occurred_at", dateFrom);
    if (dateTo) query = query.lte("occurred_at", dateTo);

    // Apply sorting and pagination
    // Map frontend sort keys to DB columns if needed
    const dbSortKey = sortBy === "campaign_id" ? "meta_campaign_id" : "occurred_at";

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.order(dbSortKey, { ascending: sortOrder === "asc" })
                 .range(from, to);

    const { data: logs, error: queryError, count } = await query;

    if (queryError) {
      log("query failed", { queryError });
      return jsonResponse({ error: queryError.message }, 500);
    }

    // 6. Calculate pagination metadata
    const totalCount = count ?? 0;
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;

    // Map snake_case DB fields to camelCase response if needed, 
    // but typically we keep DB shape or transform. 
    // The frontend hook currently expects camelCase. Let's transform.
    const transformedLogs = (logs ?? []).map((log) => {
      const row = log as Record<string, unknown>;
      const metaCampaignId = resolveCampaignId(row);
      const metaAdsetId = resolveAdsetId(row);
      const metaAdId = resolveAdId(row);

      return {
        id: row.id,
        brandId: row.brand_id,
        metaAccountId: row.meta_account_id,
        metaCampaignId,
        metaAdsetId,
        metaAdId,
        actionType: row.action_type,
        status: row.status,
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        occurredAt: row.occurred_at,
        actionPayload: row.action_payload,
        paramsChanged: row.params_changed,
        result: row.result,
        decisionNote: row.decision_note,
        error: row.error,
      };
    });

    const responseBody: ResponseBody = {
      data: transformedLogs,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };

    log("success", { 
      count: logs?.length ?? 0, 
      totalCount, 
      page, 
      pageSize,
      filters: { brandId, metaAccountId, campaignId, actionType, status }
    });

    return jsonResponse(responseBody);
  } catch (error) {
    console.error(`[fetch-rule-action-logs] unhandled error:`, error);
    return jsonResponse({ error: (error as Error)?.message ?? "Unknown error" }, 500);
  }
});
