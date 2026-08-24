import {
  API_RENDER_BATCH_PREFLIGHT_ROUTE,
  API_RENDER_BATCHES_ROUTE,
  API_RENDER_INPUT_SETS_ROUTE,
  API_RENDER_JOBS_ROUTE,
  API_RENDER_PREFLIGHT_ROUTE,
  API_RENDER_TEMPLATES_ROUTE,
  type ApiRenderBatch,
  type ApiRenderBatchPreflightRequest,
  type ApiRenderBatchPreflightResponse,
  type ApiRenderCreateInputSetRequest,
  type ApiRenderCreateJobRequest,
  type ApiRenderInputSet,
  type ApiRenderInputSetListResponse,
  type ApiRenderJob,
  type ApiRenderJobListResponse,
  type ApiRenderPreflightRequest,
  type ApiRenderPreflightResponse,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateListResponse,
  type ApiRenderUpdateInputSetRequest,
  apiRenderBatchPreflightResponseSchema,
  apiRenderBatchSchema,
  apiRenderInputSetListResponseSchema,
  apiRenderInputSetSchema,
  apiRenderJobListResponseSchema,
  apiRenderJobSchema,
  apiRenderPreflightResponseSchema,
  apiRenderTemplateContractSchema,
  apiRenderTemplateListResponseSchema,
} from '@continuum/contracts';
import { http } from '@/lib/api/http';

const query = (input: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])).toString();

export const apiRendersApi = {
  listTemplates(brandId: string) {
    return http.request<ApiRenderTemplateListResponse>({
      path: `${API_RENDER_TEMPLATES_ROUTE}?${query({ brandId })}`,
      schema: apiRenderTemplateListResponseSchema,
    });
  },
  getContract(brandId: string, templateKey: string) {
    return http.request<ApiRenderTemplateContract>({
      path: `${API_RENDER_TEMPLATES_ROUTE}/${encodeURIComponent(templateKey)}/contract?${query({ brandId })}`,
      schema: apiRenderTemplateContractSchema,
    });
  },
  preflight(input: ApiRenderPreflightRequest) {
    return http.request<ApiRenderPreflightResponse>({
      path: API_RENDER_PREFLIGHT_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderPreflightResponseSchema,
    });
  },
  createJob(input: ApiRenderCreateJobRequest) {
    return http.request<ApiRenderJob>({
      path: API_RENDER_JOBS_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderJobSchema,
    });
  },
  listJobs(brandId: string, limit = 10) {
    return http.request<ApiRenderJobListResponse>({
      path: `${API_RENDER_JOBS_ROUTE}?${query({ brandId, limit })}`,
      schema: apiRenderJobListResponseSchema,
    });
  },
  getJob(brandId: string, jobId: string) {
    return http.request<ApiRenderJob>({
      path: `${API_RENDER_JOBS_ROUTE}/${encodeURIComponent(jobId)}?${query({ brandId })}`,
      schema: apiRenderJobSchema,
    });
  },

  // Saved input sets. Brand-scoped everywhere; `templateKey` is the server's optional
  // filter, and the node always passes it — a set authored against one template's
  // contract is meaningless against another.
  listInputSets(brandId: string, templateKey?: string) {
    const params = templateKey ? query({ brandId, templateKey }) : query({ brandId });
    return http.request<ApiRenderInputSetListResponse>({
      path: `${API_RENDER_INPUT_SETS_ROUTE}?${params}`,
      schema: apiRenderInputSetListResponseSchema,
    });
  },
  createInputSet(input: ApiRenderCreateInputSetRequest) {
    return http.request<ApiRenderInputSet>({
      path: API_RENDER_INPUT_SETS_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderInputSetSchema,
    });
  },
  // The one asymmetry in this surface: PATCH reads brandId from the BODY, not the
  // query string. Mirrored here rather than "fixed", because the server is the server.
  updateInputSet(inputSetId: string, input: ApiRenderUpdateInputSetRequest) {
    return http.request<ApiRenderInputSet>({
      path: `${API_RENDER_INPUT_SETS_ROUTE}/${encodeURIComponent(inputSetId)}`,
      method: 'PATCH',
      body: input,
      schema: apiRenderInputSetSchema,
    });
  },
  deleteInputSet(brandId: string, inputSetId: string) {
    return http.request<void>({
      path: `${API_RENDER_INPUT_SETS_ROUTE}/${encodeURIComponent(inputSetId)}?${query({ brandId })}`,
      method: 'DELETE',
    });
  },

  // Batches. One token wraps N per-record tokens; the 202 from createBatch carries the
  // only job-id list that will ever exist, because no batch id is persisted server-side.
  batchPreflight(input: ApiRenderBatchPreflightRequest) {
    return http.request<ApiRenderBatchPreflightResponse>({
      path: API_RENDER_BATCH_PREFLIGHT_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderBatchPreflightResponseSchema,
    });
  },
  createBatch(input: ApiRenderCreateJobRequest) {
    return http.request<ApiRenderBatch>({
      path: API_RENDER_BATCHES_ROUTE,
      method: 'POST',
      body: input,
      schema: apiRenderBatchSchema,
    });
  },
};
