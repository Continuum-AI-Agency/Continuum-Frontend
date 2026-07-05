import { createSupabaseServerClient } from "@/lib/supabase/server";
import { brandInviteSchema, brandMemberSchema, type BrandMember, type BrandInvite } from "@/lib/onboarding/state";

export async function fetchBrandMembers(brandId: string): Promise<BrandMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("user_id, role, email, created_at, acknowledged_at")
    .eq("brand_profile_id", brandId) as any;

  if (error) {
    console.error(`[members] Failed to fetch members for brand ${brandId}`, error);
    return [];
  }

  const RECENTLY_ACCEPTED_WINDOW_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const members: BrandMember[] = [];
  for (const row of data ?? []) {
    const createdAt = row.created_at as string | null;
    const acknowledged = row.acknowledged_at as string | null;
    const isRecentlyAccepted =
      acknowledged === null &&
      typeof createdAt === "string" &&
      now - new Date(createdAt).getTime() < RECENTLY_ACCEPTED_WINDOW_MS;

    const parsed = brandMemberSchema.safeParse({
      id: row.user_id,
      email: row.email,
      role: row.role,
      isRecentlyAccepted,
    });

    if (!parsed.success) {
      console.error(`[members] Skipping malformed member row for brand ${brandId}`, parsed.error);
      continue;
    }

    members.push(parsed.data);
  }

  return members;
}

export async function acknowledgeOwnMembership(brandId: string, userId: string): Promise<void> {
  if (!brandId || !userId) return;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .update({ acknowledged_at: new Date().toISOString() } as never)
    .eq("brand_profile_id", brandId)
    .eq("user_id", userId)
    .is("acknowledged_at", null);

  if (error) {
    console.warn("[members] Failed to acknowledge membership", error);
  }
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

  const invites: BrandInvite[] = [];
  for (const row of data ?? []) {
    const parsed = brandInviteSchema.safeParse({
      id: row.id,
      email: row.email,
      role: row.role,
      token: "",
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    });

    if (!parsed.success) {
      console.error(`[members] Skipping malformed invite row for brand ${brandId}`, parsed.error);
      continue;
    }

    invites.push(parsed.data);
  }

  return invites;
}
