import {
  type LibraryPreviewProxyResponse,
  libraryPreviewProxyRequestSchema,
  libraryPreviewProxyResponseSchema,
} from '@continuum/contracts';
import { http } from '@/lib/api/http';

export function requestLibraryPreviewProxy(input: {
  brandId: string;
  assetId: string;
  assetVersionId: string;
}): Promise<LibraryPreviewProxyResponse> {
  return http.request({
    path: '/api/media/library-preview-proxy',
    method: 'POST',
    body: libraryPreviewProxyRequestSchema.parse(input),
    schema: libraryPreviewProxyResponseSchema,
    cache: 'no-store',
  });
}
