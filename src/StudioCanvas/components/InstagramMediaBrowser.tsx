"use client";

// Non-modal in-canvas Instagram media browser. Type a username, fetch the
// account's top media (Graph business_discovery), browse posts/reels/carousels
// 10 at a time, pick a post, then choose which slides to drop onto the canvas as
// unattached reference nodes. Replaces the old paste-a-link modal.

import { useCallback, useRef, useState } from "react";
import { Panel } from "@xyflow/react";
import { AtSign, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchInstagramTopMedia } from "@/lib/api/aiStudioInstagram.client";
import { ApiError } from "@/lib/api/errors";
import type { InstagramPost, InstagramTopMediaResponse, UnfurlMediaItem } from "@continuum/contracts";

import { InstagramPostGrid } from "./InstagramPostGrid";
import { InstagramSlidePicker } from "./InstagramSlidePicker";

const PAGE_SIZE = 10;

type Status = "idle" | "loading" | "loaded" | "error";
type ErrorKind = "viewer" | "not_found" | "generic";

interface InstagramMediaBrowserProps {
  brandProfileId?: string;
  onPlace: (items: UnfurlMediaItem[]) => void;
  onClose: () => void;
}

const ERROR_COPY: Record<ErrorKind, string> = {
  viewer:
    "Instagram lookup is unavailable for this brand. Connect an Instagram account (or ask an admin to set the global token).",
  not_found: "No public business or creator account was found for that username.",
  generic: "Couldn't load Instagram media. Please try again.",
};

const formatCount = (value: number | null): string | null => {
  if (value === null) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M followers`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K followers`;
  return `${value} followers`;
};

const normalizeHandle = (value: string): string => value.trim().replace(/^@+/, "");

const errorKindFor = (error: unknown): ErrorKind => {
  if (error instanceof ApiError) {
    if (error.code === "IG_VIEWER_UNAVAILABLE" || error.status === 409) return "viewer";
    if (error.code === "IG_ACCOUNT_NOT_FOUND" || error.status === 404) return "not_found";
  }
  return "generic";
};

export function InstagramMediaBrowser({ brandProfileId, onPlace, onClose }: InstagramMediaBrowserProps) {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<InstagramTopMediaResponse | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [page, setPage] = useState(0);
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null);
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const handleSearch = useCallback(async () => {
    const handle = normalizeHandle(username);
    if (!handle) return;
    if (!brandProfileId) {
      setErrorKind("viewer");
      setStatus("error");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setErrorKind(null);
    setResult(null);
    setSelectedPost(null);
    setPage(0);
    try {
      const response = await fetchInstagramTopMedia({ brandId: brandProfileId, username: handle, signal: controller.signal });
      if (controller.signal.aborted) return;
      setResult(response);
      setStatus("loaded");
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setErrorKind(errorKindFor(error));
      setStatus("error");
    }
  }, [username, brandProfileId]);

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
    <Panel position="top-left" className="nodrag nowheel mt-12">
      <Card className="w-[380px] gap-3 py-3 shadow-lg">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <AtSign className="h-4 w-4" />
              Import from Instagram
            </span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 px-4">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSearch();
            }}
          >
            <Input
              aria-label="Instagram username"
              placeholder="@username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={status === "loading"}
            />
            <Button type="submit" disabled={status === "loading" || !username.trim()}>
              {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </form>

          {status === "loading" && (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="aspect-square rounded-md" />
              ))}
            </div>
          )}

          {status === "error" && errorKind && <p className="text-sm text-muted-foreground">{ERROR_COPY[errorKind]}</p>}

          {status === "loaded" && result && !selectedPost && (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{result.account.name ?? `@${result.account.username}`}</span>
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
        </CardContent>
      </Card>
    </Panel>
  );
}
