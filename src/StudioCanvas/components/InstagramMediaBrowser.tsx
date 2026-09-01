'use client';

// Non-modal in-canvas Instagram media browser. Type a username, fetch the
// account's top media (Graph business_discovery), browse posts/reels/carousels
// 10 at a time, pick a post, then choose which slides to drop onto the canvas as
// unattached reference nodes. Replaces the old paste-a-link modal.

import type {
  InstagramPost,
  InstagramTopMediaResponse,
  UnfurlMediaItem,
} from '@continuum/contracts';
import { AtSign, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchInstagramTopMedia } from '@/lib/api/aiStudioInstagram.client';
import { type InstagramLookupErrorKind, instagramLookupErrorKind } from '@/lib/api/errors';
import { CanvasFloatingPanel } from './CanvasFloatingPanel';
import { InstagramPostGrid } from './InstagramPostGrid';
import { InstagramSlidePicker } from './InstagramSlidePicker';

const PAGE_SIZE = 10;

type Status = 'idle' | 'loading' | 'loaded' | 'error';

interface InstagramMediaBrowserProps {
  brandProfileId?: string;
  onPlace: (items: UnfurlMediaItem[]) => void;
  onClose: () => void;
}

const ERROR_COPY: Record<InstagramLookupErrorKind, string> = {
  account_required: 'Connect an Instagram business account to this brand to import from Instagram.',
  permission_denied:
    'Instagram refused this lookup for want of a permission on the connected account — reconnecting will not fix it. The Meta app\'s Instagram permissions have to be approved for this account.',
  rate_limited: 'Instagram is rate-limiting your account — nothing needs reconnecting, try again in a few minutes.',
  lookup_unavailable:
    'Instagram lookup is temporarily unavailable — reconnect the Instagram business account or try again shortly.',
  not_found: 'No public business or creator account was found for that username.',
  generic: "Couldn't load Instagram media. Please try again.",
};

const formatCount = (value: number | null): string | null => {
  if (value === null) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M followers`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K followers`;
  return `${value} followers`;
};

const normalizeHandle = (value: string): string => value.trim().replace(/^@+/, '');

export function InstagramMediaBrowser({
  brandProfileId,
  onPlace,
  onClose,
}: InstagramMediaBrowserProps) {
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<InstagramTopMediaResponse | null>(null);
  const [errorKind, setErrorKind] = useState<InstagramLookupErrorKind | null>(null);
  const [page, setPage] = useState(0);
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null);
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const hasAutoLoadedRef = useRef(false);

  // Loads media for a specific handle, or the brand's OWN account when handle is
  // undefined (auto-resolve). Shared by the auto-load on open and manual search.
  const runLoad = useCallback(
    async (handle: string | undefined) => {
      if (!brandProfileId) {
        setErrorKind('account_required');
        setStatus('error');
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('loading');
      setErrorKind(null);
      setResult(null);
      setSelectedPost(null);
      setPage(0);
      try {
        const response = await fetchInstagramTopMedia({
          brandId: brandProfileId,
          username: handle,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setResult(response);
        setStatus('loaded');
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        )
          return;
        setErrorKind(instagramLookupErrorKind(error));
        setStatus('error');
      }
    },
    [brandProfileId],
  );

  const handleSearch = useCallback(() => {
    const handle = normalizeHandle(username);
    if (!handle) return;
    void runLoad(handle);
  }, [username, runLoad]);

  // Auto-resolve the brand's own connected Instagram account on open, so the
  // user sees their posts immediately without typing a handle. The search box
  // stays available for looking up other accounts.
  useEffect(() => {
    if (hasAutoLoadedRef.current || !brandProfileId) return;
    hasAutoLoadedRef.current = true;
    void runLoad(undefined);
  }, [brandProfileId, runLoad]);

  const openPost = useCallback((post: InstagramPost) => {
    setSelectedPost(post);
    setSelectedSlides(new Set(post.items.map((_, index) => index)));
  }, []);

  const toggleSlide = useCallback((index: number) => {
    setSelectedSlides((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    if (!selectedPost) return;
    const items = selectedPost.items.filter((_, index) => selectedSlides.has(index));
    if (items.length === 0) return;
    onPlace(items);
    setSelectedPost(null);
  }, [selectedPost, selectedSlides, onPlace]);

  const followers = result ? formatCount(result.account.followersCount) : null;

  return (
    <CanvasFloatingPanel
      title="Import from Instagram"
      icon={<AtSign className="size-4" aria-hidden />}
      onClose={onClose}
      className="mt-12"
      bodyClassName="flex flex-col gap-3 p-4"
    >
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSearch();
        }}
      >
        <Input
          aria-label="Instagram username"
          placeholder="Search another account"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={status === 'loading'}
        />
        <Button type="submit" disabled={status === 'loading' || !username.trim()}>
          {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
        </Button>
      </form>

      {status === 'loading' && (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square rounded-md" />
          ))}
        </div>
      )}

      {status === 'error' && errorKind && (
        <p className="text-sm text-muted-foreground">{ERROR_COPY[errorKind]}</p>
      )}

      {status === 'loaded' && result && !selectedPost && (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">
              {result.account.name ?? `@${result.account.username}`}
            </span>
            {followers && <span className="text-xs text-muted-foreground">{followers}</span>}
          </div>
          {result.posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No media found for this account.</p>
          ) : (
            <InstagramPostGrid
              posts={result.posts}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              onSelect={openPost}
            />
          )}
        </>
      )}

      {selectedPost && (
        <InstagramSlidePicker
          post={selectedPost}
          selected={selectedSlides}
          onToggle={toggleSlide}
          onBack={() => setSelectedPost(null)}
          onAdd={handleAdd}
        />
      )}
    </CanvasFloatingPanel>
  );
}
