'use client';

// The "Blueprint ready" state shown in an otherwise-empty (pending) media slot.
// The AI has conceptualized N storyboard frames + a caption but no final media
// exists yet. This surface makes the honest state explicit AND makes the single
// most important next action — generating the final media, which re-pushes the
// durable run to its next stage — an obvious primary CTA, not a buried one.
// Frames are large and click-to-enlarge; "Use your own creative" opens the
// library. All inner controls stopPropagation: the wrapping drop zone treats a
// bare click as "open the library", which must not fire for these actions.

import { Library, Loader2, Maximize2, Wand2 } from 'lucide-react';
import Image from 'next/image';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import type { OrganicCalendarDraft } from './types';

export type StoryboardFrame = {
  role?: string | null;
  storageUrl: string;
  format?: string | null;
};

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Persisted storyboard preview frames (Stage-2 blueprint). Reel panels render at 1K —
// they become the Veo first frame, so they are not previews — while carousel and single
// frames stay at 512px. The backend
// re-signs storageUrl on every calendar load, so render it directly. Only frames
// with a usable signed URL are surfaced; base64 is never used.
export function resolveStoryboardFrames(draft: OrganicCalendarDraft): StoryboardFrame[] {
  return (draft.mediaSuggestion?.storyboard ?? [])
    .filter((frame): frame is { storageUrl: string } & typeof frame => hasText(frame?.storageUrl))
    .map((frame) => ({
      role: frame.role,
      storageUrl: frame.storageUrl as string,
      format: frame.format,
    }));
}

const MAX_VISIBLE_FRAMES = 6;

function stop(event: React.MouseEvent) {
  event.stopPropagation();
}

function FrameTile({
  frame,
  index,
  alt,
  onEnlarge,
}: {
  frame: StoryboardFrame;
  index: number;
  alt: string;
  onEnlarge: (index: number) => void;
}) {
  // A storyboard panel is 9:16 and exists to be JUDGED on framing. The square tile with
  // object-cover this used to render cropped ~44% of every frame vertically — cutting
  // away the exact thing a contact sheet is for, and hiding the copy-safe zone entirely.
  return (
    <button
      type="button"
      onClick={(event) => {
        stop(event);
        onEnlarge(index);
      }}
      aria-label={`Enlarge storyboard frame ${index + 1}${hasText(frame.role) ? ` — ${frame.role}` : ''}`}
      className="group relative aspect-[9/16] h-32 w-auto shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Image
        src={frame.storageUrl}
        alt={`${alt} — storyboard frame ${index + 1}`}
        fill
        unoptimized
        sizes="72px"
        className="object-contain"
      />
      <span className="pointer-events-none absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
        <Maximize2 className="h-3 w-3" />
      </span>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-3xs font-semibold uppercase tracking-wide text-white">
        {index + 1}
        {hasText(frame.role) ? ` · ${frame.role}` : ''}
      </span>
    </button>
  );
}

export function BlueprintStoryboard({
  frames,
  alt,
  canGenerate,
  isGenerating,
  onGenerate,
  onUseOwn,
  onEnlargeFrame,
}: {
  frames: StoryboardFrame[];
  alt: string;
  canGenerate: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onUseOwn: () => void;
  onEnlargeFrame: (index: number) => void;
}) {
  const visible = frames.slice(0, MAX_VISIBLE_FRAMES);
  const overflow = frames.length - visible.length;

  return (
    <div className="flex w-full flex-col items-center gap-3 px-4 py-5 text-center">
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-3xs font-semibold uppercase tracking-wider text-primary">
        Blueprint ready
      </span>
      <p className="text-2xs font-medium text-muted-foreground/70">
        Concept preview — {frames.length} frame{frames.length === 1 ? '' : 's'}. No final media yet.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {visible.map((frame, index) => (
          <FrameTile
            key={`${frame.storageUrl}-${index}`}
            frame={frame}
            index={index}
            alt={alt}
            onEnlarge={onEnlargeFrame}
          />
        ))}
        {overflow > 0 && (
          <span className="flex aspect-[9/16] h-32 w-auto shrink-0 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/30 text-xs font-medium text-muted-foreground">
            +{overflow}
          </span>
        )}
      </div>

      <div className="flex w-full flex-col gap-1.5 pt-1">
        <button
          type="button"
          onClick={(event) => {
            stop(event);
            onGenerate();
          }}
          disabled={!canGenerate || isGenerating}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
            !canGenerate || isGenerating
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating final media…
            </>
          ) : (
            <>
              <Wand2 className="h-4 w-4" />
              Generate final media
            </>
          )}
        </button>
        <button
          type="button"
          onClick={(event) => {
            stop(event);
            onUseOwn();
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
        >
          <Library className="h-4 w-4" />
          Use your own creative
        </button>
      </div>

      {!canGenerate && !isGenerating && (
        <p className="text-3xs text-muted-foreground/60">
          Finishing setup — generation available in a moment.
        </p>
      )}
    </div>
  );
}
