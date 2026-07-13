// Typed browser fetchers for the share-link API (/api/library/share). The
// media.share_links table is deny-all RLS, so all reads/writes go through the
// Next route, which gates on brand access and uses the admin client.

import {
  type CreateShareLinkRequest,
  createShareLinkRequestSchema,
  listShareLinksResponseSchema,
  type RevokeShareLinkRequest,
  revokeShareLinkRequestSchema,
  type ShareLink,
  shareLinkSchema,
} from '@continuum/contracts';

const SHARE_ENDPOINT = '/api/library/share';

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.length > 0) return body.error;
  } catch {
    // fall through to the generic message
  }
  return `Share request failed (${response.status})`;
}

export async function createShareLink(request: CreateShareLinkRequest): Promise<ShareLink> {
  const body = createShareLinkRequestSchema.parse(request);
  const response = await fetch(SHARE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const parsed = shareLinkSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Share create returned an invalid link');
  return parsed.data;
}

export async function listShareLinks(brandId: string, assetId: string): Promise<ShareLink[]> {
  const query = new URLSearchParams({ brandId, assetId });
  const response = await fetch(`${SHARE_ENDPOINT}?${query.toString()}`);
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const parsed = listShareLinksResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Share list returned an invalid response');
  return parsed.data.links;
}

export async function revokeShareLink(request: RevokeShareLinkRequest): Promise<ShareLink> {
  const body = revokeShareLinkRequestSchema.parse(request);
  const response = await fetch(SHARE_ENDPOINT, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const parsed = shareLinkSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Share revoke returned an invalid link');
  return parsed.data;
}
