"use client";

import { ChevronLeft, ChevronRight, Images, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InstagramPost } from "@continuum/contracts";

interface InstagramPostGridProps {
  posts: InstagramPost[];
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSelect: (post: InstagramPost) => void;
}

const PostCover = ({ post }: { post: InstagramPost }) => {
  if (post.coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={post.coverUrl} alt="" className="h-full w-full object-cover" />;
  }
  const firstVideo = post.items.find((item) => item.kind === "video");
  if (firstVideo) {
    return <video src={firstVideo.url} className="h-full w-full object-cover" muted />;
  }
  return <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No preview</div>;
};

const PostBadge = ({ post }: { post: InstagramPost }) => {
  if (post.kind === "carousel") {
    return (
      <Badge variant="secondary" className="absolute right-1 top-1 gap-1">
        <Images className="h-3 w-3" />
        {post.mediaCount}
      </Badge>
    );
  }
  if (post.kind === "reel") {
    return (
      <Badge variant="secondary" className="absolute right-1 top-1 gap-1">
        <Play className="h-3 w-3" />
        Reel
      </Badge>
    );
  }
  return null;
};

export function InstagramPostGrid({ posts, page, pageSize, onPageChange, onSelect }: InstagramPostGridProps) {
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
            aria-label={`Import from ${post.kind} ${post.shortcode || post.id}`}
            onClick={() => onSelect(post)}
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
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {safePage + 1} of {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages - 1}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
