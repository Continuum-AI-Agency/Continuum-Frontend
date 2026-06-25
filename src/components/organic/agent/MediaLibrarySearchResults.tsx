"use client";

import Image from "next/image";
import { Images } from "lucide-react";
import { Badge } from "@radix-ui/themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MediaSearchResultsFrame } from "@continuum/contracts";

type SearchResultItem = MediaSearchResultsFrame["data"]["items"][number];

function SimilarityBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "green" : pct >= 60 ? "blue" : "gray";
  return (
    <Badge variant="soft" color={color} size="1">
      {pct}% match
    </Badge>
  );
}

function MediaThumbnail({ item }: { item: SearchResultItem }) {
  const url = item.asset.signedUrl ?? item.asset.thumbnailUrl;
  if (url) {
    return (
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
        <Image
          src={url}
          alt={item.asset.title ?? "Media asset"}
          fill
          className="object-cover"
          sizes="64px"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted">
      <Images className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

function MediaResultRow({
  item,
  onUse,
  disabled,
}: {
  item: SearchResultItem;
  onUse: (item: SearchResultItem) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/50 p-2">
      <MediaThumbnail item={item} />

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
          {item.asset.title && (
            <span className="truncate text-xs font-medium text-foreground">{item.asset.title}</span>
          )}
          <SimilarityBadge value={item.similarity} />
        </div>

        {item.asset.description && (
          <p className="mb-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {item.asset.description}
          </p>
        )}

        {item.asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.asset.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="outline" size="1" color="gray">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0 text-xs"
        disabled={disabled}
        onClick={() => onUse(item)}
      >
        Use
      </Button>
    </div>
  );
}

export function MediaLibrarySearchResults({
  frame,
  onUseAsset,
  disabled,
}: {
  frame: MediaSearchResultsFrame;
  onUseAsset: (item: SearchResultItem) => void;
  disabled?: boolean;
}) {
  const { query, items } = frame.data;

  return (
    <Card className="overflow-hidden border-blue-400/30">
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5">
          <Images className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-sm font-medium text-foreground">Media library</span>
          {query && (
            <span className="truncate text-xs text-muted-foreground">
              &ldquo;{query}&rdquo;
            </span>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No matching assets found.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <MediaResultRow
                key={item.asset.id}
                item={item}
                disabled={disabled}
                onUse={(picked) => onUseAsset(picked)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
