"use client";

import { useState, useEffect } from "react";
import { Copy, Check, X, Loader2, ImageOff, Layers, FolderPlus } from "lucide-react";
import type { MediaAsset, MediaCollection, MediaSearchResultItem } from "@continuum/contracts";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MediaBoundingBoxes } from "./MediaBoundingBoxes";

type Props = {
  asset: MediaAsset | null;
  onClose: () => void;
  brandId: string;
  collections: MediaCollection[];
};

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      {label && <span>{label}</span>}
    </button>
  );
}

function AddToCollection({
  brandId,
  assetId,
  collections,
}: {
  brandId: string;
  assetId: string;
  collections: MediaCollection[];
}) {
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  async function addTo(collectionId: string) {
    setPending(collectionId);
    try {
      const resp = await fetch("/api/library/collections/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, collectionId, assetId }),
      });
      if (resp.ok) setAdded((prev) => new Set(prev).add(collectionId));
    } catch (err) {
      console.error("[MediaDetailDialog] add to collection failed", err);
    } finally {
      setPending(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs transition-colors hover:bg-accent active:scale-[0.96] [transition-property:scale,background-color]"
        >
          <FolderPlus className="size-3.5" />
          Add to collection
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
        {collections.length === 0 ? (
          <DropdownMenuItem disabled>No collections yet</DropdownMenuItem>
        ) : (
          collections.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onSelect={(e) => {
                e.preventDefault();
                void addTo(c.id);
              }}
              className="flex items-center justify-between gap-3"
            >
              <span className="truncate">{c.name}</span>
              {pending === c.id ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : added.has(c.id) ? (
                <Check className="size-3.5 shrink-0 text-emerald-500" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SimilarResults({ items }: { items: MediaSearchResultItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No similar assets found. Visual similarity unlocks once image embeddings populate.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ asset }) => (
        <div key={asset.id} className="aspect-square overflow-hidden rounded-lg bg-muted">
          {asset.signedUrl ? (
            <img
              src={asset.signedUrl}
              alt={asset.title ?? asset.fileName}
              className="size-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ImageOff className="size-5 text-muted-foreground/40" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function MediaDetailDialog({ asset, onClose, brandId, collections }: Props) {
  const [similarItems, setSimilarItems] = useState<MediaSearchResultItem[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [showBboxes, setShowBboxes] = useState(false);

  useEffect(() => {
    if (!asset || !asset.hasImageEmbedding) {
      setSimilarItems([]);
      return;
    }
    setLoadingSimilar(true);
    fetch("/api/library/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, mode: "similar", similarToAssetId: asset.id, limit: 6 }),
    })
      .then((r) => r.json())
      .then((data: { items?: MediaSearchResultItem[] }) => setSimilarItems(data.items ?? []))
      .catch((err: unknown) => console.error("[MediaDetailDialog] similar search failed", err))
      .finally(() => setLoadingSimilar(false));
  }, [asset, brandId]);

  return (
    <Dialog open={asset != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0"
      >
        <div className="flex flex-row items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
          <DialogTitle className="truncate text-base text-balance">
            {asset?.title ?? asset?.fileName ?? "Media detail"}
          </DialogTitle>
          <div className="flex items-center gap-2">
            {asset && (
              <AddToCollection brandId={brandId} assetId={asset.id} collections={collections} />
            )}
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {asset && (
            <div className="flex flex-col gap-5 p-4">
              <div className="relative overflow-hidden rounded-xl bg-muted">
                {asset.signedUrl ? (
                  asset.kind === "video" ? (
                    <video src={asset.signedUrl} controls className="max-h-64 w-full object-contain" />
                  ) : (
                    <>
                      <img
                        src={asset.signedUrl}
                        alt={asset.title ?? asset.fileName}
                        className="max-h-64 w-full object-contain"
                      />
                      {showBboxes && asset.detectedObjects.length > 0 && (
                        <MediaBoundingBoxes objects={asset.detectedObjects} />
                      )}
                    </>
                  )
                ) : (
                  <div className="flex h-48 items-center justify-center">
                    <ImageOff className="size-10 text-muted-foreground/40" />
                  </div>
                )}

                {asset.detectedObjects.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowBboxes((v) => !v)}
                    className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs text-white backdrop-blur-sm hover:bg-black/80"
                  >
                    <Layers className="size-3" />
                    {showBboxes ? "Hide objects" : "Show objects"}
                  </button>
                )}
              </div>

              {asset.description && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Description
                    </span>
                    <CopyButton text={asset.description} label="Copy" />
                  </div>
                  <p className="text-sm leading-relaxed text-pretty">{asset.description}</p>
                </div>
              )}

              {asset.tags.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tags
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {asset.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {asset.detectedObjects.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Detected objects
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {asset.detectedObjects.map((obj, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {obj.label}
                        {typeof obj.confidence === "number" && ` (${Math.round(obj.confidence * 100)}%)`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Find similar
                </span>
                {loadingSimilar ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Searching…
                  </div>
                ) : (
                  <SimilarResults items={similarItems} />
                )}
              </div>

              <Separator />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {asset.width && asset.height && (
                  <>
                    <dt className="text-muted-foreground">Dimensions</dt>
                    <dd className="tabular-nums">
                      {asset.width} × {asset.height}
                    </dd>
                  </>
                )}
                {asset.sizeBytes != null && (
                  <>
                    <dt className="text-muted-foreground">Size</dt>
                    <dd className="tabular-nums">{(asset.sizeBytes / 1024).toFixed(1)} KB</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{asset.status.replace("_", " ")}</dd>
                <dt className="text-muted-foreground">Uploaded</dt>
                <dd className="tabular-nums">{new Date(asset.createdAt).toLocaleDateString()}</dd>
              </dl>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
