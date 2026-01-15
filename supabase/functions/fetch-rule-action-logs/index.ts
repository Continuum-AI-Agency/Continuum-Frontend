import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface ActionLogRow {
  id: string;
  brand_id: string;
  meta_account_id: string;
  action_type: string;
  status: string;
  scope_type: string;
  scope_id: string;
  occurred_at: string;
  action_payload: Record<string, unknown>;
  params_changed: Record<string, unknown>;
  result: Record<string, unknown>;
  decision_note: string | null;
  error: string | null;
}

interface ResponseBody {
  data: ActionLogRow[];
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
    if (campaignId) query = query.eq("meta_campaign_id", campaignId);
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
    const transformedLogs = (logs ?? []).map((log: any) => ({
      id: log.id,
      brandId: log.brand_id,
      metaAccountId: log.meta_account_id,
      actionType: log.action_type,
      status: log.status,
      scopeType: log.scope_type,
      scopeId: log.scope_id,
      occurredAt: log.occurred_at,
      actionPayload: log.action_payload,
      paramsChanged: log.params_changed,
      result: log.result,
      decisionNote: log.decision_note,
      error: log.error,
    }));

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
