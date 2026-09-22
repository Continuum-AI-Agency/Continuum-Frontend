'use client';

// One Inspiration card. Everything a user scans for sits on the face — the format,
// how far the post beat its own account ('3.2x'), and its views/likes/comments —
// so nothing needs a hover. Hovering a reel only plays it. Clicking opens the
// Analyse panel beside the grid, where the saved/board actions live.

import { COMPETITOR_POST_FORMAT_LABELS } from '@continuum/contracts';
import { Images, Play } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import type { CompetitorPostView } from './competitorPostView';
import { InspirationAnalysePanel } from './InspirationAnalysePanel';
import { PostThumb, ReelVideo, reelVideoUrl } from './postMedia';
import { OutlierBadge, PostMetrics } from './postStats';

function KindGlyph({
  kind,
  mediaCount,
}: {
  kind: CompetitorPostView['post']['kind'];
  mediaCount: number;
}) {
  if (kind === 'post') return null;
  return (
    <span className="pointer-events-none absolute bottom-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white">
      {kind === 'reel' ? (
        <Play className="size-2.5 fill-current" aria-hidden />
      ) : (
        <Images className="size-2.5" aria-hidden />
      )}
      {kind === 'carousel' ? mediaCount : 'Reel'}
    </span>
  );
}

export function CompetitorPostHoverTile({
  brandId,
  view,
  actions,
}: {
  brandId: string;
  view: CompetitorPostView;
  actions?: ReactNode;
}) {
  const { post } = view;
  const [hovering, setHovering] = useState(false);
  const [open, setOpen] = useState(false);
  const altText = `${view.competitorName} ${post.kind}`;
  const videoUrl = reelVideoUrl(post);
  const age = post.timestamp ? formatRelativeTime(post.timestamp) : null;
  const mediaClassName =
    'aspect-[4/5] h-full transition-transform duration-200 motion-safe:group-hover/tile:scale-[1.03]';

  return (
    <article
      data-testid="inspiration-tile"
      data-post-id={post.id}
      data-post-type={post.kind}
      data-format={view.format}
      data-outlier={post.outlierScore ?? ''}
      className={cn(
        'group/tile flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card transition-colors',
        open ? 'border-primary' : 'border-border hover:border-foreground/25',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        aria-label={`Analyse ${view.competitorName} ${post.kind}`}
        className="relative block overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {videoUrl ? (
          <ReelVideo
            src={videoUrl}
            poster={post.coverUrl}
            alt={altText}
            playing={hovering}
            className={mediaClassName}
          />
        ) : (
          <PostThumb coverUrl={post.coverUrl} alt={altText} className={mediaClassName} />
        )}
        <span
          data-testid="format-label"
          className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white"
        >
          {COMPETITOR_POST_FORMAT_LABELS[view.format]}
        </span>
        <OutlierBadge view={view} className="pointer-events-none absolute right-1.5 top-1.5" />
        <KindGlyph kind={post.kind} mediaCount={post.mediaCount} />
      </button>

      <div className="flex min-w-0 flex-col gap-1.5 p-2.5">
        <p className="flex min-w-0 items-baseline gap-1 text-xs">
          <span className="truncate font-medium text-foreground">{view.competitorName}</span>
          {age ? <span className="shrink-0 text-muted-foreground">· {age}</span> : null}
        </p>
        {post.caption ? (
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{post.caption}</p>
        ) : null}
        {view.relevance && view.relevance.matchedTerms.length > 0 ? (
          <p data-testid="relevance-reason" className="truncate text-2xs text-muted-foreground">
            Fits your brand: {view.relevance.matchedTerms.join(', ')}
          </p>
        ) : null}
        <PostMetrics view={view} />
      </div>

      {open ? (
        <InspirationAnalysePanel
          brandId={brandId}
          view={view}
          open={open}
          onOpenChange={setOpen}
          actions={actions}
        />
      ) : null}
    </article>
  );
}
