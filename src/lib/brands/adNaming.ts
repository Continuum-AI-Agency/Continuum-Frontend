import { adNamingSchemaConfigSchema, type AdNamingSchemaConfig } from "@continuum/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The brand_profiles.ad_naming_schemas table ships with bug #163 and postdates
// the last Supabase type generation, so it is not yet in the generated Database
// types. We reference it through a loose table handle (mirroring
// paid-media-data.server.ts) and validate every row against the contract Zod
// schema — the parse is the real boundary, not the generated DB types.
export const AD_NAMING_SCHEMAS_TABLE = "ad_naming_schemas" as never;

export type AdNamingPlatform = "meta" | "google" | "all";

// Server-side read of a brand's active ad-naming taxonomy for a platform. Never
// throws: a miss, an RLS denial, or a malformed row all resolve to null so the
// settings form simply renders its empty state.
export async function fetchBrandAdNamingSchema(
  brandId: string,
  platform: AdNamingPlatform = "meta",
): Promise<AdNamingSchemaConfig | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from(AD_NAMING_SCHEMAS_TABLE)
    .select("id, brand_id, platform, delimiter, fields, version")
    .eq("brand_id", brandId)
    .eq("platform", platform)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const parsed = adNamingSchemaConfigSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
