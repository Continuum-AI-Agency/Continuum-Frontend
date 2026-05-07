import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMetaAccessToken } from "../_shared/meta-access-token.ts";

const META_API_VERSION = "v23.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CreatePayload = {
  brandId: string;
  businessId: string;
  metaAccountId: string;
  name: string;
  catalogStoreId: string;
  vertical?: string;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parsePayload(body: unknown): CreatePayload {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const brandId = String(data.brandId ?? "").trim();
  const businessId = String(data.businessId ?? "").trim();
  const metaAccountId = String(data.metaAccountId ?? "").trim();
  const name = String(data.name ?? "").trim();
  const catalogStoreId = String(data.catalogStoreId ?? "").trim();
  const vertical = String(data.vertical ?? "commerce").trim() || "commerce";

  if (!brandId || !businessId || !metaAccountId || !name || !catalogStoreId) {
    throw new Error("brandId, businessId, metaAccountId, name, and catalogStoreId are required.");
  }

  return { brandId, businessId, metaAccountId, name, catalogStoreId, vertical };
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (message: string, extra?: unknown) =>
    console.log(`[catalog-create-meta] ${requestId} ${message}`, extra ?? "");

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

    const payload = parsePayload(body);
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: claimsData, error: authError } = await supabase.auth.getClaims(supabaseToken);

    if (authError || !claimsData?.claims?.sub) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userId = claimsData.claims.sub;

    const { data: permissionRow, error: permissionError } = await supabase
      .schema("brand_profiles")
      .from("permissions")
      .select("user_id")
      .eq("user_id", userId)
      .eq("brand_profile_id", payload.brandId)
      .maybeSingle();

    if (permissionError) {
      log("Brand permission lookup failed", permissionError);
      return jsonResponse({ error: "Failed to validate brand access" }, 500);
    }

    if (!permissionRow) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const accessToken = await resolveMetaAccessToken({
      brandId: payload.brandId,
      adAccountId: payload.metaAccountId,
      userToken: supabaseToken,
      actorKind: "user",
      log,
    });

    if (!accessToken) {
      return jsonResponse({ error: "Meta account not configured or access token missing" }, 404);
    }

    const createParams = new URLSearchParams();
    createParams.set("name", payload.name);
    createParams.set("access_token", accessToken);
    createParams.set("vertical", payload.vertical ?? "commerce");

    const createResponse = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(payload.businessId)}/product_catalogs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: createParams.toString(),
      },
    );

    const createBody = await createResponse.json().catch(() => ({}));
    if (!createResponse.ok) {
      log("Meta catalog create failed", { status: createResponse.status, createBody });
      return jsonResponse({ error: "Failed to create product catalog in Meta" }, 502);
    }

    const catalogId =
      createBody && typeof createBody === "object" && "id" in createBody && typeof createBody.id === "string"
        ? createBody.id.trim()
        : "";

    if (!catalogId) {
      log("Meta create response missing catalog id", createBody);
      return jsonResponse({ error: "Meta create response did not include catalog id" }, 502);
    }

    return jsonResponse({
      catalogId,
      vertical: payload.vertical ?? "commerce",
      productCount: 0,
      feedCount: 0,
      productSetCount: 0,
      catalogStoreId: payload.catalogStoreId,
    });
  } catch (error) {
    log("Unhandled error", error instanceof Error ? error.message : String(error));
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to create catalog in Meta" },
      500,
    );
  }
});
