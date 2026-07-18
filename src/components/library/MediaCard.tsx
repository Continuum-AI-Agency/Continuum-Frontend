'use client';

import type { MediaAsset } from '@continuum/contracts';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileIcon,
  ImageOff,
  Layers,
  Loader2,
  Play,
  Scaling,
  Scissors,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { ViralityScoreBadge } from '@/components/virality/ViralityScoreBadge';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import { seekVideoPreviewFrame } from '@/lib/library/videoPoster';
import { SOURCE_LABEL } from '@/lib/media/filters';
import { cn } from '@/lib/utils';
import { viralityScoreForAsset } from '@/lib/virality/assetScore';
import { ClipCaptionToggle } from './ClipCaptionToggle';
import { ClipProgressStrip } from './ClipProgressStrip';
import { ClipQualityToggle } from './ClipQualityToggle';
import { fileExtension, formatBytes } from './detail/assetFileMeta';
import { useClipCaptionPreference } from './hooks/useClipCaptionPreference';
import { useClipQualityPreference } from './hooks/useClipQualityPreference';
import { useGenerateClips } from './hooks/useGenerateClips';
import { MediaBoundingBoxes } from './MediaBoundingBoxes';
import { QuickReformatMenu } from './reformat/QuickReformatMenu';

type Props = {
  brandId: string;
  asset: MediaAsset;
  index?: number;
  showBoundingBoxes?: boolean;
  captionStyle?: CaptionStyle;
  onOpen?: (asset: MediaAsset) => void;
  onAssetChanged?: () => void;
  selected?: boolean;
  onToggleSelected?: (asset: MediaAsset) => void;
};

const BADGE_BASE =
  'absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs';

// Matches MediaGrid column breakpoints: 2-col mobile → 3-col sm → 4-col lg → 5-col xl
const IMAGE_SIZES =
  '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw';

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
      { rootMargin: '200px' },
    );
    ob.observe(ref.current);
    return () => ob.disconnect();
  }, [active]);
  return { ref, activeSrc: active && src ? src : undefined };
}

// A video card with a poster paints the poster and downloads ZERO video bytes —
// `preload="none"` plus a withheld `src` — until the pointer enters, at which
// point the real video mounts and plays over the still. A video WITHOUT a poster
// keeps the old behavior (lazy src + preload="metadata"), so un-postered assets
// are unchanged rather than broken.
function VideoThumbnail({
  asset,
  priority,
  onMediaError,
}: {
  asset: MediaAsset;
  priority: boolean;
  onMediaError: () => void;
}) {
  const posterUrl =
    asset.preview?.state === 'ready' && asset.preview.kind === 'image'
      ? asset.preview.signedUrl
      : (asset.thumbnailUrl ?? null);
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);
  const { ref: videoRef, activeSrc } = useLazyVideoSrc(asset.signedUrl, priority && !posterUrl);
  const src = !posterUrl || hovered ? activeSrc : undefined;

  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: silent grid preview of the user's own creative; no caption track exists */}
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl ?? undefined}
        className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        muted
        playsInline
        preload={posterUrl ? 'none' : 'metadata'}
        onError={onMediaError}
        onLoadedMetadata={() => {
          if (!posterUrl && videoRef.current) seekVideoPreviewFrame(videoRef.current);
        }}
        onLoadedData={() => {
          if (hoveredRef.current) void videoRef.current?.play();
        }}
        onPointerEnter={() => {
          hoveredRef.current = true;
          setHovered(true);
          if (src) void videoRef.current?.play();
        }}
        onPointerLeave={() => {
          hoveredRef.current = false;
          videoRef.current?.pause();
        }}
      />
      <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/50 p-1.5 text-white transition-opacity group-hover:opacity-0">
        <Play className="size-3 fill-current" />
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: MediaAsset['status'] }) {
  const reduceMotion = useReducedMotion();
  if (status === 'ready') return null;

  const content =
    status === 'analyzing' ? (
      <span className={cn(BADGE_BASE, 'bg-black/60 text-white backdrop-blur-sm')}>
        <Loader2 className="size-2.5 animate-spin" />
        Analyzing
      </span>
    ) : status === 'skipped_free' ? (
      <span className={cn(BADGE_BASE, 'bg-amber-900/80 text-amber-200')}>Upgrade to analyze</span>
    ) : status === 'error' ? (
      <span className={cn(BADGE_BASE, 'bg-red-900/80 text-red-200')}>Error</span>
    ) : (
      <span className={cn(BADGE_BASE, 'bg-black/60 text-white')}>{status}</span>
    );

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
        transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}

// A saved clip already carries its virality score (origin_ref.scoreStub, written at
// register time) — surface it on the card so the grade survives past generation.
function ClipViralityBadge({ asset }: { asset: MediaAsset }) {
  const virality = viralityScoreForAsset(asset);
  if (!virality) return null;
  return (
    <div className="absolute right-2 top-2 rounded-full bg-background/90 p-0.5 shadow-sm backdrop-blur">
      <ViralityScoreBadge overall={virality.overall} grade={virality.grade} />
    </div>
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
  const preview = asset.preview?.state === 'ready' ? asset.preview : null;

  if (asset.kind === 'file' && preview?.signedUrl) {
    return preview.kind === 'video' ? (
      // biome-ignore lint/a11y/useMediaCaption: silent visual companion for a source project.
      <video
        src={preview.signedUrl}
        className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        muted
        playsInline
        preload="metadata"
        onError={() => setMediaError(true)}
      />
    ) : (
      <Image
        src={preview.signedUrl}
        alt={asset.title ?? asset.fileName}
        fill
        sizes={IMAGE_SIZES}
        priority={priority}
        className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
        onError={() => setMediaError(true)}
      />
    );
  }

  if (asset.kind === 'file') {
    const ext = fileExtension(asset.fileName);
    const isAfterEffects = ext === 'AEP';
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-muted px-3">
        {isAfterEffects ? (
          <span className="flex size-10 items-center justify-center rounded-lg bg-[#00005b] text-sm font-semibold tracking-tight text-[#9999ff]">
            Ae
          </span>
        ) : (
          <FileIcon className="size-8 text-muted-foreground/40" strokeWidth={1.5} />
        )}
        {ext && (
          <span className="rounded border border-border bg-background px-1.5 py-0.5 text-2xs font-semibold tracking-wide text-muted-foreground">
            {ext}
          </span>
        )}
        <span className="max-w-full truncate text-2xs text-muted-foreground/70">
          {asset.fileName}
        </span>
        {isAfterEffects ? (
          <span className="text-2xs text-muted-foreground/60">After Effects project</span>
        ) : null}
        {asset.preview?.state === 'awaiting_companion' ? (
          <span className="text-2xs text-muted-foreground/60">Add companion preview</span>
        ) : null}
      </div>
    );
  }

  if (!asset.signedUrl || mediaError) {
    return (
      <div className="flex size-full items-center justify-center bg-muted">
        <ImageOff className="size-8 text-muted-foreground/40" />
      </div>
    );
  }

  if (asset.kind === 'video') {
    return (
      <VideoThumbnail asset={asset} priority={priority} onMediaError={() => setMediaError(true)} />
    );
  }

  return (
    <>
      <Image
        src={preview?.signedUrl ?? asset.signedUrl}
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

// A grouped, saved carousel (e.g. a competitor post): pages through its slides in
// place. The count badge doubles as position ("k / N"); prev/next surface on hover.
function CarouselThumbnail({
  slides,
  priority,
  alt,
}: {
  slides: NonNullable<MediaAsset['carousel']>['slides'];
  priority: boolean;
  alt: string;
}) {
  const [index, setIndex] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const slide = slides[index] ?? slides[0];

  const page = (delta: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMediaError(false);
    setIndex((prev) => (prev + delta + slides.length) % slides.length);
  };

  return (
    <>
      {slide?.signedUrl && !mediaError ? (
        slide.kind === 'video' ? (
          <video
            key={slide.slideIndex}
            src={slide.signedUrl}
            className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
            muted
            playsInline
            preload="metadata"
            onError={() => setMediaError(true)}
            onLoadedMetadata={(event) => seekVideoPreviewFrame(event.currentTarget)}
          />
        ) : (
          <Image
            key={slide.slideIndex}
            src={slide.signedUrl}
            alt={`${alt} — slide ${index + 1}`}
            fill
            sizes={IMAGE_SIZES}
            priority={priority && index === 0}
            className="object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
            onError={() => setMediaError(true)}
          />
        )
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-muted px-3 text-center">
          <ImageOff className="size-8 text-muted-foreground/40" />
          <span className="text-2xs text-muted-foreground/70">
            {slide?.signedUrl ? 'Preview unavailable' : 'Media file unavailable'}
          </span>
        </div>
      )}

      <span
        className={cn(BADGE_BASE, 'left-auto right-1.5 bg-black/60 text-white backdrop-blur-sm')}
      >
        <Layers className="size-2.5" />
        {index + 1}/{slides.length}
      </span>

      <button
        type="button"
        aria-label="Previous slide"
        onClick={page(-1)}
        className="absolute left-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Next slide"
        onClick={page(1)}
        className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
      >
        <ChevronRight className="size-4" />
      </button>
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
function MediaCardHoverDetail({
  asset,
  formattedDate,
}: {
  asset: MediaAsset;
  formattedDate: string;
}) {
  const dimensions = asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;
  const tags = asset.tags ?? [];
  const objects = asset.detectedObjects ?? [];

  return (
    <HoverCardContent side="right" align="start" className="z-40 w-80">
      <div className="flex flex-col gap-2.5">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
          {asset.signedUrl && asset.kind === 'image' ? (
            <Image
              src={asset.signedUrl}
              alt={asset.title ?? asset.fileName}
              fill
              sizes="320px"
              className="object-contain"
            />
          ) : asset.signedUrl && asset.kind === 'video' ? (
            // biome-ignore lint/a11y/useMediaCaption: silent hover preview of the user's own creative; no caption track exists
            <video
              src={asset.thumbnailUrl ? undefined : asset.signedUrl}
              poster={asset.thumbnailUrl ?? undefined}
              muted
              playsInline
              preload={asset.thumbnailUrl ? 'none' : 'metadata'}
              onLoadedMetadata={(event) => {
                if (!asset.thumbnailUrl) seekVideoPreviewFrame(event.currentTarget);
              }}
              className="h-full w-full object-contain"
            />
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
          <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {SOURCE_LABEL[asset.source]}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {asset.kind}
          </span>
          {dimensions ? (
            <span className="text-2xs tabular-nums text-muted-foreground/80">{dimensions}</span>
          ) : null}
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-muted/70 px-1.5 py-0.5 text-2xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {tags.length > 3 ? (
              <span className="rounded-md bg-muted/70 px-1.5 py-0.5 text-2xs text-muted-foreground">
                +{tags.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}

        {objects.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {objects.slice(0, 6).map((obj, i) => (
              <span
                key={`${obj.label}-${i}`}
                className="rounded-md border border-border/60 px-1.5 py-0.5 text-2xs text-muted-foreground"
              >
                {obj.label}
                {typeof obj.confidence === 'number' ? ` ${Math.round(obj.confidence * 100)}%` : ''}
              </span>
            ))}
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs text-muted-foreground">
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

function GenerateClipsButton({
  onGenerate,
  disabled,
}: {
  onGenerate: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onGenerate();
      }}
      disabled={disabled}
      className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground/70 transition-colors hover:text-foreground disabled:opacity-50"
      title="Generate clips from this video"
    >
      <Scissors className="size-3" />
      Clips
    </button>
  );
}

export function MediaCard({
  brandId,
  asset,
  index,
  showBoundingBoxes = false,
  captionStyle,
  onOpen,
  onAssetChanged,
  selected = false,
  onToggleSelected,
}: Props) {
  const reduceMotion = useReducedMotion();
  const { generate, isGenerating, progress } = useGenerateClips();
  const { quality, setQuality } = useClipQualityPreference();
  const { captionsEnabled, setCaptionsEnabled } = useClipCaptionPreference();
  const [hoverDetailOpen, setHoverDetailOpen] = useState(false);
  const suppressHoverDetailRef = useRef(false);
  const priority = (index ?? Infinity) < 10;
  const formattedDate = new Date(asset.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const canGenerateClips = asset.kind === 'video' && asset.status === 'ready';
  const activeProgress = progress && progress.sourceAssetId === asset.id ? progress : null;
  const openDetail = () => {
    // Hover content is portalled above the grid. Close it before docking the
    // workspace so its preview can never intercept annotation/comment actions.
    suppressHoverDetailRef.current = true;
    setHoverDetailOpen(false);
    onOpen?.(asset);
  };

  const handleHoverDetailOpenChange = (open: boolean) => {
    if (open && suppressHoverDetailRef.current) return;
    setHoverDetailOpen(open);
  };

  return (
    <>
      <HoverCard
        open={hoverDetailOpen}
        onOpenChange={handleHoverDetailOpenChange}
        openDelay={150}
        closeDelay={100}
      >
        <HoverCardTrigger asChild>
          {/* The whole card opens the detail takeover; inner controls (clip tools,
            copy, carousel paging) stopPropagation so they keep their own click.
            A native <button> cannot wrap those nested controls, hence the role. */}
          {/* biome-ignore lint/a11y/useSemanticElements: nested interactive controls preclude a native button wrapper */}
          <motion.div
            role="button"
            tabIndex={0}
            aria-label={`Open ${asset.title ?? asset.fileName}`}
            onClick={openDetail}
            onPointerEnter={() => {
              // Opening the modal causes a synthetic leave on the covered card.
              // Only a fresh enter after the modal closes may re-enable preview.
              if (suppressHoverDetailRef.current) suppressHoverDetailRef.current = false;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDetail();
              }
            }}
            className={cn(
              'group flex flex-col overflow-hidden rounded-lg border border-border/70 bg-card',
              'transition-[border-color] hover:border-foreground/20',
              selected && 'border-primary ring-2 ring-primary/20',
              onOpen &&
                'cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
            )}
            whileHover={reduceMotion ? undefined : { y: -2 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
              {onToggleSelected ? (
                <button
                  type="button"
                  aria-label={`${selected ? 'Deselect' : 'Select'} ${asset.title ?? asset.fileName}`}
                  aria-pressed={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSelected(asset);
                  }}
                  className={cn(
                    'absolute left-2 top-2 z-10 flex size-7 items-center justify-center rounded-md border bg-background/90 shadow-sm backdrop-blur transition-opacity',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground opacity-100'
                      : 'border-border text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
                  )}
                >
                  <Check className="size-3.5" />
                </button>
              ) : null}
              {asset.carousel && asset.carousel.slideCount > 1 ? (
                <CarouselThumbnail
                  slides={asset.carousel.slides}
                  priority={priority}
                  alt={asset.title ?? asset.fileName}
                />
              ) : (
                <Thumbnail
                  asset={asset}
                  showBoundingBoxes={showBoundingBoxes}
                  priority={priority}
                />
              )}
              <StatusBadge status={asset.status} />
              <ClipViralityBadge asset={asset} />
              {asset.kind === 'image' && asset.signedUrl ? (
                <QuickReformatMenu
                  asset={asset}
                  brandId={brandId}
                  onCompleted={() => onAssetChanged?.()}
                  trigger={
                    <button
                      type="button"
                      title="Reformat image"
                      aria-label={`Reformat ${asset.title ?? asset.fileName}`}
                      className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-md border border-white/15 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Scaling className="size-3.5" />
                    </button>
                  }
                />
              ) : null}
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
                <p className="text-xs tabular-nums text-muted-foreground/60">{formattedDate}</p>
                {canGenerateClips && !activeProgress && (
                  <div className="flex items-center gap-1.5">
                    <ClipCaptionToggle
                      value={captionsEnabled}
                      onChange={setCaptionsEnabled}
                      disabled={isGenerating}
                    />
                    <ClipQualityToggle
                      value={quality}
                      onChange={setQuality}
                      disabled={isGenerating}
                    />
                    <GenerateClipsButton
                      onGenerate={() =>
                        void generate(asset, { quality, captionsEnabled, captionStyle })
                      }
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
    </>
  );
}
