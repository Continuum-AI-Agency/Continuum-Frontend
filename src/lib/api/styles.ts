import {
  type BrandStyle,
  brandStyleDecisionRequestSchema,
  brandStyleListResponseSchema,
  brandStyleSchema,
} from '@continuum/contracts';
import type { z } from 'zod';
import { http } from '@/lib/api/http';

export type BrandStyleDecision = 'approve' | 'retire';

const brandQuery = (brandId: string): string => `brandId=${encodeURIComponent(brandId)}`;

/** Drafts, approved and retired styles the brand's agents or users composed, newest first. */
export async function listBrandStyles(
  brandId: string,
  signal?: AbortSignal,
): Promise<BrandStyle[]> {
  const response = await http.request<z.infer<typeof brandStyleListResponseSchema>>({
    path: `/api/headless/styles?${brandQuery(brandId)}`,
    schema: brandStyleListResponseSchema,
    signal,
  });
  return response.styles;
}

/** Only a brand user approves a draft; the agent that composed it cannot. */
export function decideBrandStyle(
  brandId: string,
  styleId: string,
  decision: BrandStyleDecision,
): Promise<BrandStyle> {
  return http.request({
    path: `/api/headless/styles/${encodeURIComponent(styleId)}/decision?${brandQuery(brandId)}`,
    method: 'POST',
    body: brandStyleDecisionRequestSchema.parse({ decision }),
    schema: brandStyleSchema,
  });
}
