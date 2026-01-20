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
    console.log(`[fetch-ad-accounts-for-selector] ${requestId} ${msg}`, extra ?? "");

  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const brandId = url.searchParams.get("brandId");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");

    if (!brandId) {
      return new Response(JSON.stringify({ error: "brandId required" }), {
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
      .select("meta_account_id")
      .eq("brand_id", brandId)
      .not("meta_account_id", "is", null);

    if (dateFrom) query = query.gte("occurred_at", dateFrom);
    if (dateTo) query = query.lte("occurred_at", dateTo);

    const { data: logs, error: queryError } = await query;

    if (queryError) {
      log("query logs failed", { queryError });
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountIds = Array.from(new Set((logs ?? []).map(l => l.meta_account_id).filter(Boolean)));

    if (accountIds.length === 0) {
      return new Response(JSON.stringify({ accounts: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: accountsData, error: accountsError } = await supabase
      .schema("integrations")
      .from("meta_ad_accounts")
      .select("ad_account_id_prefixed, name")
      .in("ad_account_id_prefixed", accountIds);

    if (accountsError) {
      log("query accounts failed", { accountsError });
      // Fallback to just IDs if name lookup fails
      const accounts = accountIds.map(id => ({ id, name: id }));
      return new Response(JSON.stringify({ accounts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nameMap = new Map(
      (accountsData ?? []).map(a => [a.ad_account_id_prefixed, a.name])
    );

    const accounts = accountIds.map(id => ({
      id,
      name: nameMap.get(id) || id // Fallback to ID if name not found
    })).sort((a, b) => a.name.localeCompare(b.name));

    log("success", { count: accounts.length });

    return new Response(JSON.stringify({ accounts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[fetch-ad-accounts-for-selector] unhandled error:", error);
    return new Response(JSON.stringify({ error: (error as Error)?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
