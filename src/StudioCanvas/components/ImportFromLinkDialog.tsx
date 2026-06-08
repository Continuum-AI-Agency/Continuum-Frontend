"use client";

import React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { unfurlMediaFromUrl } from "@/lib/api/aiStudioUnfurl.client";
import type { UnfurlMediaItem, UnfurlMediaResponse } from "@continuum/contracts";

type Status = "idle" | "loading" | "loaded" | "error";

interface ImportFromLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlace: (items: UnfurlMediaItem[]) => void;
}

export function ImportFromLinkDialog({ open, onOpenChange, onPlace }: ImportFromLinkDialogProps) {
  const [url, setUrl] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [result, setResult] = React.useState<UnfurlMediaResponse | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  const reset = React.useCallback(() => {
    setStatus("idle");
    setResult(null);
    setSelected(new Set());
    setError(null);
  }, []);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        setUrl("");
        reset();
      }
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  const handleFetch = React.useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setStatus("loading");
    setError(null);
    setResult(null);
    try {
      const response = await unfurlMediaFromUrl(trimmed);
      setResult(response);
      setSelected(new Set(response.items.map((_, index) => index)));
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unfurl link");
      setStatus("error");
    }
  }, [url]);

  const toggle = React.useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const items = result?.items ?? [];
  const selectedItems = items.filter((_, index) => selected.has(index));

  const handlePlace = () => {
    if (selectedItems.length === 0) return;
    onPlace(selectedItems);
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from link</DialogTitle>
          <DialogDescription>
            Paste a link to a post (LinkedIn, a blog, a public profile). We&apos;ll pull its images and
            video onto the canvas as references.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleFetch();
          }}
        >
          <Input
            aria-label="Link URL"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={status === "loading"}
          />
          <Button type="button" onClick={() => void handleFetch()} disabled={status === "loading" || !url.trim()}>
            {status === "loading" ? "Fetching…" : "Fetch"}
          </Button>
        </form>

        {status === "error" && (
          <p className="text-sm text-danger">Couldn&apos;t extract media from this link. {error}</p>
        )}

        {result?.partial && result.notice && (
          <p className="text-xs text-muted-foreground">{result.notice}</p>
        )}

        {status === "loaded" && items.length === 0 && (
          <p className="text-sm text-muted-foreground">No media found at this link.</p>
        )}

        {items.length > 0 && (
          <div className="grid max-h-[320px] grid-cols-3 gap-3 overflow-y-auto">
            {items.map((item, index) => {
              const isSelected = selected.has(index);
              return (
                <button
                  key={`${item.url}-${index}`}
                  type="button"
                  aria-label={`Toggle media ${index + 1}`}
                  aria-pressed={isSelected}
                  onClick={() => toggle(index)}
                  className={`relative aspect-square overflow-hidden rounded-md border transition ${
                    isSelected ? "ring-2 ring-primary" : "opacity-50"
                  }`}
                >
                  {item.kind === "video" ? (
                    <video src={item.url} className="h-full w-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.alt ?? "imported media"} className="h-full w-full object-cover" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePlace} disabled={selectedItems.length === 0}>
            Add {selectedItems.length || ""} to canvas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
