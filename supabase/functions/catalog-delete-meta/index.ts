import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMetaAccessToken } from "../_shared/meta-access-token.ts";

const META_API_VERSION = "v23.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DeletePayload = {
  brandId: string;
  externalCatalogId: string;
  metaAccountId: string;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parsePayload(body: unknown): DeletePayload {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const brandId = String(data.brandId ?? "").trim();
  const externalCatalogId = String(data.externalCatalogId ?? "").trim();
  const metaAccountId = String(data.metaAccountId ?? "").trim();

  if (!brandId || !externalCatalogId || !metaAccountId) {
    throw new Error("brandId, externalCatalogId, and metaAccountId are required.");
  }

  return { brandId, externalCatalogId, metaAccountId };
}

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (message: string, extra?: unknown) =>
    console.log(`[catalog-delete-meta] ${requestId} ${message}`, extra ?? "");

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

    const deleteParams = new URLSearchParams({ access_token: accessToken });
    const deleteResponse = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(payload.externalCatalogId)}?${deleteParams.toString()}`,
      { method: "DELETE" },
    );

    if (deleteResponse.status === 404) {
      log("Catalog not found in Meta — treating as already deleted", {
        externalCatalogId: payload.externalCatalogId,
      });
      return jsonResponse({ success: true, alreadyDeleted: true });
    }

    const deleteBody = await deleteResponse.json().catch(() => ({}));
    if (!deleteResponse.ok) {
      log("Meta catalog delete failed", { status: deleteResponse.status, deleteBody });
      return jsonResponse({ error: "Failed to delete product catalog in Meta", detail: deleteBody }, 502);
    }

    log("Catalog deleted from Meta", { externalCatalogId: payload.externalCatalogId });
    return jsonResponse({ success: true, alreadyDeleted: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message || "Failed to delete catalog in Meta" }, 500);
  }
});
