import {
  type FigmaFile,
  type FigmaFolder,
  type FigmaFrame,
  type FigmaImportedAsset,
  figmaFilesResponseSchema,
  figmaFoldersResponseSchema,
  figmaFramesResponseSchema,
  importFigmaFramesRequestSchema,
  importFigmaFramesResponseSchema,
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
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    throw new FigmaApiError(
      typeof body.error === 'string' ? body.error : `http_${response.status}`,
      Array.isArray(body.missingFonts) ? body.missingFonts.map(String) : [],
      typeof body.retryAfterSec === 'number' ? body.retryAfterSec : null,
    );
  }
  return payload;
}

/** A refusal from the Figma routes: its code, plus what the backend says to fix. */
export class FigmaApiError extends Error {
  constructor(
    readonly code: string,
    readonly missingFonts: string[] = [],
    readonly retryAfterSec: number | null = null,
  ) {
    super(code);
  }
}

/** What a person reads for a Figma refusal, and whether connecting Figma is the fix. */
export function figmaErrorMessage(error: unknown): { message: string; reconnect: boolean } {
  const code =
    error instanceof FigmaApiError
      ? error.code
      : error instanceof Error
        ? error.message
        : 'operation_failed';
  switch (code) {
    case 'invalid_link':
      return { message: 'Paste a link to a Figma design file or frame.', reconnect: false };
    case 'invalid_configuration':
      return { message: 'Figma is not configured for this environment.', reconnect: false };
    case 'figma_not_connected':
      return { message: 'Connect Figma, then try again.', reconnect: true };
    case 'provider_unavailable':
      return { message: "Figma didn't answer. Try again in a moment.", reconnect: false };
    case 'figma_file_forbidden':
      return {
        message: "The connected Figma account can't open this file. Connect one that can.",
        reconnect: true,
      };
    case 'figma_not_found':
      return {
        message: "Figma couldn't find that file or frame. Check the link.",
        reconnect: false,
      };
    case 'figma_node_not_a_frame':
      return {
        message:
          'That link points at a page or a layer, not a frame. Pick frames from the file below.',
        reconnect: false,
      };
    case 'figma_fonts_missing': {
      const fonts = error instanceof FigmaApiError ? error.missingFonts.join(', ') : '';
      return {
        message: `Add ${fonts || 'the missing fonts'} to the brand first (drop the .ttf or .otf files on the Forge), then import again.`,
        reconnect: false,
      };
    }
    case 'rate_limited': {
      const wait =
        error instanceof FigmaApiError && error.retryAfterSec
          ? ` Try again in ${Math.ceil(error.retryAfterSec / 60)} min.`
          : '';
      return {
        message: `Figma's API limit for this account is used up.${wait} View and Collab seats get about 20 file reads a month; a Dev or Full seat lifts it.`,
        reconnect: false,
      };
    }
    case 'http_502':
    case 'http_504':
      // The proxy gave up on a long import; the backend carries on, and a retry joins it.
      return {
        message:
          'The import is still running. Import again in a minute: it picks up the same import.',
        reconnect: false,
      };
    default:
      return { message: `The import failed (${code}).`, reconnect: false };
  }
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

/** A team's top-level folders, or a folder's direct subfolders. */
export async function listFigmaFolders(
  brandId: string,
  parent: { teamId: string } | { folderId: string },
  tokenResolver?: () => Promise<string>,
): Promise<FigmaFolder[]> {
  const query = new URLSearchParams({ brandId, ...parent });
  return figmaFoldersResponseSchema.parse(await requestJson(`/folders?${query}`, {}, tokenResolver))
    .folders;
}

export async function listFigmaFiles(brandId: string, folderId: string): Promise<FigmaFile[]> {
  const query = new URLSearchParams({ brandId, folderId });
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
