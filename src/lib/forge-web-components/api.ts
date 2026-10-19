import {
  type WebComponentBuildResponse,
  type WebComponentDraft,
  type WebComponentDraftSummary,
  type WebComponentProject,
  type WebComponentRenderJob,
  type WebComponentRevision,
  webComponentBuildResponseSchema,
  webComponentDraftListResponseSchema,
  webComponentDraftSchema,
  webComponentProjectSchema,
  webComponentRenderJobResponseSchema,
  webComponentRenderRequestSchema,
  webComponentRevisionSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import { getApiBaseUrl } from '@/lib/api/config';
import { http } from '@/lib/api/http';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

const BASE = '/api/ai-studio/web-components';
const draftPath = (id: string) => `${BASE}/drafts/${encodeURIComponent(id)}`;

export type { WebComponentDraftSummary } from '@continuum/contracts';

export const webComponentsApi = {
  async list(brandId: string): Promise<WebComponentDraftSummary[]> {
    const query = new URLSearchParams({ brandId });
    const response = await http.request<{ drafts: WebComponentDraftSummary[] }>({
      path: `${BASE}/drafts?${query}`,
      schema: webComponentDraftListResponseSchema,
      cache: 'no-store',
    });
    return response.drafts;
  },

  async create(brandId: string, project: WebComponentProject): Promise<WebComponentDraft> {
    const response = await http.request<{ draft: WebComponentDraft }>({
      path: `${BASE}/drafts`,
      method: 'POST',
      body: { brandId, project: webComponentProjectSchema.parse(project) },
      schema: z.object({ draft: webComponentDraftSchema }),
      cache: 'no-store',
    });
    return response.draft;
  },

  async load(id: string): Promise<WebComponentDraft> {
    const response = await http.request<{ draft: WebComponentDraft }>({
      path: draftPath(id),
      schema: z.object({ draft: webComponentDraftSchema }),
      cache: 'no-store',
    });
    return response.draft;
  },

  async save(
    id: string,
    expectedRevision: number,
    project: WebComponentProject,
  ): Promise<WebComponentDraft> {
    const response = await http.request<{ draft: WebComponentDraft }>({
      path: draftPath(id),
      method: 'PUT',
      body: { expectedRevision, project: webComponentProjectSchema.parse(project) },
      schema: z.object({ draft: webComponentDraftSchema }),
      cache: 'no-store',
    });
    return response.draft;
  },

  async build(id: string, expectedRevision: number): Promise<WebComponentBuildResponse> {
    return http.request({
      path: `${draftPath(id)}/build`,
      method: 'POST',
      body: { expectedRevision },
      schema: webComponentBuildResponseSchema,
      cache: 'no-store',
    });
  },

  async inspect(id: string, buildId: string): Promise<WebComponentBuildResponse> {
    return http.request({
      path: `${draftPath(id)}/builds/${encodeURIComponent(buildId)}/inspect`,
      method: 'POST',
      schema: webComponentBuildResponseSchema,
      cache: 'no-store',
    });
  },

  async commit(
    id: string,
    expectedRevision: number,
    buildId: string,
  ): Promise<WebComponentRevision> {
    const response = await http.request<{ revision: WebComponentRevision }>({
      path: `${draftPath(id)}/commit`,
      method: 'POST',
      body: { expectedRevision, buildId, reviewed: true },
      schema: z.object({ revision: webComponentRevisionSchema }),
      cache: 'no-store',
    });
    return response.revision;
  },

  async queueRender(
    revisionId: string,
    input: { format: 'png' | 'mp4'; timeSec?: number },
    signal?: AbortSignal,
  ): Promise<{ job: WebComponentRenderJob }> {
    return http.request({
      path: `${BASE}/revisions/${encodeURIComponent(revisionId)}/render-jobs`,
      method: 'POST',
      body: webComponentRenderRequestSchema.parse(input),
      schema: webComponentRenderJobResponseSchema,
      cache: 'no-store',
      signal,
    });
  },

  async getRenderJob(
    revisionId: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<{ job: WebComponentRenderJob }> {
    return http.request({
      path: `${BASE}/revisions/${encodeURIComponent(revisionId)}/render-jobs/${encodeURIComponent(jobId)}`,
      schema: webComponentRenderJobResponseSchema,
      cache: 'no-store',
      signal,
    });
  },

  async download(revisionId: string) {
    const token = await getBrowserAccessToken();
    const response = await fetch(
      `${getApiBaseUrl()}${BASE}/revisions/${encodeURIComponent(revisionId)}/export`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body || `Bundle download failed (${response.status})`);
    }
    return response.blob();
  },
};
