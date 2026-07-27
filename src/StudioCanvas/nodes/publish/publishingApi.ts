import {
  type AttachOrganicCanvasCreativeRequest,
  attachOrganicCanvasCreativeResponseSchema,
  type OrganicCanvasTargetSearchRequest,
  type OrganicCanvasTargetSearchResponse,
  organicCanvasTargetSearchResponseSchema,
  type PaidCanvasCreativeReplacementRequest,
  type PaidCanvasCreativeReplacementResponse,
  type PaidCanvasTargetSearchRequest,
  type PaidCanvasTargetSearchResponse,
  paidCanvasCreativeReplacementResponseSchema,
  paidCanvasTargetSearchResponseSchema,
} from '@continuum/contracts';
import { http } from '@/lib/api/http';

const queryString = (input: Record<string, unknown>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
};

export const publishingApi = {
  searchOrganic(input: OrganicCanvasTargetSearchRequest) {
    return http.request<OrganicCanvasTargetSearchResponse>({
      path: `/api/ai-studio/publishing/organic/targets?${queryString(input)}`,
      schema: organicCanvasTargetSearchResponseSchema,
    });
  },
  attachOrganic(draftId: string, input: AttachOrganicCanvasCreativeRequest) {
    return http.request<import('@continuum/contracts').AttachOrganicCanvasCreativeResponse>({
      path: `/api/ai-studio/publishing/organic/drafts/${encodeURIComponent(draftId)}/creative`,
      method: 'POST',
      body: input,
      schema: attachOrganicCanvasCreativeResponseSchema,
    });
  },
  searchPaid(input: PaidCanvasTargetSearchRequest) {
    return http.request<PaidCanvasTargetSearchResponse>({
      path: `/api/ai-studio/publishing/paid/targets?${queryString(input)}`,
      schema: paidCanvasTargetSearchResponseSchema,
    });
  },
  replacePaid(input: PaidCanvasCreativeReplacementRequest) {
    return http.request<PaidCanvasCreativeReplacementResponse>({
      path: '/api/ai-studio/publishing/paid/replacements',
      method: 'POST',
      body: input,
      schema: paidCanvasCreativeReplacementResponseSchema,
    });
  },
};
