'use client';

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
  const parsed = scrapeSchema.safeParse(data);
  return parsed.success ? (parsed.data as ScrapeResult) : null;
}

export function JobPersistor() {
  const { jobs } = useBackgroundJobs();
  const { brandId, state, updateState } = useOnboarding();
  const currentBrandName = state.brand.name;
  const persisted = useRef<Set<JobKey>>(new Set());
  const persisting = useRef<Set<JobKey>>(new Set());
  const logoInternalized = useRef<Set<string>>(new Set());
  const logoInternalizing = useRef<Set<string>>(new Set());
  const [retryVersion, scheduleRetry] = useReducer((version: number) => version + 1, 0);

  useEffect(() => {
    (Object.keys(jobs) as JobKey[]).forEach((key) => {
      if (
        jobs[key].status !== 'done' ||
        persisted.current.has(key) ||
        persisting.current.has(key)
      ) {
        return;
      }
      const patch = patchFor(key, jobs[key].data, currentBrandName);
      if (!patch) return;
      persisting.current.add(key);
      void updateState(patch)
        .then(() => {
          persisted.current.add(key);
        })
        .catch(() => {
          window.setTimeout(scheduleRetry, 1_000);
        })
        .finally(() => {
          persisting.current.delete(key);
        });

      if (key === 'scrape') {
        const scrape = parseScrape(jobs[key].data);
        const logoUrl = scrape?.logoUrl;
        if (
          logoUrl &&
          /^https?:\/\//i.test(logoUrl) &&
          !logoInternalized.current.has(logoUrl) &&
          !logoInternalizing.current.has(logoUrl)
        ) {
          logoInternalizing.current.add(logoUrl);
          void internalizeLogo(brandId, logoUrl)
            .then(async (storagePath) => {
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
  }, [jobs, brandId, currentBrandName, retryVersion, updateState]);

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
    return scrape ? scrapeToBrandPatch(scrape, fallbackName) : null;
  }
  if (key === 'agentPreview') {
    const raw = data as AgentPreviewBuckets | { buckets: AgentPreviewBuckets } | null;
    if (!raw) return null;
    const b: AgentPreviewBuckets = typeof raw === 'object' && 'buckets' in raw ? raw.buckets : raw;
    const brandPatch = {
      brandVoice: voiceText(b),
      targetAudience: audienceText(b),
      overview: (b.business?.business_description ?? b.businessStream) || undefined,
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

function voiceText(b: AgentPreviewBuckets): string | undefined {
  if (b.voice) {
    const parts = [b.voice.voice_style, b.voice.tone, b.voice.mission].filter(Boolean);
    if (parts.length > 0) return parts.join(' — ');
  }
  return b.voiceStream || undefined;
}

function audienceText(b: AgentPreviewBuckets): string | undefined {
  if (b.audience?.summary) return b.audience.summary;
  return b.audienceStream || undefined;
}
