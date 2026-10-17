'use client';

import { onboardingSourceResponseSchema } from '@continuum/contracts';
import { useEffect, useReducer, useRef } from 'react';
import { useOnboarding } from '@/components/onboarding/providers/OnboardingContext';
import { resolveSafeBrandName } from '@/lib/onboarding/brandName';
import { internalizeLogo } from '@/lib/onboarding/internalizeLogo';
import { type ScrapeResult, scrapeSchema } from '@/lib/onboarding/scrape';
import type { OnboardingPatch } from '@/lib/onboarding/state';
import type { AgentPreviewBuckets } from './agentPreview';
import { type JobKey, useBackgroundJobs } from './BackgroundJobsProvider';

function parseScrape(data: unknown): ScrapeResult | null {
  if (data == null) return null;
  const source = onboardingSourceResponseSchema.safeParse(data);
  if (source.success) return source.data.kind === 'web' ? source.data.scrape : null;
  const parsed = scrapeSchema.safeParse(data);
  return parsed.success ? (parsed.data as ScrapeResult) : null;
}

export function JobPersistor() {
  const { jobs } = useBackgroundJobs();
  const { brandId, state, updateState } = useOnboarding();
  const currentBrandName = state.brand.name;
  const persisted = useRef<Map<JobKey, unknown>>(new Map());
  const persisting = useRef<Set<JobKey>>(new Set());
  const logoInternalized = useRef<Set<string>>(new Set());
  const logoInternalizing = useRef<Set<string>>(new Set());
  const currentScrape = useRef(jobs.scrape);
  currentScrape.current = jobs.scrape;
  const [retryVersion, scheduleRetry] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    (Object.keys(jobs) as JobKey[]).forEach((key) => {
      if (
        jobs[key].status !== 'done' ||
        persisted.current.get(key) === jobs[key].data ||
        persisting.current.has(key)
      ) {
        return;
      }
      const data = jobs[key].data;
      if (
        key === 'agentPreview' &&
        state.intake &&
        (!data ||
          typeof data !== 'object' ||
          !('inputKey' in data) ||
          data.inputKey !== state.previewRequest?.inputKey)
      )
        return;
      const patch = patchFor(key, data, currentBrandName);
      if (!patch) return;
      persisting.current.add(key);
      void updateState(patch)
        .then(() => {
          persisted.current.set(key, data);
          persisting.current.delete(key);
          scheduleRetry();
        })
        .catch(() => {
          persisting.current.delete(key);
          window.setTimeout(scheduleRetry, 1_000);
        });

      if (key === 'scrape') {
        const scrape = parseScrape(jobs[key].data);
        const source = onboardingSourceResponseSchema.safeParse(data);
        const logoUrl =
          scrape?.logoUrl ??
          (source.success && source.data.kind === 'instagram'
            ? (source.data.instagram_profile.profile_picture_url ??
              source.data.instagram_profile.og_image)
            : source.success && source.data.kind === 'facebook'
              ? source.data.facebook_profile.image_url
              : null);
        if (
          logoUrl &&
          /^https?:\/\//i.test(logoUrl) &&
          !logoInternalized.current.has(logoUrl) &&
          !logoInternalizing.current.has(logoUrl)
        ) {
          logoInternalizing.current.add(logoUrl);
          void internalizeLogo(brandId, logoUrl)
            .then(async (storagePath) => {
              if (currentScrape.current.status !== 'done' || currentScrape.current.data !== data)
                return;
              if (storagePath) {
                await updateState({ brand: { logoPath: storagePath } });
              }
              logoInternalized.current.add(logoUrl);
            })
            .catch(() => {
              window.setTimeout(scheduleRetry, 1_000);
            })
            .finally(() => {
              logoInternalizing.current.delete(logoUrl);
            });
        }
      }
    });
  }, [
    jobs,
    brandId,
    currentBrandName,
    retryVersion,
    updateState,
    state.intake,
    state.previewRequest,
  ]);

  return null;
}

// `fallbackName` is the name already in onboarding state. It matters because
// the scrape is the only writer of `brand.name` that reaches
// `brand_profiles.brand_name`, and a raw `scrape.title` persisted junk verbatim
// ("Page Not Found | Framer", a brand carrying its full tagline). Routing it
// through resolveSafeBrandName rejects interstitial titles and reduces an SEO
// title to its brand segment; on rejection the existing name survives instead
// of being overwritten.
export function scrapeToBrandPatch(
  scrape: ScrapeResult,
  fallbackName?: string | null,
): OnboardingPatch {
  const typography = scrape.typography
    ? {
        primary: scrape.typography.primary ?? null,
        secondary: scrape.typography.secondary ?? null,
      }
    : undefined;
  return {
    brand: {
      website: scrape.url,
      name: resolveSafeBrandName({ scrapeTitle: scrape.title, fallbackName, url: scrape.url }),
      logoPath: scrape.logoUrl ?? undefined,
      colors: scrape.colors,
      typography,
      overview: scrape.description ?? undefined,
    },
  };
}

function patchFor(
  key: JobKey,
  data: unknown,
  fallbackName?: string | null,
): OnboardingPatch | null {
  if (key === 'scrape') {
    const scrape = parseScrape(data);
    if (scrape) return scrapeToBrandPatch(scrape, fallbackName);
    const source = onboardingSourceResponseSchema.safeParse(data);
    if (!source.success || source.data.kind === 'web') return null;
    const logo =
      source.data.kind === 'instagram'
        ? (source.data.instagram_profile.profile_picture_url ??
          source.data.instagram_profile.og_image)
        : source.data.facebook_profile.image_url;
    return { brand: { ...(logo ? { logoPath: logo } : {}) } };
  }
  if (key === 'agentPreview') {
    const raw = data as AgentPreviewBuckets | { buckets: AgentPreviewBuckets } | null;
    if (!raw) return null;
    const b: AgentPreviewBuckets = typeof raw === 'object' && 'buckets' in raw ? raw.buckets : raw;
    const brandPatch = {
      brandVoice: voiceText(b),
      targetAudience: audienceText(b),
      overview: b.business?.business_description || undefined,
      tagline: b.website?.hero_statement ?? b.business?.business_cta ?? undefined,
      values: b.voice?.core_values ?? undefined,
      readiness: b.readiness ?? undefined,
      understanding: b.result?.understanding ?? undefined,
      audits: b.result?.audits ?? undefined,
    };
    const hasAnyValue = Object.values(brandPatch).some((v) => {
      if (v === undefined || v === null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'string') return v.length > 0;
      return true;
    });
    if (!hasAnyValue) return null;
    return { brand: brandPatch };
  }
  return null;
}

// Only parsed payloads are saved. The stream deltas these once fell back to are the
// model's half-written JSON, and 50 of 399 onboarding states carried one as prose.
function voiceText(b: AgentPreviewBuckets): string | undefined {
  const parts = [b.voice?.voice_style, b.voice?.tone, b.voice?.mission].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : undefined;
}

function audienceText(b: AgentPreviewBuckets): string | undefined {
  return b.audience?.summary || undefined;
}
