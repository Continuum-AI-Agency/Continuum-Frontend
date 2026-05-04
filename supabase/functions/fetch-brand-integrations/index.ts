import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const TYPE_TO_PLATFORM_MAP: Record<string, string> = {
  youtube_channel: "youtube",
  youtube: "youtube",
  google_ad_account: "googleAds",
  google_ads_account: "googleAds",
  googleads_account: "googleAds",
  google_ads_customer: "googleAds",
  dv360_advertiser: "dv360",
  display_video_360_advertiser: "dv360",
  displayvideo360_advertiser: "dv360",
  instagram_business_account: "instagram",
  instagram_account: "instagram",
  meta_instagram_account: "instagram",
  facebook_page: "facebook",
  facebook_account: "facebook",
  meta_ad_account: "facebook",
  meta_page: "facebook",
  threads_profile: "threads",
  threads_account: "threads",
  meta_threads_account: "threads",
  tiktok_user: "tiktok",
  tiktok_account: "tiktok",
};

function mapIntegrationTypeToPlatformKey(type?: string | null): string | null {
  if (!type) return null;
  const normalized = type.trim().toLowerCase();
  return TYPE_TO_PLATFORM_MAP[normalized] ?? null;
}

const PLATFORM_KEYS = [
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "googleAds",
  "amazonAds",
  "dv360",
  "threads",
];

function createEmptySummary(): any {
  const summary: any = {};
  for (const key of PLATFORM_KEYS) {
    summary[key] = { accounts: [] };
  }
  return summary;
}

function resolveAccountName(row: {
  alias: string | null;
  accountName: string | null;
  externalAccountId: string | null;
}): string {
  if (row.alias) return row.alias;
  if (row.accountName) return row.accountName;
  if (row.externalAccountId) return row.externalAccountId;
  return "Account";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let brandId = url.searchParams.get("brandId");

    // Handle POST body if brandId not in URL
    if (!brandId && (req.method === "POST" || req.method === "PUT")) {
      try {
        const body = await req.json();
        brandId = body.brandId || body.brand_id || body.brandProfileId;
      } catch {
        // Body might not be JSON or empty
      }
    }

    if (!brandId) {
      return new Response(JSON.stringify({ error: "brandId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Verify user has access to this brand
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(accessToken);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: permission, error: permError } = await supabase
      .schema("brand_profiles")
      .from("permissions")
      .select("role")
      .eq("brand_profile_id", brandId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (permError || !permission) {
      // Fallback: check if they are the creator in brand_profiles
      const { data: brand, error: brandError } = await supabase
        .schema("brand_profiles")
        .from("brand_profiles")
        .select("created_by")
        .eq("id", brandId)
        .maybeSingle();

      if (brandError || !brand || brand.created_by !== user.id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: No access to this brand" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // 2. Fetch assignments with integration account details
    const { data, error } = await supabase
      .schema("brand_profiles")
      .from("brand_profile_integration_accounts")
      .select(
        `
        id,
        alias,
        created_at,
        settings,
        integration_accounts_assets:integration_account_id (
          id,
          integration_id,
          type,
          name,
          status,
          external_account_id
        )
      `,
      )
      .eq("brand_profile_id", brandId);

    if (error) {
      console.error("[fetch-brand-integrations] query failed", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = createEmptySummary();

    (data || []).forEach((assignment: any) => {
      const account = assignment.integration_accounts_assets;
      if (!account) return;

      const platformKey = mapIntegrationTypeToPlatformKey(account.type);
      if (!platformKey) return;

      const accountName = resolveAccountName({
        alias: assignment.alias ?? null,
        accountName: account.name ?? null,
        externalAccountId: account.external_account_id ?? null,
      });

      summary[platformKey].accounts.push({
        assignmentId: assignment.id,
        integrationAccountId: account.id,
        alias: assignment.alias ?? null,
        name: accountName,
        externalAccountId: account.external_account_id ?? null,
        status: account.status ?? null,
        linkedAt: assignment.created_at ?? null,
        providerIntegrationId: account.integration_id,
        type: account.type ?? null,
        settings: assignment.settings ?? null,
      });
    });

    // Fallback substring check for youtube etc
    (data || []).forEach((assignment: any) => {
      const account = assignment.integration_accounts_assets;
      if (!account) return;

      const alreadyIncluded = summary.youtube.accounts.some(
        (a: any) => a.integrationAccountId === account.id,
      );
      if (alreadyIncluded) return;

      const typeGuess = account.type?.toLowerCase() ?? "";
      if (
        !mapIntegrationTypeToPlatformKey(account.type) &&
        typeGuess.includes("youtube")
      ) {
        summary.youtube.accounts.push({
          assignmentId: assignment.id,
          integrationAccountId: account.id,
          alias: assignment.alias ?? null,
          name: resolveAccountName({
            alias: assignment.alias ?? null,
            accountName: account.name ?? null,
            externalAccountId: account.external_account_id ?? null,
          }),
          externalAccountId: account.external_account_id ?? null,
          status: account.status ?? null,
          linkedAt: assignment.created_at ?? null,
          providerIntegrationId: account.integration_id,
          type: account.type ?? null,
          settings: assignment.settings ?? null,
        });
      }
    });

    // Sort accounts by name
    for (const key of PLATFORM_KEYS) {
      summary[key].accounts.sort((a: any, b: any) =>
        a.name.localeCompare(b.name),
      );
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[fetch-brand-integrations] unhandled error:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
