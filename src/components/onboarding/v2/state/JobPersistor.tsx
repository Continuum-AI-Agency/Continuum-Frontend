"use client";

import { useEffect, useRef } from "react";
import { useBackgroundJobs, type JobKey } from "./BackgroundJobsProvider";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import { scrapeSchema, type ScrapeResult } from "@/lib/onboarding/scrape";
import type { AgentPreviewBuckets } from "./agentPreview";
import type { OnboardingPatch } from "@/lib/onboarding/state";
import { internalizeLogo } from "@/lib/onboarding/internalizeLogo";

function parseScrape(data: unknown): ScrapeResult | null {
  if (data == null) return null;
  const parsed = scrapeSchema.safeParse(data);
  return parsed.success ? (parsed.data as ScrapeResult) : null;
}

export function JobPersistor() {
  const { jobs } = useBackgroundJobs();
  const { brandId, updateState } = useOnboarding();
  const persisted = useRef<Set<JobKey>>(new Set());
  const logoInternalized = useRef<Set<string>>(new Set());

  useEffect(() => {
    (Object.keys(jobs) as JobKey[]).forEach((key) => {
      if (jobs[key].status !== "done" || persisted.current.has(key)) return;
      const patch = patchFor(key, jobs[key].data);
      if (!patch) return;
      persisted.current.add(key);
      void updateState(patch);

      if (key === "scrape") {
        const scrape = parseScrape(jobs[key].data);
        const logoUrl = scrape?.logoUrl;
        if (logoUrl && /^https?:\/\//i.test(logoUrl) && !logoInternalized.current.has(logoUrl)) {
          logoInternalized.current.add(logoUrl);
          void internalizeLogo(brandId, logoUrl).then((storagePath) => {
            if (storagePath) {
              void updateState({ brand: { logoPath: storagePath } });
            }
          });
        }
      }
    });
  }, [jobs, brandId, updateState]);

  return null;
}

export function scrapeToBrandPatch(scrape: ScrapeResult): OnboardingPatch {
  const typography = scrape.typography
    ? {
        primary: scrape.typography.primary ?? null,
        secondary: scrape.typography.secondary ?? null,
      }
    : undefined;
  return {
    brand: {
      website: scrape.url,
      name: scrape.title ?? undefined,
      logoPath: scrape.logoUrl ?? undefined,
      colors: scrape.colors,
      typography,
      overview: scrape.description ?? undefined,
    },
  };
}

function patchFor(key: JobKey, data: unknown): OnboardingPatch | null {
  if (key === "scrape") {
    const scrape = parseScrape(data);
    return scrape ? scrapeToBrandPatch(scrape) : null;
  }
  if (key === "agentPreview") {
    const raw = data as AgentPreviewBuckets | { buckets: AgentPreviewBuckets } | null;
    if (!raw) return null;
    const b: AgentPreviewBuckets =
      typeof raw === "object" && "buckets" in raw ? raw.buckets : raw;
    const brandPatch = {
      brandVoice: voiceText(b),
      targetAudience: audienceText(b),
      overview: (b.business?.business_description ?? b.businessStream) || undefined,
      tagline: (b.website?.hero_statement ?? b.business?.business_cta) ?? undefined,
      values: b.voice?.core_values ?? undefined,
      readiness: b.readiness ?? undefined,
      understanding: b.result?.understanding ?? undefined,
      audits: b.result?.audits ?? undefined,
    };
    const hasAnyValue = Object.values(brandPatch).some((v) => {
      if (v === undefined || v === null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "string") return v.length > 0;
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
    if (parts.length > 0) return parts.join(" — ");
  }
  return b.voiceStream || undefined;
}

function audienceText(b: AgentPreviewBuckets): string | undefined {
  if (b.audience?.summary) return b.audience.summary;
  return b.audienceStream || undefined;
}
