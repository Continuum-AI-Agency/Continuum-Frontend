import {
  figmaFilesResponseSchema,
  figmaFramesResponseSchema,
  figmaProjectsResponseSchema,
  importFigmaFramesRequestSchema,
  importFigmaFramesResponseSchema,
  type FigmaFile,
  type FigmaFrame,
  type FigmaImportedAsset,
  type FigmaProject,
} from '@continuum/contracts';

import { getApiUrl } from '@/lib/api/config';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

async function userJwt(): Promise<string> {
  const { data, error } = await createSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? 'unauthenticated');
  }
  return data.session.access_token;
}

async function requestJson(
  path: string,
  init: RequestInit = {},
  tokenResolver: () => Promise<string> = userJwt,
): Promise<unknown> {
  const token = await tokenResolver();
  const response = await fetch(getApiUrl(`/integrations/figma${path}`), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `http_${response.status}`;
    throw new Error(code);
  }
  return payload;
}

export async function beginFigmaConnection(input: {
  brandId: string;
  callbackUrl: string;
}): Promise<string> {
  const query = new URLSearchParams({
    brand_id: input.brandId,
    callback_url: input.callbackUrl,
    return_to: '/library',
  });
  const payload = await requestJson(`/sync?${query}`);
  if (!payload || typeof payload !== 'object' || !('url' in payload)) {
    throw new Error('invalid_provider_response');
  }
  return String(payload.url);
}

export async function listFigmaProjects(
  brandId: string,
  teamId: string,
  tokenResolver?: () => Promise<string>,
): Promise<FigmaProject[]> {
  const query = new URLSearchParams({ brandId, teamId });
  return figmaProjectsResponseSchema.parse(
    await requestJson(`/projects?${query}`, {}, tokenResolver),
  ).projects;
}

export async function listFigmaFiles(
  brandId: string,
  projectId: string,
): Promise<FigmaFile[]> {
  const query = new URLSearchParams({ brandId, projectId });
  return figmaFilesResponseSchema.parse(await requestJson(`/files?${query}`)).files;
}

export async function listFigmaFrames(
  brandId: string,
  fileKey: string,
): Promise<{ fileName: string; modifiedAt: string | null; frames: FigmaFrame[] }> {
  const query = new URLSearchParams({ brandId, fileKey });
  return figmaFramesResponseSchema.parse(await requestJson(`/frames?${query}`));
}

export async function importFigmaFrames(input: {
  brandId: string;
  fileKey: string;
  nodeIds: string[];
  scale?: number;
}): Promise<FigmaImportedAsset[]> {
  const body = importFigmaFramesRequestSchema.parse(input);
  return importFigmaFramesResponseSchema.parse(
    await requestJson('/import', { method: 'POST', body: JSON.stringify(body) }),
  ).assets;
}
