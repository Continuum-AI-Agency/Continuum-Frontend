import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// When onboarding metadata is empty, reuse an existing brand the user already
// owns instead of minting a fresh brand id. The empty-metadata path previously
// always created a new brand, so a metadata desync produced duplicate empty
// "<name>'s Brand" rows. Conservative + fail-safe: only owner-role, active
// brands count, and any error returns null so the caller falls back to creating
// a new brand (the prior behavior).

type Client = SupabaseClient<Database>;

export async function findReusableBrandId(
  supabase: Client,
  userId: string
): Promise<string | null> {
  try {
    const { data: perms, error: permErr } = await supabase
      .schema("brand_profiles")
      .from("permissions")
      .select("brand_profile_id")
      .eq("user_id", userId)
      .eq("role", "owner");
    if (permErr) return null;

    const ids = ((perms ?? []) as Array<{ brand_profile_id: string }>).map(
      (p) => p.brand_profile_id
    );
    if (ids.length === 0) return null;

    const { data: brands, error: brandErr } = await supabase
      .schema("brand_profiles")
      .from("brand_profiles")
      .select("id, created_at")
      .in("id", ids)
      .eq("active", true)
      .order("created_at", { ascending: true });
    if (brandErr) return null;

    const first = ((brands ?? []) as Array<{ id: string }>)[0];
    return first?.id ?? null;
  } catch {
    return null;
  }
}
