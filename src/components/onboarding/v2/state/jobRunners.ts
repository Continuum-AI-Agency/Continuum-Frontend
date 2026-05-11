import type { ScrapeResult } from "@/lib/onboarding/scrape";
import { generateBrandInsights } from "@/lib/api/brandInsights.client";
import { timing, trackOnboardingEvent } from "@/lib/onboarding/telemetry";

export async function runScrape(url: string, signal: AbortSignal): Promise<ScrapeResult> {
  const t = timing();
  trackOnboardingEvent("onboarding_scrape_started", { url });
  try {
    const response = await fetch("/api/onboarding/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
    if (!response.ok) {
      const detail = await safeJson(response);
      const message = detail?.error ?? `Scrape failed (${response.status})`;
      trackOnboardingEvent("onboarding_scrape_failed", {
        url,
        duration_ms: t.sinceStart(),
        status: response.status,
        message,
      });
      throw new Error(message);
    }
    const result = (await response.json()) as ScrapeResult;
    trackOnboardingEvent("onboarding_scrape_completed", {
      url,
      duration_ms: t.sinceStart(),
      colors: result.colors?.length ?? 0,
      has_logo: Boolean(result.logoUrl),
    });
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (!(error instanceof Error) || !error.message.startsWith("Scrape failed")) {
      trackOnboardingEvent("onboarding_scrape_failed", {
        url,
        duration_ms: t.sinceStart(),
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
    throw error;
  }
}

export async function runTrendsPrewarm(brandId: string): Promise<{ generationId: string | null }> {
  const result = await generateBrandInsights({ brandId });
  return { generationId: result.generationId ?? null };
}

async function safeJson(response: Response): Promise<{ error?: string } | null> {
  try {
    return (await response.json()) as { error?: string };
  } catch {
    return null;
  }
}
