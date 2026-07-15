import "server-only";

import { dailyDashboardDocumentSchema, type DailyDashboardDocument } from "@continuum/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DailyDashboardSnapshot = {
  document: DailyDashboardDocument;
  generatedAt: string;
  localDate: string;
  status: "ready" | "partial";
};

export async function readLatestDailyDashboardSnapshot(brandId: string): Promise<DailyDashboardSnapshot | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("dashboard_daily_snapshots")
    .select("document,generated_at,local_date,status")
    .eq("brand_id", brandId)
    .order("local_date", { ascending: false })
    .order("generated_at", { ascending: false })
    .limit(1);
  if (error || !data?.[0]) return null;
  const parsed = dailyDashboardDocumentSchema.safeParse(data[0].document);
  if (!parsed.success) return null;
  return { document: parsed.data, generatedAt: data[0].generated_at, localDate: data[0].local_date, status: data[0].status };
}
