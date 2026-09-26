'use client';
import { Copy, Film, GalleryHorizontal, Image as ImageIcon, Play, Trash2 } from 'lucide-react';
import Image from 'next/image';
import type React from 'react';
import { memo, useCallback, useEffect, useState } from 'react';
import { Node } from '@/components/ai-elements/node';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';
import { NodeProvenance } from '../components/NodeProvenance';
import { useCampaignStore } from '../stores/useCampaignStore';
import {
  CAROUSEL_MAX_CARDS,
  CAROUSEL_MIN_CARDS,
  type CampaignNodeProps,
  type CarouselCard,
  type CreativeAssetType,
} from '../types';
import { DEFAULT_CREATIVE_ASSET_TYPE } from '../types/adCreativeCompatibility';

const FALLBACK_PREVIEW_RATIO_BY_TYPE: Record<CreativeAssetType, number> = {
  image: 1,
  video: 16 / 9,
  carousel: 1,
};

export function resolveCreativePreviewRatio(
  ratioValue: string | undefined,
  assetType: CreativeAssetType,
): number {
  if (!ratioValue) {
    return FALLBACK_PREVIEW_RATIO_BY_TYPE[assetType];
  }

  const normalized = ratioValue.trim();
  const delimiter = normalized.includes(':') ? ':' : normalized.includes('/') ? '/' : null;

  if (!delimiter) {
    return FALLBACK_PREVIEW_RATIO_BY_TYPE[assetType];
  }

  const [widthPart, heightPart] = normalized.split(delimiter).map((value) => Number(value.trim()));
  if (
    !Number.isFinite(widthPart) ||
    !Number.isFinite(heightPart) ||
    widthPart <= 0 ||
    heightPart <= 0
  ) {
    return FALLBACK_PREVIEW_RATIO_BY_TYPE[assetType];
  }

  return widthPart / heightPart;
}

const FORMAT_OPTIONS: Array<{ value: CreativeAssetType; label: string; description: string }> = [
  {
    value: 'image',
    label: 'Image',
    description: 'One still image. Its ad runs as a single-image ad.',
  },
  {
    value: 'video',
    label: 'Video',
    description: 'One video. Its ad runs as a single-video ad.',
  },
  {
    value: 'carousel',
    label: 'Carousel',
    description: 'Two to ten swipeable cards, each with its own headline and link.',
  },
];

const FORMAT_LABELS: Record<CreativeAssetType, string> = {
  image: 'Image',
  video: 'Video',
  carousel: 'Carousel',
};

/** How many card tiles the node draws before folding the rest into "+N". */
const CAROUSEL_STRIP_TILES = 3;

function MediaPlaceholder({ kind, label }: { kind: CreativeAssetType; label?: string }) {
  const Icon = kind === 'video' ? Film : kind === 'carousel' ? GalleryHorizontal : ImageIcon;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground">
      <Icon className="h-7 w-7 opacity-30" aria-hidden />
      {label ? <span className="text-2xs">{label}</span> : null}
    </div>
  );
}

function CarouselStrip({ cards }: { cards: CarouselCard[] }) {
  if (cards.length === 0) {
    return (
      <AspectRatio ratio={2} className="w-full overflow-hidden">
        <MediaPlaceholder
          kind="carousel"
          label={`Add ${CAROUSEL_MIN_CARDS}–${CAROUSEL_MAX_CARDS} cards`}
        />
      </AspectRatio>
    );
  }
  const shown = cards.slice(0, CAROUSEL_STRIP_TILES);
  const hidden = cards.length - shown.length;
  return (
    <div className="flex gap-1.5 bg-muted/60 p-1.5" data-testid="canvas-creative-carousel-strip">
      {shown.map((card, index) => (
        <div
          key={`${card.mediaId}:${index}`}
          className="relative aspect-square flex-1 overflow-hidden rounded-sm bg-muted"
        >
          {card.thumbnailUrl ? (
            <Image
              src={card.thumbnailUrl}
              alt={card.headline ?? `Card ${index + 1}`}
              fill
              unoptimized
              sizes="128px"
              className="object-cover"
              draggable={false}
            />
          ) : (
            <MediaPlaceholder kind={card.kind} />
          )}
          {index === shown.length - 1 && hidden > 0 ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white tabular-nums">
              +{hidden}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export const CreativeNode = memo(({ id, data, selected }: CampaignNodeProps<'creative'>) => {
  const { duplicateNode, removeNode, setCreativeFormat } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);

  const selectedAssetType = data.assetType ?? DEFAULT_CREATIVE_ASSET_TYPE;
  const cards = data.cards ?? [];
  const [previewRatio, setPreviewRatio] = useState(() =>
    resolveCreativePreviewRatio(data.aspectRatio, selectedAssetType),
  );

  useEffect(() => {
    setPreviewRatio(resolveCreativePreviewRatio(data.aspectRatio, selectedAssetType));
  }, [data.aspectRatio, selectedAssetType, data.thumbnailUrl]);

  const handlePreviewLoad = useCallback((image: HTMLImageElement) => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      setPreviewRatio(image.naturalWidth / image.naturalHeight);
    }
  }, []);

  const handlePreviewDragStart = useCallback((event: React.DragEvent<HTMLImageElement>) => {
    event.preventDefault();
  }, []);

  const caption =
    selectedAssetType === 'carousel'
      ? `${FORMAT_LABELS.carousel} · ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`
      : FORMAT_LABELS[selectedAssetType];

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Node
            handles={{ target: true, source: false }}
            selected={selected}
            className="overflow-hidden border-border/60 p-0 transition-shadow hover:shadow-sm cursor-grab active:cursor-grabbing"
          >
            {selectedAssetType === 'carousel' ? (
              <CarouselStrip cards={cards} />
            ) : (
              <AspectRatio ratio={previewRatio} className="relative w-full overflow-hidden bg-muted">
                {data.thumbnailUrl ? (
                  <Image
                    src={data.thumbnailUrl}
                    alt="Creative Preview"
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 240px"
                    className="h-full w-full object-cover"
                    draggable={false}
                    onDragStart={handlePreviewDragStart}
                    onLoadingComplete={handlePreviewLoad}
                  />
                ) : selectedAssetType === 'video' && data.assetUrl ? (
                  // No poster was stored: the first decoded frame IS the poster.
                  <video
                    src={data.assetUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <MediaPlaceholder kind={selectedAssetType} />
                )}
                {selectedAssetType === 'video' && (data.thumbnailUrl || data.assetUrl) ? (
                  <span className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
                    <Play className="h-3 w-3 fill-current" aria-hidden />
                  </span>
                ) : null}
              </AspectRatio>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
              <span className="truncate text-xs font-medium text-foreground">{data.label}</span>
              <Badge
                variant="outline"
                className="h-5 shrink-0 px-1.5 text-3xs font-medium"
                data-testid="canvas-creative-format"
              >
                {caption}
              </Badge>
            </div>
            {data.provenance ? (
              <div className="px-3 pb-2">
                <NodeProvenance data={data} />
              </div>
            ) : null}
          </Node>
        }
      />
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>Creative Actions</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ImageIcon className="mr-2 h-4 w-4" />
              Format
              <ContextMenuItemInfo
                className="ml-2 mr-4"
                description="The creative's format sets its ad's format: image, video or carousel."
              />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {FORMAT_OPTIONS.map((format) => (
                <ContextMenuCheckboxItem
                  key={format.value}
                  checked={selectedAssetType === format.value}
                  onClick={() => setCreativeFormat(id, format.value)}
                >
                  {format.label}
                  <ContextMenuItemInfo description={format.description} />
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>

        <ContextMenuSeparator />

        <ContextMenuGroup>
          <ContextMenuItem onClick={handleDuplicate}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
            <ContextMenuItemInfo
              className="ml-2"
              description="A duplicate keeps the same creative settings as a starting variant."
            />
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
          <ContextMenuItemInfo
            className="ml-2"
            description="Delete removes this creative object from the current graph."
          />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

CreativeNode.displayName = 'CreativeNode';
