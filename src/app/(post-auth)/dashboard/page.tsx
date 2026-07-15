import { redirect } from "next/navigation";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { readLatestDailyDashboardSnapshot } from "@/lib/dashboard/dailySnapshot.server";
import { DailyFocusDashboard } from "@/components/dashboard/DailyFocusDashboard";
import { DailyDashboardWarmOnMount } from "@/components/dashboard/DailyDashboardWarmOnMount";

type DashboardPageProps = {
  searchParams?: Promise<{ view?: string | string[] }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  if (params?.view === "organic") redirect("/organic?tab=metrics");
  if (params?.view === "paid") redirect("/scale");
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const snapshot = await readLatestDailyDashboardSnapshot(activeBrandId);
  const timezone = snapshot?.document.timezone ?? "UTC";
  const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
  const localDate = `${values.year}-${values.month}-${values.day}`;
  const stale = !snapshot || snapshot.localDate !== localDate;

  return (
    <div className="min-h-[var(--workspace-min-height,600px)] w-full min-w-0">
      <DailyDashboardWarmOnMount brandId={activeBrandId} localDate={localDate} shouldWarm={stale} />
      <DailyFocusDashboard document={snapshot?.document ?? null} generatedAt={snapshot?.generatedAt} stale={stale} />
    </div>
  );
}
