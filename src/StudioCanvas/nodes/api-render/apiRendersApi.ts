import {
  API_RENDER_JOBS_ROUTE,
  API_RENDER_PREFLIGHT_ROUTE,
  API_RENDER_TEMPLATES_ROUTE,
  type ApiRenderCreateJobRequest,
  type ApiRenderJob,
  type ApiRenderJobListResponse,
  type ApiRenderPreflightRequest,
  type ApiRenderPreflightResponse,
  type ApiRenderTemplateContract,
  type ApiRenderTemplateListResponse,
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
};
