"use client";

import { z } from "zod";

import { http } from "@/lib/api/http";

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
    method: "POST",
    cache: "no-store",
  });

  const parsed = deepenResponseSchema.optional().parse(response);
  return {
    jobId: parsed?.job_id ?? null,
    status: parsed?.status ?? "queued",
  };
}
