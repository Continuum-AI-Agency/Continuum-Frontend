// Browser fetchers for the share owner's management API (/api/library/share/manage).

import {
  type ShareLinkActivityEvent,
  type ShareLinkDetailResponse,
  shareLinkActivityResponseSchema,
  shareLinkDetailResponseSchema,
  type UpdateShareLinkRequest,
} from '@continuum/contracts';

const MANAGE = '/api/library/share/manage';

async function readJson<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Request failed (${response.status})`);
  }
  return parse(body);
}

export async function fetchShareLinkDetail(
  by: { id: string } | { token: string },
): Promise<ShareLinkDetailResponse> {
  const query = new URLSearchParams('id' in by ? { id: by.id } : { token: by.token });
  return readJson(await fetch(`${MANAGE}?${query}`), (value) =>
    shareLinkDetailResponseSchema.parse(value),
  );
}

export async function updateShareLinkSettings(
  request: UpdateShareLinkRequest,
): Promise<ShareLinkDetailResponse> {
  const response = await fetch(MANAGE, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  return readJson(response, (value) => shareLinkDetailResponseSchema.parse(value));
}

export async function fetchAssetShareActivity(
  brandId: string,
  assetId: string,
): Promise<ShareLinkActivityEvent[]> {
  const query = new URLSearchParams({ brandId, assetId });
  return readJson(
    await fetch(`${MANAGE}?${query}`),
    (value) => shareLinkActivityResponseSchema.parse(value).events,
  );
}

export function shareTokenFromUrl(url: string): string | null {
  return /\/share\/([^/?#]+)/.exec(url)?.[1] ?? null;
}
