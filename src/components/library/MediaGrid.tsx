'use client';

import type { CustomField, LibraryPreviewFrame, MediaAsset } from '@continuum/contracts';
import { ImagePlus, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { type DragEvent, useEffect, useRef } from 'react';
import { stagger } from '@/components/ui/Motion';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import { formatCustomFieldValue } from '@/lib/library/customFieldValue';
import { cn } from '@/lib/utils';
import { type CardFieldValue, MediaCard } from './MediaCard';
import { assetIdsToDrag, writeAssetDrag } from './views/assetDrag';
import { useMentionTargets } from './detail/useMentionTargets';
import {
  BUILT_IN_CARD_FIELDS,
  CARD_DRAWN_FIELDS,
  type CardViewOptions,
  cardFieldValue,
  cardGridTemplate,
  isBuiltInCardField,
  memberNameLookup,
  visibleCardFields,
} from './views/cardOptions';
import { type FieldValuesByAsset, useAssetCommentCounts } from './views/useAssetFieldValues';

type Props = {
  brandId: string;
  assets: MediaAsset[];
  showBoundingBoxes?: boolean;
  captionStyle?: CaptionStyle;
  emptyHint?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  className?: string;
  onOpenDetail?: (asset: MediaAsset) => void;
  onAssetChanged?: () => void;
  selectedAssetIds?: ReadonlySet<string>;
  onToggleSelected?: (asset: MediaAsset) => void;
  previewFrame?: LibraryPreviewFrame;
  card?: CardViewOptions;
  /** The custom fields the user chose to show on cards, in order. */
  cardFields?: CustomField[];
  fieldValues?: FieldValuesByAsset;
  /** Cards become draggable and accept other cards, stacking them as new versions. */
  onStackDrop?: (target: MediaAsset, sourceAssetIds: string[]) => void;
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

const GRID_CLASS =
  'grid grid-cols-2 gap-[var(--app-shell-gap)] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

const FRAME_GRID_CLASS: Record<Exclude<LibraryPreviewFrame, 'native'>, string> = {
  story: 'grid grid-cols-3 gap-[var(--app-shell-gap)] sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8',
  feed: 'grid grid-cols-2 gap-[var(--app-shell-gap)] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  square:
    'grid grid-cols-2 gap-[var(--app-shell-gap)] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  landscape:
    'grid grid-cols-1 gap-[var(--app-shell-gap)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
};

export function MediaGrid({
  brandId,
  assets,
  showBoundingBoxes = false,
  captionStyle,
  emptyHint,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  className,
  onOpenDetail,
  onAssetChanged,
  selectedAssetIds,
  onToggleSelected,
  previewFrame = 'native',
  card,
  cardFields = [],
  fieldValues,
  onStackDrop,
}: Props) {
  const reduceMotion = useReducedMotion();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // MediaCard draws its own few facts; every other chosen built-in field joins the custom
  // fields as a label row, in the order the user picked them.
  const builtInRows = visibleCardFields(card).filter(
    (key) => isBuiltInCardField(key) && !CARD_DRAWN_FIELDS.has(key),
  );
  const commentCount = useAssetCommentCounts(
    assets.map((asset) => asset.id),
    builtInRows.includes('comments'),
  );
  const needsMembers =
    builtInRows.includes('uploader') ||
    cardFields.some((field) => field.type === 'user' || field.type === 'user_multi');
  const members = useMentionTargets(needsMembers ? brandId : null);
  const memberName = memberNameLookup(members);
  const customFieldValuesOf = (asset: MediaAsset): CardFieldValue[] => [
    ...builtInRows.map((key) => ({
      key,
      label: BUILT_IN_CARD_FIELDS.find((field) => field.key === key)?.label ?? key,
      value: cardFieldValue(asset, key, { commentCount, memberName }) ?? '',
    })),
    ...cardFields.map((field) => {
      const value = fieldValues?.get(asset.id)?.get(field.id);
      return {
        key: field.id,
        label: field.name,
        value: value === undefined ? '' : formatCustomFieldValue(field, value, memberName),
      };
    }),
  ];
  const onDragAssetStart = onStackDrop
    ? (event: DragEvent<HTMLElement>, asset: MediaAsset) =>
        writeAssetDrag(
          event,
          brandId,
          assetIdsToDrag(asset.id, selectedAssetIds ?? new Set<string>()),
        )
    : undefined;

  // assets.length is intentional: re-arm the IntersectionObserver after each loaded
  // page so the sentinel keeps firing as the grid grows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: assets.length re-arms the observer per page
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) onLoadMore();
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore, assets.length]);

  if (assets.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 text-muted-foreground">
        <ImagePlus className="size-8 text-muted-foreground/30" />
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-sm">{emptyHint ?? 'No media yet.'}</p>
          {!emptyHint && (
            <p className="text-xs text-muted-foreground/60">
              Upload images or videos, or drop files anywhere on the page.
            </p>
          )}
        </div>
      </div>
    );
  }

  const gridClass = previewFrame === 'native' ? GRID_CLASS : FRAME_GRID_CLASS[previewFrame];
  // A chosen card size replaces the breakpoint column counts with a min card width.
  const gridTemplate = cardGridTemplate(card?.size);
  const gridStyle = gridTemplate ? { gridTemplateColumns: gridTemplate } : undefined;

  return (
    <div className="flex flex-col gap-4">
      {reduceMotion ? (
        <div className={cn(gridClass, className)} style={gridStyle}>
          {assets.map((asset, i) => (
            <MediaCard
              key={asset.id}
              brandId={brandId}
              asset={asset}
              index={i}
              showBoundingBoxes={showBoundingBoxes}
              captionStyle={captionStyle}
              onOpen={onOpenDetail}
              onAssetChanged={onAssetChanged}
              selected={selectedAssetIds?.has(asset.id)}
              onToggleSelected={onToggleSelected}
              previewFrame={previewFrame}
              card={card}
              customFieldValues={customFieldValuesOf(asset)}
              onDragAssetStart={onDragAssetStart}
              onStackDrop={onStackDrop}
            />
          ))}
        </div>
      ) : (
        <motion.div
          className={cn(gridClass, className)}
          style={gridStyle}
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {assets.map((asset, i) => (
              <motion.div key={asset.id} layout variants={cardVariants} exit="exit">
                <MediaCard
                  brandId={brandId}
                  asset={asset}
                  index={i}
                  showBoundingBoxes={showBoundingBoxes}
                  captionStyle={captionStyle}
                  onOpen={onOpenDetail}
                  onAssetChanged={onAssetChanged}
                  selected={selectedAssetIds?.has(asset.id)}
                  onToggleSelected={onToggleSelected}
                  previewFrame={previewFrame}
                  card={card}
                  customFieldValues={customFieldValuesOf(asset)}
                  onDragAssetStart={onDragAssetStart}
                  onStackDrop={onStackDrop}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {onLoadMore && hasMore && (
        <div ref={sentinelRef} className="flex h-12 items-center justify-center">
          {loadingMore && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}
