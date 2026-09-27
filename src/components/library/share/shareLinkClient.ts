// Browser calls for the share owner: the library-share edge function, invoked with
// the signed-in user's JWT. It checks brand access on the caller's own client
// before any service-role work, so nothing here needs a server key.

import {
  type LibraryShareRequest,
  type ShareLinkActivityResponse,
  type ShareLinkDetailResponse,
  shareLinkActivityResponseSchema,
  shareLinkDetailResponseSchema,
  type UpdateShareLinkRequest,
} from '@continuum/contracts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

async function invokeShare<T>(body: LibraryShareRequest, parse: (value: unknown) => T): Promise<T> {
  const { data, error } = await createSupabaseBrowserClient().functions.invoke('library-share', { body });
  if (error) {
    // A non-2xx carries the function's own message in the response body.
    const context = (error as { context?: Response }).context;
    const detail = context ? ((await context.json().catch(() => null)) as { error?: unknown } | null) : null;
    throw new Error(typeof detail?.error === 'string' ? detail.error : error.message);
  }
  return parse(data);
}

export function fetchShareLinkDetail(
  by: { id: string } | { token: string },
): Promise<ShareLinkDetailResponse> {
  return invokeShare({ action: 'share_link_detail', ...by }, (value) =>
    shareLinkDetailResponseSchema.parse(value),
  );
}

export function updateShareLinkSettings(
  request: UpdateShareLinkRequest,
): Promise<ShareLinkDetailResponse> {
  return invokeShare({ action: 'update_share_link', ...request }, (value) =>
    shareLinkDetailResponseSchema.parse(value),
  );
}

export function fetchAssetShareActivity(
  brandId: string,
  assetId: string,
): Promise<ShareLinkActivityResponse> {
  return invokeShare({ action: 'asset_share_activity', brandId, assetId }, (value) =>
    shareLinkActivityResponseSchema.parse(value),
  );
}

export function shareTokenFromUrl(url: string): string | null {
  return /\/share\/([^/?#]+)/.exec(url)?.[1] ?? null;
}
