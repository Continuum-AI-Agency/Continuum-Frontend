'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { LinkedInPost, type LinkedInPostProps } from '@/components/ui/linkedin-post';
import { cn } from '@/lib/utils';

// Text-first grid for the brand's OWN LinkedIn posts. LinkedIn content is
// copy-heavy — unlike Instagram's image previews — so each tile leads with the
// author + a snippet and reveals the full post on hover; the expanded card also
// supports the LinkedInPost "…more" inline expand. Grid + hover follow the app's
// Card / HoverCard conventions (see CompetitorPostHoverTile for the IG analog).
// LinkedIn brand-blue stays on the LinkedIn identity marks (avatar fallback) —
// platform colour, not our accent — everything else uses semantic tokens.

export type LinkedInPostView = NonNullable<LinkedInPostProps['data']>;

function initials(name?: string): string {
  if (!name) return 'in';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function EngagementMeta({ post }: { post: LinkedInPostView }) {
  if (!post.reactions && !post.comments && !post.reposts) return null;
  return (
    <div className="flex items-center gap-3 text-2xs text-muted-foreground">
      {post.reactions ? <span>{post.reactions} reactions</span> : null}
      {post.comments ? <span>{post.comments} comments</span> : null}
      {post.reposts ? <span>{post.reposts} reposts</span> : null}
    </div>
  );
}

function LinkedInPostTile({ post }: { post: LinkedInPostView }) {
  return (
    <HoverCard openDelay={180} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Card className="group relative cursor-default border py-0 transition-[border-color,box-shadow] duration-150 ease-out hover:border-muted-foreground/60 hover:shadow-sm focus-within:ring-2 focus-within:ring-ring">
          <CardContent className="flex flex-col gap-2 p-3">
            <div className="flex items-center gap-2.5">
              <Avatar className="size-9 shrink-0">
                <AvatarImage src={post.avatar} alt={post.author ?? 'author'} />
                <AvatarFallback className="bg-[#0A66C2] text-2xs font-semibold text-white">
                  {initials(post.author)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{post.author}</p>
                <p className="truncate text-xs text-muted-foreground">{post.headline}</p>
              </div>
              {post.time ? (
                <span className="shrink-0 font-mono text-3xs tabular-nums text-muted-foreground">
                  {post.time}
                </span>
              ) : null}
            </div>
            <p className="line-clamp-3 whitespace-pre-wrap text-sm text-foreground/90">
              {post.content}
            </p>
            <EngagementMeta post={post} />
          </CardContent>
        </Card>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="right"
        className="w-[420px] max-w-[90vw] overflow-hidden border-0 bg-transparent p-0"
      >
        <LinkedInPost data={post} appearance={{ maxLines: 8 }} />
      </HoverCardContent>
    </HoverCard>
  );
}

export function LinkedInPostGrid({
  posts,
  className,
}: {
  posts: LinkedInPostView[];
  className?: string;
}) {
  if (posts.length === 0) return null;
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {posts.map((post, index) => (
        <LinkedInPostTile key={post.postUrl ?? `${post.author ?? 'post'}-${index}`} post={post} />
      ))}
    </div>
  );
}
