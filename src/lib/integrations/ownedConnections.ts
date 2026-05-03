import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OwnedConnection = {
  id: string;
  provider: string;
  status: string | null;
  createdAt: string | null;
};

export async function fetchOwnedConnections(userId: string): Promise<OwnedConnection[]> {
  if (!userId) return [];
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("user_integrations")
    .select("id, provider, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchOwnedConnections] query failed", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    status: row.status ?? null,
    createdAt: row.created_at ?? null,
  }));
}
