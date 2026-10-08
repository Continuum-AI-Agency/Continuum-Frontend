// The Library's view of every asset the open room holds: one brand-scoped read
// (media.canvas_library_context, the caller's own RLS) shared by all nodes, so a room of
// fifty Library nodes costs one round trip, not fifty.

import {
  CANVAS_LIBRARY_CONTEXT_MAX_IDS,
  type CanvasLibraryAssetContext,
  type CanvasLibraryContext,
  type CanvasLibraryVersionContext,
  type RecordCanvasLineageRequest,
  recordCanvasLineageRequestSchema,
} from '@continuum/contracts';
import { create } from 'zustand';
import { readCanvasLibraryContext } from '@/lib/creative-assets/canvasLibrarySource';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type MediaRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

// The generated client types predate record_canvas_lineage; the contract schema is the
// real boundary check on its arguments.
const mediaRpc = (): MediaRpcClient =>
  createSupabaseBrowserClient().schema('media') as unknown as MediaRpcClient;

export async function fetchCanvasLibraryContext(
  brandId: string,
  assetIds: readonly string[],
  versionIds: readonly string[],
): Promise<CanvasLibraryContext> {
  const merged: CanvasLibraryContext = { assets: [], versions: [] };
  const assets = [...new Set(assetIds)];
  const versions = [...new Set(versionIds)];
  const step = CANVAS_LIBRARY_CONTEXT_MAX_IDS;
  const client = createSupabaseBrowserClient();
  for (let offset = 0; offset < Math.max(assets.length, versions.length); offset += step) {
    const page = await readCanvasLibraryContext(client, {
      brandId,
      assetIds: assets.slice(offset, offset + step),
      versionIds: versions.slice(offset, offset + step),
    });
    merged.assets.push(...page.assets);
    merged.versions.push(...page.versions);
  }
  return merged;
}

export async function recordCanvasLineage(request: RecordCanvasLineageRequest): Promise<number> {
  const args = recordCanvasLineageRequestSchema.parse(request);
  const { data, error } = await mediaRpc().rpc('record_canvas_lineage', args);
  if (error) {
    throw Object.assign(new Error(error.message), { code: error.code ?? null });
  }
  return typeof data === 'number' ? data : 0;
}

type LibraryContextState = {
  brandId: string | null;
  assets: Record<string, CanvasLibraryAssetContext>;
  versions: Record<string, CanvasLibraryVersionContext>;
  error: string | null;
  apply: (brandId: string, context: CanvasLibraryContext) => void;
  fail: (message: string) => void;
  reset: (brandId: string | null) => void;
};

export const useLibraryContextStore = create<LibraryContextState>((set) => ({
  brandId: null,
  assets: {},
  versions: {},
  error: null,
  apply: (brandId, context) =>
    set((state) => ({
      brandId,
      error: null,
      // Merge, never replace: a node added mid-fetch keeps what it already had.
      assets: {
        ...(state.brandId === brandId ? state.assets : {}),
        ...Object.fromEntries(context.assets.map((asset) => [asset.id, asset])),
      },
      versions: {
        ...(state.brandId === brandId ? state.versions : {}),
        ...Object.fromEntries(context.versions.map((version) => [version.id, version])),
      },
    })),
  fail: (message) => set({ error: message }),
  reset: (brandId) => set({ brandId, assets: {}, versions: {}, error: null }),
}));
