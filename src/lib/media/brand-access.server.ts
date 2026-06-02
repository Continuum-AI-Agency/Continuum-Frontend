import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Returns true if the authenticated caller (the user-scoped client's JWT) has
// access to the brand. has_brand_access is SECURITY DEFINER and reads
// auth.uid(), so it MUST be called on the user-scoped client — never the admin
// (service-role) client, which would resolve no auth.uid(). Every media API
// route that subsequently uses the admin client must gate on this first.
export async function callerHasBrandAccess(
  supabase: SupabaseClient,
  brandId: string,
): Promise<boolean> {
  const { data, error } = await (
    supabase as unknown as {
      schema: (s: string) => {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      };
    }
  )
    .schema("brand_profiles")
    .rpc("has_brand_access", { brand_id: brandId });

  return !error && data === true;
}
