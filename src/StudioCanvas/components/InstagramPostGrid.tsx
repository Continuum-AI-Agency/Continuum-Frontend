'use client';

import type { InstagramPost } from '@continuum/contracts';
import { ChevronLeft, ChevronRight, Images, Play } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { setInstagramMediaDragData } from './instagramMediaDrag';

interface InstagramPostGridProps {
  posts: InstagramPost[];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSelect: (post: InstagramPost) => void;
}

const PostCover = ({ post }: { post: InstagramPost }) => {
  const translateUi = useUiTranslations('studio');

  if (post.coverUrl) {
    // draggable={false} so the tile button owns the drag: a natively draggable
    // <img> starts its own drag with the browser's default payload instead.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={post.coverUrl} alt="" draggable={false} className="h-full w-full object-cover" />
    );
  }
  const firstVideo = post.items.find((item) => item.kind === 'video');
  if (firstVideo) {
    return <video src={firstVideo.url} className="h-full w-full object-cover" muted />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
      {' '}
      {translateUi('no_preview_4b8bacd8')}{' '}
    </div>
  );
};

const PostBadge = ({ post }: { post: InstagramPost }) => {
  const translateUi = useUiTranslations('studio');

  if (post.kind === 'carousel') {
    return (
      <Badge variant="secondary" className="absolute right-1 top-1 gap-1">
        <Images className="h-3 w-3" />
        {post.mediaCount}
      </Badge>
    );
  }
  if (post.kind === 'reel') {
    return (
      <Badge variant="secondary" className="absolute right-1 top-1 gap-1">
        <Play className="h-3 w-3" /> {translateUi('reel_9cb145e8')}{' '}
      </Badge>
    );
  }
  return null;
};

export function InstagramPostGrid({
  posts,
  page,
  pageSize,
  onPageChange,
  onSelect,
}: InstagramPostGridProps) {
  const translateUi = useUiTranslations('studio');

  const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize;
  const visible = posts.slice(start, start + pageSize);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {visible.map((post) => (
          <button
            key={post.id}
            type="button"
            aria-label={translateUi('import_from_value0_value1_1c2636ce', {
              value0: String(post.kind),
              value1: String(post.shortcode || post.id),
            })}
            onClick={() => onSelect(post)}
            // Only image covers are draggable: a video reference cannot be inlined
            // through the image proxy, so a dragged reel would land as a dead node.
            draggable={Boolean(post.coverUrl)}
            onDragStart={(event) => {
              if (!post.coverUrl) return;
              setInstagramMediaDragData(event.dataTransfer, post.coverUrl);
            }}
            className="relative aspect-square overflow-hidden rounded-md border transition hover:ring-2 hover:ring-primary"
          >
            <PostCover post={post} />
            <PostBadge post={post} />
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage === 0}
            aria-label={translateUi('previous_page_1208ec01')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {' '}
            {translateUi('page_0a30a815')} {safePage + 1} {translateUi('of_28391d3b')} {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages - 1}
            aria-label={translateUi('next_page_c08ac736')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
