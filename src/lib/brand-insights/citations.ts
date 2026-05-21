import { z } from "zod";

import { request } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import {
  BRAND_TRENDS_SCHEMA,
  brandInsightsCitationSchema,
  type BrandInsightsCitation,
} from "@/lib/schemas/brandInsights";
import type { TrendInsightKind } from "@/lib/organic/trends";

const responseSchema = z.object({
  status: z.string().optional(),
  data: z
    .object({
      citations: z.array(brandInsightsCitationSchema).default([]),
    })
    .nullable()
    .optional(),
  citations: z.array(brandInsightsCitationSchema).optional(),
});

export type FetchCitationsParams = {
  brandId: string;
  insightType: TrendInsightKind;
  insightId: string;
};

export async function fetchInsightCitations({
  brandId,
  insightType,
  insightId,
}: FetchCitationsParams): Promise<BrandInsightsCitation[]> {
  const params = new URLSearchParams({
    brand_id: brandId,
    insight_type: insightType,
    insight_id: insightId,
  });
  try {
    const result = await request<z.infer<typeof responseSchema>>({
      path: `/insights/citations?${params.toString()}`,
      method: "GET",
      schema: responseSchema,
      headers: { "X-Supabase-Schema": BRAND_TRENDS_SCHEMA },
      cache: "no-store",
    });
    return result.data?.citations ?? result.citations ?? [];
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
}
