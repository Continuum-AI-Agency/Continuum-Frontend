"use client";

import { PaidMetricsResponseSchema } from "@/lib/schemas/paidMetrics";
import type { PaidMetricsRequest, PaidMetricsResponse } from "@/lib/schemas/paidMetrics";

export async function fetchPaidMediaMetrics(request: PaidMetricsRequest): Promise<PaidMetricsResponse> {
  const response = await fetch("/api/paid-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let message = "Unable to load Paid Media metrics.";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // ignore non-JSON
    }
    throw new Error(message);
  }

  const json = (await response.json()) as unknown;
  return PaidMetricsResponseSchema.parse(json);
}
