'use client';

import type { MediaAsset } from '@continuum/contracts';
import { ImagePlus, Loader2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { useEffect, useRef } from 'react';
import { stagger } from '@/components/ui/Motion';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import { cn } from '@/lib/utils';
import { MediaCard } from './MediaCard';

type Props = {
  assets: MediaAsset[];
  showBoundingBoxes?: boolean;
  captionStyle?: CaptionStyle;
  emptyHint?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  className?: string;
  onOpenDetail?: (asset: MediaAsset) => void;
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

const GRID_CLASS =
  'grid grid-cols-2 gap-[var(--app-shell-gap)] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

export function MediaGrid({
  assets,
  showBoundingBoxes = false,
  captionStyle,
  emptyHint,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  className,
  onOpenDetail,
}: Props) {
  const reduceMotion = useReducedMotion();
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex flex-col gap-4">
      {reduceMotion ? (
        <div className={cn(GRID_CLASS, className)}>
          {assets.map((asset, i) => (
            <MediaCard
              key={asset.id}
              asset={asset}
              index={i}
              showBoundingBoxes={showBoundingBoxes}
              captionStyle={captionStyle}
              onOpen={onOpenDetail}
            />
          ))}
        </div>
      ) : (
        <motion.div
          className={cn(GRID_CLASS, className)}
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {assets.map((asset, i) => (
              <motion.div key={asset.id} layout variants={cardVariants} exit="exit">
                <MediaCard
                  asset={asset}
                  index={i}
                  showBoundingBoxes={showBoundingBoxes}
                  captionStyle={captionStyle}
                  onOpen={onOpenDetail}
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
