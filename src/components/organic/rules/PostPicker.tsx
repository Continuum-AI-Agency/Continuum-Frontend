'use client';

// Choosing which posts a rule watches, by looking at them.
//
// The field this replaces asked for platform post ids pasted by hand — strings
// like 17912345678901234, which nobody recognises, nobody remembers, and which
// fail silently when one digit is wrong: the rule simply never fires and nothing
// says why.
//
// Decisions worth knowing before changing this file:
// - A thumbnail grid, following AdSnapshotGrid in Brand Spy. Posts are things
//   people recognise by sight, which is why Instagram shows a grid and not a
//   list of titles.
// - The id is never displayed. It is the machine's handle on a post, not a
//   person's.
// - A chosen post that is no longer in the fetched window still counts and is
//   still removable. Dropping ids the picker cannot show would silently change
//   a rule just by opening it.
// - History loads a window at a time, because the route returns at most 25 posts
//   per request. A client who posts daily would otherwise be unable to point a
//   rule at anything older than a couple of weeks.
// - The empty state still offers to look further back. Short-circuiting to "no
//   posts" hid the only way out of a window that happened to be empty, which is
//   exactly what a recent-but-not-this-week post produced.

import { Check, ImageOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import { cn } from '@/lib/utils';

const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

function postDay(post: OrganicPost): string {
  if (post.timestamp === undefined) return '';
  const at = new Date(post.timestamp);
  return Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function postKind(post: OrganicPost): string | null {
  const kind = post.mediaProductType ?? post.mediaType;
  if (kind === undefined || kind === null) return null;
  const word = kind.toLowerCase();
  if (word.includes('reel')) return 'Reel';
  if (word.includes('carousel')) return 'Carousel';
  if (word.includes('story')) return 'Story';
  if (word.includes('video')) return 'Video';
  return null;
}

function RefreshButton({
  isRefreshing,
  onRefresh,
}: {
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-5 shrink-0 gap-1 px-1.5 text-2xs"
      disabled={isRefreshing}
      onClick={onRefresh}
    >
      <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
      {isRefreshing ? 'Reading…' : 'Refresh'}
    </Button>
  );
}

function PostTile({
  post,
  selected,
  onToggle,
}: {
  post: OrganicPost;
  selected: boolean;
  onToggle: () => void;
}) {
  const thumbnail = post.thumbnailUrl ?? post.mediaUrl ?? null;
  const kind = postKind(post);
  const day = postDay(post);

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
      )}
    >
      <span className="relative block aspect-[4/5] w-full bg-muted">
        {thumbnail === null ? (
          <span className="grid h-full w-full place-items-center text-muted-foreground">
            <ImageOff className="h-4 w-4" />
          </span>
        ) : (
          // Instagram serves these from a CDN that rejects Next's optimiser, and
          // they are short-lived signed URLs, so a plain img is the honest choice.
          // biome-ignore lint/performance/noImgElement: see the note above
          <img src={thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
        <span
          aria-hidden
          className={cn(
            'absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full border text-background transition-colors',
            selected ? 'border-primary bg-primary' : 'border-white/70 bg-black/30',
          )}
        >
          {selected ? <Check className="h-2.5 w-2.5" /> : null}
        </span>
        {kind === null ? null : (
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-2xs text-white">
            {kind}
          </span>
        )}
      </span>
      <span className="flex flex-col gap-0.5 p-1.5">
        {day === '' ? null : <span className="text-2xs text-muted-foreground">{day}</span>}
        <span className="line-clamp-2 text-2xs leading-snug">
          {post.caption?.trim() === '' || post.caption === undefined ? (
            <span className="text-muted-foreground italic">No caption</span>
          ) : (
            post.caption
          )}
        </span>
      </span>
    </button>
  );
}

export function PostPicker({
  posts,
  selectedIds,
  isLoading,
  error,
  hasAccount = true,
  isRefreshing = false,
  onRefresh,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onChange,
}: {
  posts: OrganicPost[];
  selectedIds: string[];
  isLoading: boolean;
  error: boolean;
  hasAccount?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onChange: (next: string[]) => void;
}) {
  const shown = new Set(posts.map((post) => post.id));
  const missing = selectedIds.filter((id) => !shown.has(id));

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((chosen) => chosen !== id)
        : [...selectedIds, id],
    );
  };

  // Named before the empty grid, because "no account" and "no posts" produced the
  // same sentence and the wrong one sent us looking for missing posts twice.
  if (!hasAccount) {
    return (
      <p className="rounded-md border bg-muted/30 px-2.5 py-2 text-2xs text-muted-foreground">
        No Instagram account is connected to this brand, so there are no posts to choose from.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {SKELETON_KEYS.map((key) => (
          <div key={key} className="aspect-[4/5] animate-pulse rounded-lg bg-muted/70" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-2xs text-destructive">
        Could not load your posts. The rule keeps whichever posts it already had.
      </p>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-md border bg-muted/30 px-2.5 py-2">
        <p className="text-2xs text-muted-foreground">
          {hasMore
            ? 'No posts in this stretch of history.'
            : 'No published posts found on this account.'}
        </p>
        <div className="flex items-center gap-1.5">
          {hasMore && onLoadMore !== undefined ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-2xs"
              disabled={isLoadingMore}
              onClick={onLoadMore}
            >
              {isLoadingMore ? 'Loading…' : 'Look further back'}
            </Button>
          ) : null}
          {onRefresh === undefined ? null : (
            <RefreshButton isRefreshing={isRefreshing} onRefresh={onRefresh} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs text-muted-foreground">
          {selectedIds.length === 0
            ? 'None chosen yet'
            : `${selectedIds.length} chosen of ${posts.length}`}
        </span>
        <div className="flex items-center gap-1">
          {onRefresh === undefined ? null : (
            <RefreshButton isRefreshing={isRefreshing} onRefresh={onRefresh} />
          )}
          {selectedIds.length === 0 ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-2xs"
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
        {posts.map((post) => (
          <PostTile
            key={post.id}
            post={post}
            selected={selectedIds.includes(post.id)}
            onToggle={() => toggle(post.id)}
          />
        ))}
      </div>

      {hasMore && onLoadMore !== undefined ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 self-start text-2xs"
          disabled={isLoadingMore}
          onClick={onLoadMore}
        >
          {isLoadingMore ? 'Loading…' : 'Load older posts'}
        </Button>
      ) : null}

      {missing.length === 0 ? null : (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
          <span className="text-2xs text-muted-foreground">
            {missing.length} chosen post{missing.length === 1 ? '' : 's'} outside this list. Still
            watched.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 shrink-0 px-1.5 text-2xs"
            onClick={() => onChange(selectedIds.filter((id) => shown.has(id)))}
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}
