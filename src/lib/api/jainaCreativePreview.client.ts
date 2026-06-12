import { http } from "@/lib/api/http";
import {
  jainaCreativePreviewResponseSchema,
  type DatasetCreativeRef,
  type JainaCreativePreviewResponse,
} from "@continuum/contracts";

// A `format:"creative"` table cell can only resolve a preview when the ref
// carries the brand + account context and at least one creative/ad id.
export function isResolvableCreativeRef(ref: DatasetCreativeRef): boolean {
  return Boolean(ref.brand_id && ref.ad_account_id && (ref.ad_id || ref.creative_id));
}

// Lazy-resolve a FRESH creative image (Meta CDN URLs expire) on hover-open.
export async function fetchJainaCreativePreview(
  ref: DatasetCreativeRef,
  signal?: AbortSignal,
): Promise<JainaCreativePreviewResponse> {
  return http.request<JainaCreativePreviewResponse>({
    path: "/api/agents/jaina/creative-preview",
    method: "POST",
    body: {
      brand_id: ref.brand_id,
      ad_account_id: ref.ad_account_id,
      creative_id: ref.creative_id,
      ad_id: ref.ad_id,
    },
    schema: jainaCreativePreviewResponseSchema,
    cache: "no-store",
    signal,
  });
}
