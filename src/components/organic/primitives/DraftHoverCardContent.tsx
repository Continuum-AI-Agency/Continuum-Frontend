'use client';

import { LightningBoltIcon, Pencil1Icon } from '@radix-ui/react-icons';
import { Loader2, Send } from 'lucide-react';
import { useProgressAnimation } from '@/components/organic/hooks/useProgressAnimation';
import { usePublishDraft } from '@/components/organic/hooks/usePublishDraft';
import { Progress } from '@/components/ui/progress';
import { inferPublishPlatform } from '@/lib/organic/publish-utils';
import { useCalendarStore } from '@/lib/organic/store';
import { cn } from '@/lib/utils';
import { DraftCardMedia, resolveFormatAspectClass } from './DraftCardMedia';
import type { OrganicCalendarDraft } from './types';

function resolveHashtags(draft: OrganicCalendarDraft): string[] {
  const ht = draft.hashtags;
  if (ht) {
    const combined = [
      ...(ht.high ?? []).slice(0, 3),
      ...(ht.medium ?? []).slice(0, 2),
      ...(ht.low ?? []).slice(0, 1),
    ];
    if (combined.length > 0) return combined;
  }
  return draft.tags?.slice(0, 6) ?? [];
}

export function DraftHoverCardContent({
  draft,
  onRegenerate,
}: {
  draft: OrganicCalendarDraft;
  onRegenerate?: (id: string) => void;
}) {
  // Edit reads its target from the draft it is rendering, not from a callback the
  // call site supplies: the month view passed `() => onClick()`, which discarded the
  // id and made Edit a no-op whenever the draft was already selected.
  const beginEditingDraft = useCalendarStore((state) => state.beginEditingDraft);
  const { publish, isPublishing } = usePublishDraft();
  const displayProgress = useProgressAnimation(draft.progress, draft.generationStage);
  // Publishable on any platform the backend has an adapter for, not Instagram alone —
  // hardcoding 'instagram' hid this button on every Facebook and LinkedIn draft.
  const canPublish =
    inferPublishPlatform(draft) != null &&
    draft.status !== 'published' &&
    draft.status !== 'streaming';

  const hashtags = resolveHashtags(draft);
  const visibleHashtags = hashtags.slice(0, 6);
  const extraCount = hashtags.length - visibleHashtags.length;

  const aspectClass = resolveFormatAspectClass(draft.format);
  const isStory = (draft.format ?? '').toLowerCase() === 'story';
  const hasCaption = (draft.captionPreview ?? '').trim().length > 0;

  return (
    <div className="w-[272px] overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xl shadow-black/20">
      {/* Media thumbnail */}
      <div className={cn('overflow-hidden', isStory && 'max-h-[220px]')}>
        <DraftCardMedia
          draft={draft}
          aspectClass={aspectClass}
          className="w-full rounded-none"
          sizes="272px"
        />
      </div>

      {/* Caption. An empty captionPreview (the persistence layer defaults it to '')
          used to render an empty <p>, which reads as a broken card. */}
      <div className="px-3 pt-2.5 pb-1.5">
        {hasCaption ? (
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
            {draft.captionPreview}
          </p>
        ) : (
          <p className="text-xs italic leading-relaxed text-muted-foreground">No caption yet</p>
        )}
      </div>

      {/* Hashtags */}
      {visibleHashtags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {visibleHashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted/60 px-2 py-0.5 text-2xs text-muted-foreground"
            >
              {tag.startsWith('#') ? tag : `#${tag}`}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="rounded-full bg-muted/40 px-2 py-0.5 text-2xs text-muted-foreground/60">
              +{extraCount} more
            </span>
          )}
        </div>
      )}

      {/* Generation progress */}
      {typeof displayProgress === 'number' && (
        <div className="space-y-1 px-3 pb-2">
          <div className="flex justify-between text-3xs font-bold text-muted-foreground">
            <span className="animate-pulse text-amber-500">GENERATING</span>
            <span>{displayProgress}%</span>
          </div>
          <Progress value={displayProgress} className="h-0.5" />
        </div>
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-1 border-t border-border/50 px-2.5 py-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            beginEditingDraft(draft.id);
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil1Icon className="h-3 w-3" />
          Edit
        </button>
        {onRegenerate && draft.status !== 'streaming' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate(draft.id);
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LightningBoltIcon className="h-3 w-3" />
            Regen
          </button>
        )}
        {canPublish && (
          <button
            type="button"
            disabled={isPublishing}
            onClick={(e) => {
              e.stopPropagation();
              publish(draft);
            }}
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 disabled:opacity-50',
            )}
          >
            {isPublishing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            {isPublishing ? 'Publishing…' : 'Publish'}
          </button>
        )}
      </div>
    </div>
  );
}
