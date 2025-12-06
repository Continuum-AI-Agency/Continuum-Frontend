import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AIStudioClient from "./AIStudioClient";
import { listAiStudioJobs, listAiStudioTemplates } from "@/lib/api/aiStudio";
import { fetchOnboardingMetadata } from "@/lib/onboarding/storage";
import type { AiStudioJob, AiStudioTemplate } from "@/lib/schemas/aiStudio";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoadErrors = {
  templates?: string;
  jobs?: string;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AIStudioPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect("/login");
  }

  const metadata = await fetchOnboardingMetadata();
  const activeBrandId = metadata.activeBrandId;

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  // Permission gate: allow only tiers 1,2,3; tier 0 (or missing) is blocked.
  const { data: permRow, error: permError } = await supabase
    .schema("brand_profiles")
    .from("permissions")
    .select("tier")
    .eq("brand_profile_id", activeBrandId)
    .eq("user_id", user.id)
    .maybeSingle();

  const tier = permRow?.tier ?? 0;
  if (permError || tier === 0) {
    // Redirect back to dashboard with a clear message.
    const msg = encodeURIComponent("This is a paid feature only. Please contact an Administrator.");
    redirect(`/?error=${msg}`);
  }

  const activeBrandState = metadata.brands[activeBrandId];
  const brandName =
    activeBrandState?.brand?.name && activeBrandState.brand.name.trim().length > 0
      ? activeBrandState.brand.name
      : "Untitled brand";

  const cookieStore = await cookies();
  const serializedCookies = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const requestInit = serializedCookies.length > 0 ? { headers: { cookie: serializedCookies } } : undefined;

  const loadErrors: LoadErrors = {};
  let templates: AiStudioTemplate[] = [];
  let jobs: AiStudioJob[] = [];

  const [templatesResult, jobsResult] = await Promise.allSettled([
    listAiStudioTemplates({ brandProfileId: activeBrandId }, requestInit),
    listAiStudioJobs({ brandProfileId: activeBrandId, limit: 25 }, requestInit),
  ]);

  if (templatesResult.status === "fulfilled") {
    templates = templatesResult.value;
  } else {
    console.error("Failed to fetch AI Studio templates", templatesResult.reason);
    loadErrors.templates = getErrorMessage(templatesResult.reason, "Templates service unavailable.");
  }

  if (jobsResult.status === "fulfilled") {
    jobs = jobsResult.value;
  } else {
    console.error("Failed to fetch AI Studio jobs", jobsResult.reason);
    loadErrors.jobs = getErrorMessage(jobsResult.reason, "Jobs service unavailable.");
  }

  const loadErrorsProp = Object.keys(loadErrors).length > 0 ? loadErrors : undefined;

  return (
    <AIStudioClient
      brandProfileId={activeBrandId}
      brandName={brandName}
      initialTemplates={templates}
      initialJobs={jobs}
      loadErrors={loadErrorsProp}
    />
  );
}
