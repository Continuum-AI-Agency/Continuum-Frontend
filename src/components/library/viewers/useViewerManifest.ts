'use client';

// Asks the Backend what a viewer needs for the file on stage. The credential is the
// original's signed URL, which both surfaces already hold (the detail view can re-mint one
// through /api/library/sign when a long-open card's has gone stale; a share page cannot,
// and on a protected link it has none — the viewer then shows the host's fallback).

import {
  LIBRARY_VIEWER_PATH,
  type LibraryViewerManifest,
  libraryViewerManifestSchema,
  type MediaAsset,
  type MediaAssetVersion,
} from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { http } from '@/lib/api/http';

export type ViewerManifestState =
  | { status: 'loading' }
  | { status: 'ready'; manifest: LibraryViewerManifest }
  | { status: 'unavailable'; reason: string };

type AssetRef = { brandId: string; assetId: string };

async function mintSourceUrl(asset: AssetRef, versionId: string | undefined): Promise<string> {
  const response = await fetch('/api/library/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brandId: asset.brandId,
      assetId: asset.assetId,
      ...(versionId ? { versionId } : {}),
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { signedUrl?: string };
  if (!response.ok || !body.signedUrl) throw new Error(`sign failed (${response.status})`);
  return body.signedUrl;
}

function fetchManifest(sourceUrl: string): Promise<LibraryViewerManifest> {
  return http.request({
    path: LIBRARY_VIEWER_PATH,
    method: 'POST',
    body: { sourceUrl },
    schema: libraryViewerManifestSchema,
  });
}

export function useViewerManifest(params: {
  asset: MediaAsset;
  version: MediaAssetVersion | null;
  surface: 'detail' | 'share';
}): ViewerManifestState & { reload: () => void } {
  const { asset, version, surface } = params;
  const [state, setState] = useState<ViewerManifestState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Read through a ref: every list refresh re-signs the same bytes under a new URL, and that
  // must not reload a model or a bundle that is already on screen.
  const heldUrl = useRef<string | null>(null);
  heldUrl.current = version?.signedUrl ?? asset.signedUrl ?? null;
  const versionId = version?.id;
  const { brandId, id: assetId } = asset;
  const bytesKey = versionId ?? asset.headVersionId ?? assetId;

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const ref = { brandId, assetId };
    const held = heldUrl.current;
    const load = async (): Promise<LibraryViewerManifest> => {
      const canMint = surface === 'detail';
      if (!held && !canMint) throw new Error('no_source_url');
      // A reload re-mints: the held URL may be the one that expired.
      const sourceUrl =
        held && (attempt === 0 || !canMint) ? held : await mintSourceUrl(ref, versionId);
      try {
        return await fetchManifest(sourceUrl);
      } catch (cause) {
        if (!canMint || sourceUrl !== held) throw cause;
        return fetchManifest(await mintSourceUrl(ref, versionId));
      }
    };
    load().then(
      (manifest) => {
        if (!cancelled) setState({ status: 'ready', manifest });
      },
      (cause: unknown) => {
        console.warn('[FamilyViewer] manifest unavailable', cause);
        if (!cancelled) {
          setState({
            status: 'unavailable',
            reason: cause instanceof Error ? cause.message : 'viewer_unavailable',
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // bytesKey stands for the version whose bytes these are.
  }, [brandId, assetId, versionId, bytesKey, surface, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, reload };
}
