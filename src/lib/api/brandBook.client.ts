'use client';

import {
  type BrandMdSaveResult,
  brandMdSaveResultSchema,
  type ReadinessAnalysis,
  readinessAnalysisSchema,
} from '@continuum/contracts';
import { z } from 'zod';

import { http } from '@/lib/api/http';

const recomputeReadinessResponseSchema = z.object({
  brand_id: z.string().optional(),
  readiness: readinessAnalysisSchema,
});

const deepenResponseSchema = z
  .object({
    brand_id: z.string().optional(),
    job_id: z.string().nullable().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export type DeepenBrandBookResponse = {
  jobId: string | null;
  status: string;
};

/**
 * Manually trigger the T2 deep-analysis lane for a brand (the Brand Book
 * "Deepen" action). The backend dedupes via the active-unique index, returning
 * `already_running` when a pass is in flight.
 */
export async function deepenBrandBook(brandId: string): Promise<DeepenBrandBookResponse> {
  const response = await http.request({
    path: `/onboarding/brand-profiles/${encodeURIComponent(brandId)}/deepen`,
    method: 'POST',
    cache: 'no-store',
  });

  const parsed = deepenResponseSchema.optional().parse(response);
  return {
    jobId: parsed?.job_id ?? null,
    status: parsed?.status ?? 'queued',
  };
}

/**
 * Save a sticky brand.md edit. The whole edited doc (front matter + body) is the
 * source of truth; the corrected tokens flow into creative grounding. Returns the
 * new effective doc so the editor can update without a refetch.
 */
export async function saveBrandMd(brandId: string, brandMd: string): Promise<BrandMdSaveResult> {
  const response = await http.request({
    path: `/onboarding/brand-profiles/${encodeURIComponent(brandId)}/brand-md`,
    method: 'POST',
    body: { brand_md: brandMd },
    cache: 'no-store',
  });
  return brandMdSaveResultSchema.parse(response);
}

/** Revert to the generated baseline (clears the sticky edit). */
export async function resetBrandMd(brandId: string): Promise<BrandMdSaveResult> {
  const response = await http.request({
    path: `/onboarding/brand-profiles/${encodeURIComponent(brandId)}/brand-md/reset`,
    method: 'POST',
    cache: 'no-store',
  });
  return brandMdSaveResultSchema.parse(response);
}

/**
 * Recalculate brand readiness on demand via the Flash-Lite scorer, scoring the
 * effective brand.md (so edits move the score). Returns the fresh readiness.
 */
export async function recomputeReadiness(brandId: string): Promise<ReadinessAnalysis> {
  const response = await http.request({
    path: `/onboarding/brand-profiles/${encodeURIComponent(brandId)}/readiness/recompute`,
    method: 'POST',
    cache: 'no-store',
  });
  return recomputeReadinessResponseSchema.parse(response).readiness;
}
