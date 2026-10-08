'use client';

// Compare any two assets, whatever their types (Frame.io V4's comparison viewer):
// opened from a two-asset selection in the grid, or from "Compare with…" in the
// detail view. Each side can then be switched to any version of either asset.
// Loads both assets and their version lists itself, so a caller only needs ids.

import type { MediaAsset, MediaAssetVersion } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { listAssetVersions } from '@/lib/library/versions';
import { resolveStageMedia } from '../stageMedia';
import { CompareDialog, type CompareOption } from './CompareDialog';
import { versionCompareOption } from './VersionCompareDialog';

type Props = {
  brandId: string;
  /** The two assets to compare, A first. */
  assetIds: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Loaded = { options: CompareOption[]; initialAId: string; initialBId: string; title: string };

async function loadAsset(brandId: string, assetId: string): Promise<MediaAsset> {
  const query = new URLSearchParams({ brandId, assetId, limit: '1' });
  const response = await fetch(`/api/library/assets?${query.toString()}`);
  if (!response.ok) throw new Error(`Could not load an asset (${response.status})`);
  const body = (await response.json()) as { items?: MediaAsset[] };
  const asset = body.items?.find((item) => item.id === assetId);
  if (!asset) throw new Error('One of the assets is no longer in the library');
  return asset;
}

// An asset whose version history has not been materialized yet still compares:
// its head is staged from the asset itself.
function assetOptions(
  asset: MediaAsset,
  versions: MediaAssetVersion[],
): { options: CompareOption[]; head: CompareOption } {
  const name = asset.title ?? asset.fileName;
  if (versions.length === 0) {
    const head: CompareOption = {
      id: `asset:${asset.id}`,
      label: name,
      optionLabel: `${name} · current`,
      caption: `${name} · Current`,
      media: resolveStageMedia({ asset, viewedVersion: null }),
    };
    return { options: [head], head };
  }
  const options = versions.map((version) => versionCompareOption(asset, version, `${name} · `));
  const headIndex = Math.max(
    0,
    versions.findIndex((version) => version.isHead),
  );
  return { options, head: options[headIndex] };
}

async function loadComparison(brandId: string, assetIds: readonly string[]): Promise<Loaded> {
  const [firstId, secondId] = assetIds;
  if (!firstId || !secondId || firstId === secondId) {
    throw new Error('Select exactly two different assets to compare');
  }
  const sides = await Promise.all(
    [firstId, secondId].map(async (assetId) => {
      const [asset, versions] = await Promise.all([
        loadAsset(brandId, assetId),
        listAssetVersions({ brandId, assetId }),
      ]);
      return assetOptions(asset, versions);
    }),
  );
  const [a, b] = [sides[0].head, sides[1].head];
  return {
    options: [...sides[0].options, ...sides[1].options],
    initialAId: a.id,
    initialBId: b.id,
    title: `Compare ${a.label} and ${b.label}`,
  };
}

export function CompareAssetsDialog({ brandId, assetIds, open, onOpenChange }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = assetIds.join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the ids' identity
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded(null);
    setError(null);
    loadComparison(brandId, assetIds)
      .then((result) => {
        if (!cancelled) setLoaded(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the assets');
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, key, open]);

  if (loaded && open) {
    return (
      <CompareDialog
        key={key}
        open={open}
        onOpenChange={onOpenChange}
        options={loaded.options}
        initialAId={loaded.initialAId}
        initialBId={loaded.initialBId}
        title={loaded.title}
      />
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="compare-assets-loading" className="max-w-sm">
        <DialogTitle className="text-sm">Compare assets</DialogTitle>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading both assets…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
