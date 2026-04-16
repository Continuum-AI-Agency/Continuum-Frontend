// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

type IntegrationAccount = {
  id: string;
  integration_id: string;
  external_account_id: string;
  type: string;
  name: string | null;
  raw_payload: Record<string, unknown> | null;
};

export async function lookupIntegrationAccount(
  supabase: SupabaseClient,
  integrationAccountId: string
): Promise<IntegrationAccount | null> {
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("integration_accounts_assets")
    .select(
      "id,integration_id,external_account_id,type,name,raw_payload"
    )
    .eq("id", integrationAccountId)
    .maybeSingle();

  if (error) {
    console.error("[fetch-tiktok-data] account lookup error", error.message);
    return null;
  }
  return data as IntegrationAccount | null;
}

export async function resolveTikTokAccessToken(
  supabase: SupabaseClient,
  integrationId: string
): Promise<string> {
  const { data: integrationRow, error: fetchError } = await supabase
    .schema("brand_profiles")
    .from("user_integrations")
    .select("access_token_encrypted")
    .eq("id", integrationId)
    .maybeSingle();

  if (fetchError || !integrationRow?.access_token_encrypted) {
    throw new Error(
      "TikTok integration token not found. The user may need to reconnect."
    );
  }

  const { data: decryptedToken, error: decryptError } = await supabase
    .schema("brand_profiles")
    .rpc("decrypt_token", { ct: integrationRow.access_token_encrypted });

  if (decryptError || !decryptedToken || typeof decryptedToken !== "string") {
    throw new Error("Unable to decrypt TikTok integration token");
  }

  return decryptedToken;
}
