'use client';

// The signed-in user's role on a brand, for hiding edit controls a viewer cannot use.
// This is presentation only: the dispatcher (authorize_operation) and the restrictive RLS
// policies refuse a viewer's write whatever the UI shows. brand_profiles.brand_role is
// pinned to auth.uid(), so it can only ever answer about the caller.

import { useEffect, useState } from 'react';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type BrandRole = 'owner' | 'admin' | 'operator' | 'viewer';

const cache = new Map<string, Promise<BrandRole | null>>();

function loadRole(brandId: string): Promise<BrandRole | null> {
  const cached = cache.get(brandId);
  if (cached) return cached;
  const pending = Promise.resolve(
    createSupabaseBrowserClient()
      .schema('brand_profiles')
      .rpc('brand_role', { p_brand_id: brandId }),
  ).then(({ data, error }) => {
    if (error) {
      cache.delete(brandId);
      return null;
    }
    return (data as BrandRole | null) ?? null;
  });
  cache.set(brandId, pending);
  return pending;
}

/**
 * Undefined while loading (edit controls wait, so a viewer never sees them flash); null when
 * the role could not be read (controls show — the server still refuses a viewer's write).
 */
export function useBrandRole(brandId: string | null | undefined): BrandRole | null | undefined {
  const [role, setRole] = useState<BrandRole | null | undefined>(undefined);
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void loadRole(brandId).then((next) => {
      if (!cancelled) setRole(next);
    });
    return () => {
      cancelled = true;
    };
  }, [brandId]);
  return role;
}

export function canEditLibrary(role: BrandRole | null | undefined): boolean {
  return role !== undefined && role !== 'viewer';
}

export type CollectionRole = 'manager' | 'editor' | 'commenter' | 'viewer';

type LibraryScope = { collectionId?: string | null; assetId?: string | null };

/**
 * The brand role plus the caller's collection role on a scope (a collection, or the
 * collections holding an asset). A collection role is only ever set inside a restricted
 * collection, and there it decides editing on its own: a brand viewer who is an editor of
 * it may edit, an operator who is only its commenter may not. Owners and admins always may.
 * Presentation only, like useBrandRole: authorize_operation and RLS enforce the same rule.
 */
export function useLibraryAccess(
  brandId: string | null | undefined,
  scope: LibraryScope = {},
): {
  brandRole: BrandRole | null | undefined;
  collectionRole: CollectionRole | null;
  canEdit: boolean;
} {
  const brandRole = useBrandRole(brandId);
  const { collectionId, assetId } = scope;
  const [collectionRole, setCollectionRole] = useState<CollectionRole | null>(null);
  useEffect(() => {
    setCollectionRole(null);
    if (!collectionId && !assetId) return;
    let cancelled = false;
    const media = mediaSchema(createSupabaseBrowserClient());
    const request = collectionId
      ? media.rpc('collection_role', { p_collection: collectionId })
      : media.rpc('asset_collection_role', { p_asset: assetId });
    void Promise.resolve(request).then(({ data }) => {
      if (!cancelled) setCollectionRole((data as CollectionRole | null) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId, assetId]);

  const canEdit =
    brandRole === 'owner' ||
    brandRole === 'admin' ||
    (collectionRole !== null
      ? collectionRole === 'editor' || collectionRole === 'manager'
      : canEditLibrary(brandRole));
  return { brandRole, collectionRole, canEdit };
}
