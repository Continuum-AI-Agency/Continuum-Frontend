"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { Loader2 } from "lucide-react";
import type { MediaAsset } from "@continuum/contracts";
import { stagger } from "@/components/ui/Motion";
import { MediaCard } from "./MediaCard";
import { cn } from "@/lib/utils";

type Props = {
  assets: MediaAsset[];
  showBoundingBoxes?: boolean;
  emptyHint?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  className?: string;
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

const GRID_CLASS = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

export function MediaGrid({
  assets,
  showBoundingBoxes = false,
  emptyHint,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  className,
}: Props) {
  const reduceMotion = useReducedMotion();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) onLoadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore, assets.length]);

  if (assets.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">{emptyHint ?? "No media yet."}</p>
        {!emptyHint && (
          <p className="text-xs text-muted-foreground/60">Upload images or videos to get started.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {reduceMotion ? (
        <div className={cn(GRID_CLASS, className)}>
          {assets.map((asset) => (
            <MediaCard key={asset.id} asset={asset} showBoundingBoxes={showBoundingBoxes} />
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
            {assets.map((asset) => (
              <motion.div key={asset.id} layout variants={cardVariants} exit="exit">
                <MediaCard asset={asset} showBoundingBoxes={showBoundingBoxes} />
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
