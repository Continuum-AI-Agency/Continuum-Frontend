"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Copy, Check, ImageOff, Loader2 } from "lucide-react";
import type { MediaAsset } from "@continuum/contracts";
import { cn } from "@/lib/utils";
import { MediaBoundingBoxes } from "./MediaBoundingBoxes";

type Props = {
  asset: MediaAsset;
  onOpen: (asset: MediaAsset) => void;
  showBoundingBoxes?: boolean;
};

const BADGE_BASE =
  "absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]";

function StatusBadge({ status }: { status: MediaAsset["status"] }) {
  const reduceMotion = useReducedMotion();
  if (status === "ready") return null;

  const content =
    status === "analyzing" ? (
      <span className={cn(BADGE_BASE, "bg-black/60 text-white backdrop-blur-sm")}>
        <Loader2 className="size-2.5 animate-spin" />
        Analyzing
      </span>
    ) : status === "skipped_free" ? (
      <span className={cn(BADGE_BASE, "bg-amber-900/80 text-amber-200")}>Upgrade to analyze</span>
    ) : status === "error" ? (
      <span className={cn(BADGE_BASE, "bg-red-900/80 text-red-200")}>Error</span>
    ) : (
      <span className={cn(BADGE_BASE, "bg-black/60 text-white")}>{status}</span>
    );

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.25, filter: "blur(4px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}

function Thumbnail({ asset, showBoundingBoxes }: { asset: MediaAsset; showBoundingBoxes: boolean }) {
  const [imgError, setImgError] = useState(false);

  if (!asset.signedUrl || imgError) {
    return (
      <div className="flex size-full items-center justify-center bg-muted">
        <ImageOff className="size-8 text-muted-foreground/40" />
      </div>
    );
  }

  if (asset.kind === "video") {
    return (
      <video
        src={asset.signedUrl}
        className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        muted
        playsInline
        preload="metadata"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <>
      <img
        src={asset.signedUrl}
        alt={asset.title ?? asset.fileName}
        className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        onError={() => setImgError(true)}
        loading="lazy"
      />
      {showBoundingBoxes && asset.detectedObjects.length > 0 && (
        <MediaBoundingBoxes objects={asset.detectedObjects} />
      )}
    </>
  );
}

function CopyDescriptionButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      className="-m-2 ml-auto flex size-9 shrink-0 items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground"
      onClick={handleCopy}
      title="Copy description"
      type="button"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
    </button>
  );
}

export function MediaCard({ asset, onOpen, showBoundingBoxes = false }: Props) {
  const reduceMotion = useReducedMotion();
  const formattedDate = new Date(asset.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      className={cn(
        "group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border/50 bg-card",
        "shadow-sm transition-[box-shadow,border-color] hover:border-border",
        "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-12px_rgba(0,0,0,0.18)]",
      )}
      onClick={() => onOpen(asset)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(asset)}
      whileHover={reduceMotion ? undefined : { y: -2 }}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        <Thumbnail asset={asset} showBoundingBoxes={showBoundingBoxes} />
        <StatusBadge status={asset.status} />
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <p className="truncate text-sm font-medium leading-snug text-balance">
          {asset.title ?? asset.fileName}
        </p>

        {asset.description && (
          <div className="flex items-start gap-1">
            <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground text-pretty">
              {asset.description}
            </p>
            <CopyDescriptionButton text={asset.description} />
          </div>
        )}

        <p className="text-[11px] tabular-nums text-muted-foreground/60">{formattedDate}</p>
      </div>
    </motion.div>
  );
}
