// Typed browser commands for the Edge-owned Creative Operations authority.
// The user JWT is forwarded by the Supabase client; no Vercel admin write is
// involved in share creation, listing, or revocation.

import type { CreateShareLinkRequest, RevokeShareLinkRequest, ShareLink } from '@continuum/contracts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  createShareLinkOperation,
  listShareLinksOperation,
  revokeShareLinkOperation,
} from './creativeOperations';

export async function createShareLink(request: CreateShareLinkRequest): Promise<ShareLink> {
  return createShareLinkOperation(createSupabaseBrowserClient(), request);
}

export async function listShareLinks(brandId: string, assetId: string): Promise<ShareLink[]> {
  return listShareLinksOperation(createSupabaseBrowserClient(), { brandId, assetId });
}

export async function revokeShareLink(request: RevokeShareLinkRequest): Promise<ShareLink> {
  return revokeShareLinkOperation(createSupabaseBrowserClient(), request);
}
