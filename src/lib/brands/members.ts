import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BrandMember, BrandInvite, BrandRole } from "@/lib/onboarding/state";

export async function fetchBrandMembers(brandId: string): Promise<BrandMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("user_id, role, email")
    .eq("brand_profile_id", brandId) as any;

  if (error) {
    console.error(`[members] Failed to fetch members for brand ${brandId}`, error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.user_id,
    email: row.email ?? "",
    role: row.role as BrandRole,
  }));
}

export async function fetchBrandInvites(brandId: string): Promise<BrandInvite[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("invites")
    .select("id, email, role, created_at, expires_at")
    .eq("brand_profile_id", brandId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString()) as any;

  if (error) {
    console.error(`[members] Failed to fetch invites for brand ${brandId}`, error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    email: row.email,
    role: row.role as BrandRole,
    token: "", 
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}
