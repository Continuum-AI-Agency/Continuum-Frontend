'use client';

import {
  Copy,
  Film,
  GalleryHorizontal,
  Image as ImageIcon,
  Play,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Node } from '@/components/ai-elements/node';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
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
import { useSignedAssetUrls } from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';
import { useCanvasJaina } from '../canvasJaina';
import { CampaignCreativeGenerateButton } from '../components/CampaignCreativeActions';
import { NodeProvenance } from '../components/NodeProvenance';
import { useCreativeAssetPlacement } from '../hooks/useCreativeAssetPlacement';
import { useCampaignStore } from '../stores/useCampaignStore';
import {
  CAROUSEL_MAX_CARDS,
  CAROUSEL_MIN_CARDS,
  type CampaignNodeProps,
  type CarouselCard,
  type CreativeAssetType,
  type CreativeData,
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

/**
 * The asset ids a creative names but holds no URL for.
 *
 * Signed URLs never persist: a pick or upload carries them only in this browser, and a
 * saved or reloaded version names its assets by id alone. Without a fresh signature
 * every creative went blank the moment it was saved.
 */
export function unsignedCreativeAssetIds(
  data: Pick<CreativeData, 'mediaId' | 'thumbnailUrl' | 'assetUrl' | 'cards'>,
): string[] {
  const ids = data.mediaId && !data.thumbnailUrl && !data.assetUrl ? [data.mediaId] : [];
  for (const card of data.cards ?? []) {
    if (card.mediaId && !card.thumbnailUrl) ids.push(card.mediaId);
  }
  return ids;
}

/** What a creative draws: its stored URLs, else a fresh signature of its asset. */
export function creativePreviewSources(
  data: Pick<CreativeData, 'assetType' | 'mediaId' | 'thumbnailUrl' | 'assetUrl'>,
  signed: Readonly<Record<string, string | undefined>>,
): { thumbnailUrl?: string; assetUrl?: string } {
  const fresh = data.mediaId ? signed[data.mediaId] : undefined;
  const assetType = data.assetType ?? DEFAULT_CREATIVE_ASSET_TYPE;
  return {
    // A video's signed URL is the film itself, never an <img> source.
    thumbnailUrl: data.thumbnailUrl ?? (assetType === 'image' ? fresh : undefined),
    assetUrl: data.assetUrl ?? fresh,
  };
}

/** The same signatures, shared by every creative on screen through the query cache. */
export function useSignedCreativeUrls(ids: readonly string[]) {
  const { activeBrandId } = useActiveBrandContext();
  return useSignedAssetUrls(activeBrandId || undefined, ids);
}

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

function CarouselStrip({
  cards,
  signed,
}: {
  cards: CarouselCard[];
  signed: Readonly<Record<string, string | undefined>>;
}) {
  const uiText = useTranslations('scale');

  if (cards.length === 0) {
    return (
      <AspectRatio ratio={2} className="w-full overflow-hidden">
        <MediaPlaceholder
          kind="carousel"
          label={uiText('template_9d19cf98ce63', {
            v0: CAROUSEL_MIN_CARDS,
            v1: CAROUSEL_MAX_CARDS,
          })}
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
          {card.thumbnailUrl || (card.kind === 'image' && signed[card.mediaId]) ? (
            <Image
              src={(card.thumbnailUrl || signed[card.mediaId]) as string}
              alt={card.headline ?? uiText('template_4b37917a2260', { v0: index + 1 })}
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
  const uiText = useTranslations('scale');
  const FORMAT_OPTIONS: Array<{
    value: CreativeAssetType;
    label: string;
    description: string;
  }> = useMemo(
    () => [
      {
        value: 'image',
        label: uiText('image_1aa4cb0'),
        description: uiText('one_still_image_its_ad_runs_as_a_single_image_f85f335'),
      },
      {
        value: 'video',
        label: uiText('video_d534be8'),
        description: uiText('one_video_its_ad_runs_as_a_single_video_ad_752fc30'),
      },
      {
        value: 'carousel',
        label: uiText('carousel_37219fb'),
        description: uiText('two_to_ten_swipeable_cards_each_with_its_own__957c6e5'),
      },
    ],
    [uiText],
  );

  const FORMAT_LABELS: Record<CreativeAssetType, string> = useMemo(
    () => ({
      image: uiText('image_1aa4cb0'),
      video: uiText('video_d534be8'),
      carousel: uiText('carousel_37219fb'),
    }),
    [uiText],
  );

  const { duplicateNode, removeNode, setCreativeFormat } = useCampaignStore();

  const { dropActive, dropHandlers, notice, uploads } = useCreativeAssetPlacement(id);
  const canvasJaina = useCanvasJaina();
  const isDirty = useCampaignStore((store) => store.isDirty);
  const uploading = uploads.some((upload) => upload.status !== 'done' && upload.status !== 'error');

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);

  const selectedAssetType = data.assetType ?? DEFAULT_CREATIVE_ASSET_TYPE;
  const cards = data.cards ?? [];
  const signed = useSignedCreativeUrls(unsignedCreativeAssetIds(data));
  const { thumbnailUrl, assetUrl } = creativePreviewSources(data, signed);
  const [previewRatio, setPreviewRatio] = useState(() =>
    resolveCreativePreviewRatio(data.aspectRatio, selectedAssetType),
  );

  useEffect(() => {
    setPreviewRatio(resolveCreativePreviewRatio(data.aspectRatio, selectedAssetType));
  }, [data.aspectRatio, selectedAssetType, thumbnailUrl]);

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
      ? uiText('canvasCarouselCardCount', { count: cards.length })
      : FORMAT_LABELS[selectedAssetType];

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Node
            handles={{ target: true, source: false }}
            selected={selected}
            data-testid="canvas-creative-node"
            {...dropHandlers}
            className={cn(
              'overflow-hidden border-border/60 p-0 transition-shadow hover:shadow-sm cursor-grab active:cursor-grabbing',
              dropActive && 'ring-2 ring-primary ring-offset-2',
            )}
          >
            {selectedAssetType === 'carousel' ? (
              <CarouselStrip cards={cards} signed={signed} />
            ) : (
              <AspectRatio
                ratio={previewRatio}
                className="relative w-full overflow-hidden bg-muted"
              >
                {thumbnailUrl ? (
                  <Image
                    src={thumbnailUrl}
                    alt={uiText('creative_preview_92e4353')}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 240px"
                    className="h-full w-full object-cover"
                    draggable={false}
                    onDragStart={handlePreviewDragStart}
                    onLoadingComplete={handlePreviewLoad}
                  />
                ) : selectedAssetType === 'video' && assetUrl ? (
                  // No poster was stored: the first decoded frame IS the poster.
                  <video
                    src={assetUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <MediaPlaceholder kind={selectedAssetType} />
                )}
                {dropActive || uploading ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium text-foreground">
                    {uploading ? uiText('uploading_5ce44dd') : uiText('drop_to_use_5369c9c')}
                  </span>
                ) : null}
                {selectedAssetType === 'video' && (thumbnailUrl || assetUrl) ? (
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
            {notice ? (
              <p className="px-3 pb-2 text-2xs leading-snug text-destructive" role="alert">
                {notice}
              </p>
            ) : null}
            <CampaignCreativeGenerateButton nodeId={id} />
            {data.provenance ? (
              <div className="px-3 pb-2">
                <NodeProvenance data={data} />
              </div>
            ) : null}
          </Node>
        }
      />
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>{uiText('creative_actions_efaf7b7')}</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              {uiText.rich('sentence_a2daeb409083', {
                v0: () => <ImageIcon className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    className="ml-2 mr-4"
                    description={uiText('the_creative_s_format_sets_its_ad_s_format_im_a3d734e')}
                  />
                ),
              })}
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

        {canvasJaina ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={isDirty} onClick={() => canvasJaina.generateForCreative(id)}>
              {uiText.rich('sentence_408cf6c19c78', {
                v0: () => <Sparkles className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    className="ml-2"
                    description={
                      isDirty
                        ? uiText('save_first_jaina_fills_the_saved_version_ff4e5ad')
                        : uiText('jaina_makes_this_creative_from_its_ad_s_copy__dbd3438')
                    }
                  />
                ),
              })}
            </ContextMenuItem>
          </>
        ) : null}

        <ContextMenuSeparator />

        <ContextMenuGroup>
          <ContextMenuItem onClick={handleDuplicate}>
            {uiText.rich('sentence_cbb73dcd8c7a', {
              v0: () => <Copy className="mr-2 h-4 w-4" />,
              v1: () => <ContextMenuShortcut>⌘D</ContextMenuShortcut>,
              v2: () => (
                <ContextMenuItemInfo
                  className="ml-2"
                  description={uiText('a_duplicate_keeps_the_same_creative_settings__92fc2dd')}
                />
              ),
            })}
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          {uiText.rich('sentence_cab0f08ddea5', {
            v0: () => <Trash2 className="mr-2 h-4 w-4" />,
            v1: () => <ContextMenuShortcut>⌫</ContextMenuShortcut>,
            v2: () => (
              <ContextMenuItemInfo
                className="ml-2"
                description={uiText('delete_removes_this_creative_object_from_the__3195fda')}
              />
            ),
          })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

CreativeNode.displayName = 'CreativeNode';
