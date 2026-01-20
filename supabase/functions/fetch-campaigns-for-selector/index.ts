import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const log = (msg: string, extra?: unknown) => 
    console.log(`[fetch-campaigns-for-selector] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const brandId = url.searchParams.get("brandId");
    const metaAccountId = url.searchParams.get("metaAccountId");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");

    if (!brandId || !metaAccountId) {
      return new Response(JSON.stringify({ error: "brandId and metaAccountId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = supabase
      .schema("DCO_Campaigns")
      .from("rule_action_logs")
      .select("meta_campaign_id")
      .eq("brand_id", brandId)
      .eq("meta_account_id", metaAccountId)
      .not("meta_campaign_id", "is", null);

    if (dateFrom) query = query.gte("occurred_at", dateFrom);
    if (dateTo) query = query.lte("occurred_at", dateTo);

    const { data: campaigns, error: queryError } = await query;

    if (queryError) {
      log("query failed", { queryError });
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uniqueIds = new Set<string>();
    const uniqueCampaigns: Array<{ id: string; name: string }> = [];

    for (const row of campaigns ?? []) {
      const id = row.meta_campaign_id;
      if (id && !uniqueIds.has(id)) {
        uniqueIds.add(id);
        uniqueCampaigns.push({ id, name: id });
      }
    }

    uniqueCampaigns.sort((a, b) => a.id.localeCompare(b.id));

    log("success", { count: uniqueCampaigns.length });

    return new Response(JSON.stringify({ campaigns: uniqueCampaigns }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[fetch-campaigns-for-selector] unhandled error:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
