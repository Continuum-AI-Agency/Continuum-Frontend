import { generateBrandInsights } from '@/lib/api/brandInsights.client';
import { runStrategicAnalysis } from '@/lib/api/strategicAnalyses.client';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { getOnboardingAgentBaseUrl } from '@/lib/onboarding/agentClient';
import type { ScrapeResult } from '@/lib/onboarding/scrape';
import { timing, trackOnboardingEvent } from '@/lib/onboarding/telemetry';

export async function runScrape(
  brandId: string,
  url: string,
  signal: AbortSignal,
): Promise<ScrapeResult> {
  const t = timing();
  trackOnboardingEvent('onboarding_scrape_started', { url });
  try {
    const base = getOnboardingAgentBaseUrl();
    const token = await getBrowserAccessToken();
    const response = await fetch(`${base}/onboarding/brand-profiles/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ brand_id: brandId, url }),
      signal,
    });
    if (!response.ok) {
      const detail = await safeJson(response);
      const message = detail?.error ?? `Scrape failed (${response.status})`;
      trackOnboardingEvent('onboarding_scrape_failed', {
        url,
        duration_ms: t.sinceStart(),
        status: response.status,
        message,
      });
      throw new Error(message);
    }
    const body = (await response.json()) as { scrape: ScrapeResult };
    const result = body.scrape;
    trackOnboardingEvent('onboarding_scrape_completed', {
      url,
      duration_ms: t.sinceStart(),
      colors: result.colors?.length ?? 0,
      has_logo: Boolean(result.logoUrl),
    });
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (!(error instanceof Error) || !error.message.startsWith('Scrape failed')) {
      trackOnboardingEvent('onboarding_scrape_failed', {
        url,
        duration_ms: t.sinceStart(),
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    throw error;
  }
}

export async function runTrendsPrewarm(brandId: string): Promise<{ generationId: string | null }> {
  const result = await generateBrandInsights({ brandId });
  return { generationId: result.generationId ?? null };
}

// Kicks the competitor strategic analysis the moment the brand profile is
// finished — in parallel with the trends prewarm — instead of waiting for the
// user to approve at the end of Brand DNA. The backend dedupes concurrent runs
// per brand, so the later approve-time kickoff is a harmless no-op.
export async function runStrategicPrewarm(brandId: string): Promise<{ runId: string | null }> {
  const result = await runStrategicAnalysis(brandId);
  return { runId: result.runId ?? null };
}

async function safeJson(response: Response): Promise<{ error?: string } | null> {
  try {
    return (await response.json()) as { error?: string };
  } catch {
    return null;
  }
}
