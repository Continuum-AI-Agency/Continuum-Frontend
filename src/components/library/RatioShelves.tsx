'use client';

import {
  LIBRARY_ASPECT_RATIO_BINS,
  LIBRARY_ASPECT_RATIO_LABEL,
  type LibraryAspectRatioBin,
  libraryAspectRatioBin,
  type MediaAsset,
} from '@continuum/contracts';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import { MediaGrid } from './MediaGrid';

function shelfFor(asset: MediaAsset): LibraryAspectRatioBin {
  return asset.aspectRatio ?? libraryAspectRatioBin(asset.width, asset.height) ?? 'other';
}

export function groupAssetsByRatio(
  assets: readonly MediaAsset[],
): { bin: LibraryAspectRatioBin; assets: MediaAsset[] }[] {
  return LIBRARY_ASPECT_RATIO_BINS.map((bin) => ({
    bin,
    assets: assets.filter((asset) => shelfFor(asset) === bin),
  })).filter((group) => group.assets.length > 0);
}

type Props = {
  brandId: string;
  assets: MediaAsset[];
  showBoundingBoxes?: boolean;
  captionStyle?: CaptionStyle;
  emptyHint?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onOpenDetail?: (asset: MediaAsset) => void;
  onAssetChanged?: () => void;
  selectedAssetIds?: ReadonlySet<string>;
  onToggleSelected?: (asset: MediaAsset) => void;
  onSelectBin?: (bin: LibraryAspectRatioBin) => void;
};

export function RatioShelves({ onSelectBin, ...gridProps }: Props) {
  const grouped = groupAssetsByRatio(gridProps.assets);

  if (grouped.length === 0) {
    return <MediaGrid {...gridProps} />;
  }

  return (
    <div className="flex flex-col gap-8">
      {grouped.map((group, index) => (
        <section key={group.bin} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {onSelectBin ? (
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => onSelectBin(group.bin)}
              >
                {LIBRARY_ASPECT_RATIO_LABEL[group.bin]}
              </button>
            ) : (
              LIBRARY_ASPECT_RATIO_LABEL[group.bin]
            )}
            <span className="ml-2 text-xs font-normal tabular-nums">{group.assets.length}</span>
          </h2>
          <MediaGrid
            {...gridProps}
            previewFrame="native"
            assets={group.assets}
            emptyHint={undefined}
            onLoadMore={index === grouped.length - 1 ? gridProps.onLoadMore : undefined}
            hasMore={index === grouped.length - 1 ? gridProps.hasMore : false}
            loadingMore={index === grouped.length - 1 ? gridProps.loadingMore : false}
          />
        </section>
      ))}
    </div>
  );
}
