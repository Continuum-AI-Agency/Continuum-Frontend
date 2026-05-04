import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Logger = (msg: string, extra?: unknown) => void;

type ResolveMetaTokenArgs = {
  brandId: string | null;
  adAccountId: string;
  userToken: string;
  actorKind?: "user" | "service_role";
  log?: Logger;
};

export async function resolveMetaAccessToken(
  args: ResolveMetaTokenArgs,
): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const log: Logger = args.log ?? (() => {});

  if (!supabaseUrl || !serviceRoleKey) {
    log("[resolveMetaAccessToken] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }

  if (
    args.brandId &&
    args.userToken &&
    args.actorKind !== "service_role" &&
    anonKey
  ) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${args.userToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await userClient
      .schema("brand_profiles")
      .rpc("get_brand_integration_token", {
        p_brand_profile_id: args.brandId,
        p_provider: "meta",
      });
    if (error) {
      log("[resolveMetaAccessToken] brand-gated RPC failed", error);
    }
    if (typeof data === "string" && data.length > 0) {
      return data;
    }
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await serviceClient.rpc("get_meta_access_token", {
    p_ad_account_id: args.adAccountId,
  });
  if (error) {
    log("[resolveMetaAccessToken] legacy RPC failed", error);
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}
