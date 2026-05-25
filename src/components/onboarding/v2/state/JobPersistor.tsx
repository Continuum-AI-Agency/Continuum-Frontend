"use client";

import { useEffect, useRef } from "react";
import { useBackgroundJobs, type JobKey } from "./BackgroundJobsProvider";
import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext";
import type { ScrapeResult } from "@/lib/onboarding/scrape";
import type { AgentPreviewBuckets } from "./agentPreview";
import type { OnboardingPatch } from "@/lib/onboarding/state";

export function JobPersistor() {
  const { jobs } = useBackgroundJobs();
  const { updateState } = useOnboarding();
  const persisted = useRef<Set<JobKey>>(new Set());

  useEffect(() => {
    (Object.keys(jobs) as JobKey[]).forEach((key) => {
      if (jobs[key].status !== "done" || persisted.current.has(key)) return;
      const patch = patchFor(key, jobs[key].data);
      if (!patch) return;
      persisted.current.add(key);
      void updateState(patch);
    });
  }, [jobs, updateState]);

  return null;
}

export function scrapeToBrandPatch(scrape: ScrapeResult): OnboardingPatch {
  return {
    brand: {
      website: scrape.url,
      name: scrape.title ?? undefined,
      logoPath: scrape.logoUrl ?? undefined,
      colors: scrape.colors,
      typography: scrape.typography,
      overview: scrape.description ?? undefined,
    },
  };
}

function patchFor(key: JobKey, data: unknown): OnboardingPatch | null {
  if (key === "scrape") {
    return scrapeToBrandPatch(data as ScrapeResult);
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
      values: b.voice?.core_values,
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
