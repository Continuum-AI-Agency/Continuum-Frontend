import {
  hasInstagramBrandContext,
  type OnboardingSourceResponse,
  onboardingSourceResponseSchema,
} from '@continuum/contracts';
import { generateBrandInsights } from '@/lib/api/brandInsights.client';
import { runStrategicAnalysis } from '@/lib/api/strategicAnalyses.client';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { getOnboardingAgentBaseUrl } from '@/lib/onboarding/agentClient';
import type { ScrapeResult } from '@/lib/onboarding/scrape';
import { timing, trackOnboardingEvent } from '@/lib/onboarding/telemetry';

export async function readOnboardingSource(
  brandId: string,
  url: string,
  signal: AbortSignal,
): Promise<OnboardingSourceResponse> {
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
      const reason = detail?.error ?? `Scrape failed (${response.status})`;
      const message = reason.startsWith('instagram_')
        ? 'We couldn’t read that Instagram profile. Add a business description or brand documents to continue.'
        : reason;
      trackOnboardingEvent('onboarding_scrape_failed', {
        url,
        duration_ms: t.sinceStart(),
        status: response.status,
        message,
      });
      throw new Error(message);
    }
    const result = onboardingSourceResponseSchema.parse(await response.json());
    if (result.kind === 'instagram' && !hasInstagramBrandContext(result.instagram_profile))
      throw new Error(
        'That Instagram profile has no readable brand information. Add a business description or brand documents to continue.',
      );
    trackOnboardingEvent('onboarding_scrape_completed', {
      url,
      duration_ms: t.sinceStart(),
      source_kind: result.kind,
      colors: result.kind === 'web' ? result.scrape.colors.length : 0,
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

export async function runScrape(
  brandId: string,
  url: string,
  signal: AbortSignal,
): Promise<ScrapeResult> {
  const source = await readOnboardingSource(brandId, url, signal);
  if (source.kind !== 'web') throw new Error('Use social profile intake for that link.');
  return source.scrape;
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
    const body: unknown = await response.json();
    return body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? { error: body.error }
      : null;
  } catch {
    return null;
  }
}
