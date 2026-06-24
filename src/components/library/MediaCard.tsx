"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Copy, Check, ImageOff, Loader2, Play, Scissors } from "lucide-react";
import Image from "next/image";
import type { MediaAsset } from "@continuum/contracts";
import type { CaptionStyle } from "@/lib/clips/clipCaptionStyle";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { SOURCE_LABEL } from "@/lib/media/filters";
import { MediaBoundingBoxes } from "./MediaBoundingBoxes";
import { useGenerateClips } from "./hooks/useGenerateClips";
import { useClipQualityPreference } from "./hooks/useClipQualityPreference";
import { useClipCaptionPreference } from "./hooks/useClipCaptionPreference";
import { ClipProgressStrip } from "./ClipProgressStrip";
import { ClipQualityToggle } from "./ClipQualityToggle";
import { ClipCaptionToggle } from "./ClipCaptionToggle";

type Props = {
  asset: MediaAsset;
  index?: number;
  showBoundingBoxes?: boolean;
  captionStyle?: CaptionStyle;
};

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const BADGE_BASE =
  "absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]";

// Matches MediaGrid column breakpoints: 2-col mobile → 3-col sm → 4-col lg → 5-col xl
const IMAGE_SIZES =
  "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw";

// Defers assigning src to the video element until the card is near the viewport,
// preventing preload="metadata" range requests for every off-screen video card.
function useLazyVideoSrc(src: string | null | undefined, immediate: boolean) {
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(immediate);
  useEffect(() => {
    if (active || !ref.current) return;
    const ob = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setActive(true);
      },
      { rootMargin: "200px" },
    );
    ob.observe(ref.current);
    return () => ob.disconnect();
  }, [active]);
  return { ref, activeSrc: active && src ? src : undefined };
}

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

function Thumbnail({
  asset,
  showBoundingBoxes,
  priority,
}: {
  asset: MediaAsset;
  showBoundingBoxes: boolean;
  priority: boolean;
}) {
  const [mediaError, setMediaError] = useState(false);
  const { ref: videoRef, activeSrc } = useLazyVideoSrc(asset.signedUrl, priority);

  if (!asset.signedUrl || mediaError) {
    return (
      <div className="flex size-full items-center justify-center bg-muted">
        <ImageOff className="size-8 text-muted-foreground/40" />
      </div>
    );
  }

  if (asset.kind === "video") {
    return (
      <>
        <video
          ref={videoRef}
          src={activeSrc}
          className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          muted
          playsInline
          preload="metadata"
          onError={() => setMediaError(true)}
          onPointerEnter={() => {
            if (activeSrc) videoRef.current?.play();
          }}
          onPointerLeave={() => videoRef.current?.pause()}
        />
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/50 p-1.5 text-white transition-opacity group-hover:opacity-0">
          <Play className="size-3 fill-current" />
        </div>
      </>
    );
  }

  return (
    <>
      <Image
        src={asset.signedUrl}
        alt={asset.title ?? asset.fileName}
        fill
        sizes={IMAGE_SIZES}
        priority={priority}
        className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        onError={() => setMediaError(true)}
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

// Detail surfaces on hover (in context), not in a takeover modal. Data-only:
// no per-asset actions live here.
function MediaCardHoverDetail({ asset, formattedDate }: { asset: MediaAsset; formattedDate: string }) {
  const dimensions = asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;
  const tags = asset.tags ?? [];
  const objects = asset.detectedObjects ?? [];

  return (
    <HoverCardContent side="right" align="start" className="w-80">
      <div className="flex flex-col gap-2.5">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          {asset.signedUrl && asset.kind === "image" ? (
            <Image
              src={asset.signedUrl}
              alt={asset.title ?? asset.fileName}
              fill
              sizes="320px"
              className="object-contain"
            />
          ) : asset.signedUrl && asset.kind === "video" ? (
            <video src={asset.signedUrl} muted playsInline preload="metadata" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-6" />
            </div>
          )}
        </div>

        <p className="text-sm font-medium leading-snug">{asset.title ?? asset.fileName}</p>

        {asset.description ? (
          <p className="line-clamp-4 text-xs text-muted-foreground">{asset.description}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {SOURCE_LABEL[asset.source]}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {asset.kind}
          </span>
          {dimensions ? (
            <span className="text-[10px] tabular-nums text-muted-foreground/80">{dimensions}</span>
          ) : null}
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 8).map((tag) => (
              <span key={tag} className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {objects.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {objects.slice(0, 6).map((obj, i) => (
              <span
                key={`${obj.label}-${i}`}
                className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {obj.label}
                {typeof obj.confidence === "number" ? ` ${Math.round(obj.confidence * 100)}%` : ""}
              </span>
            ))}
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <div>
            <dt className="inline text-muted-foreground/60">Size </dt>
            <dd className="inline tabular-nums">{formatBytes(asset.sizeBytes ?? 0)}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground/60">Status </dt>
            <dd className="inline">{asset.status}</dd>
          </div>
          <div className="col-span-2">
            <dt className="inline text-muted-foreground/60">Added </dt>
            <dd className="inline">{formattedDate}</dd>
          </div>
        </dl>
      </div>
    </HoverCardContent>
  );
}

function GenerateClipsButton({ onGenerate, disabled }: { onGenerate: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onGenerate();
      }}
      disabled={disabled}
      className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-foreground disabled:opacity-50"
      title="Generate clips from this video"
    >
      <Scissors className="size-3" />
      Clips
    </button>
  );
}

export function MediaCard({ asset, index, showBoundingBoxes = false, captionStyle }: Props) {
  const reduceMotion = useReducedMotion();
  const { generate, isGenerating, progress } = useGenerateClips();
  const { quality, setQuality } = useClipQualityPreference();
  const { captionsEnabled, setCaptionsEnabled } = useClipCaptionPreference();
  const priority = (index ?? Infinity) < 10;
  const formattedDate = new Date(asset.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const canGenerateClips = asset.kind === "video" && asset.status === "ready";
  const activeProgress = progress && progress.sourceAssetId === asset.id ? progress : null;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <motion.div
          className={cn(
            "group flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card",
            "shadow-sm transition-[box-shadow,border-color] hover:border-border",
            "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_28px_-12px_rgba(0,0,0,0.18)]",
          )}
          whileHover={reduceMotion ? undefined : { y: -2 }}
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
            <Thumbnail asset={asset} showBoundingBoxes={showBoundingBoxes} priority={priority} />
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

            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] tabular-nums text-muted-foreground/60">{formattedDate}</p>
              {canGenerateClips && !activeProgress && (
                <div className="flex items-center gap-1.5">
                  <ClipCaptionToggle value={captionsEnabled} onChange={setCaptionsEnabled} disabled={isGenerating} />
                  <ClipQualityToggle value={quality} onChange={setQuality} disabled={isGenerating} />
                  <GenerateClipsButton
                    onGenerate={() => void generate(asset, { quality, captionsEnabled, captionStyle })}
                    disabled={isGenerating}
                  />
                </div>
              )}
            </div>

            {activeProgress && <ClipProgressStrip progress={activeProgress} />}
          </div>
        </motion.div>
      </HoverCardTrigger>
      <MediaCardHoverDetail asset={asset} formattedDate={formattedDate} />
    </HoverCard>
  );
}
