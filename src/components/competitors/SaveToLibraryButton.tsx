'use client';

import { Check, FolderPlus } from 'lucide-react';
import { useState } from 'react';

import { useSaveCompetitorPostToLibrary, useSavedCompetitorPostIds } from '@/lib/api/competitorSpy';
import { cn } from '@/lib/utils';
import type { CompetitorPostView } from './competitorPostView';

// Saves a competitor post into the media Library as a tagged, re-fetchable asset
// (distinct from SaveToBoardButton, which saves to a swipe-file board). Works for
// both tracked-feed and ad-hoc search posts, since competitorId is optional.
// The "Saved" state is sourced from the shared saved-ids query so it persists
// across the hover-card unmount/remount rather than resetting to an un-saved state.
export function SaveToLibraryButton({
  brandId,
  view,
  className,
}: {
  brandId: string;
  view: CompetitorPostView;
  className?: string;
}) {
  const [transient, setTransient] = useState<'idle' | 'saving' | 'error'>('idle');
  const { data: savedPostIds } = useSavedCompetitorPostIds(brandId);
  const save = useSaveCompetitorPostToLibrary(brandId);

  const saved = savedPostIds?.has(view.post.id) ?? false;

  async function onSave(): Promise<void> {
    if (transient === 'saving' || saved) return;
    setTransient('saving');
    try {
      await save.mutateAsync({
        brandId,
        competitorId: view.competitorId ?? null,
        competitorName: view.competitorName,
        instagramUsername: view.instagramUsername,
        post: view.post,
      });
      setTransient('idle');
    } catch {
      setTransient('error');
    }
  }

  const label =
    transient === 'saving'
      ? 'Saving…'
      : saved
        ? 'Saved'
        : transient === 'error'
          ? 'Retry'
          : 'Library';

  return (
    <button
      type="button"
      onClick={() => void onSave()}
      disabled={transient === 'saving' || saved}
      aria-label="Save to Library"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-100',
        saved && 'border-emerald-500/40 text-emerald-600',
        className,
      )}
    >
      {saved ? <Check className="h-3 w-3" /> : <FolderPlus className="h-3 w-3" />}
      {label}
    </button>
  );
}
