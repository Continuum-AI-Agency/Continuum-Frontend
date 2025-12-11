/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { Badge, Button, Callout, Card, Grid, ScrollArea, Text } from "@radix-ui/themes";
import * as HoverCard from "@radix-ui/react-hover-card";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";

import { useCreativeAssetBrowser } from "@/lib/creative-assets/useCreativeAssetBrowser";
import type { CreativeAsset } from "@/lib/creative-assets/types";
import { useAssetPreviewUrl } from "@/lib/creative-assets/useAssetPreviewUrl";

export type LibraryStripProps = {
  brandProfileId: string;
  medium: "image" | "video";
  onUse: (kind: "image-reference" | "first-frame" | "last-frame", asset: CreativeAsset) => Promise<void>;
};

export function LibraryStrip({ brandProfileId, medium, onUse }: LibraryStripProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const {
    assets,
    loading,
    error,
    refresh,
    uploadFiles,
  } = useCreativeAssetBrowser(brandProfileId);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (!files.length) return;
    await uploadFiles(files);
    await refresh();
  };

  return (
    <Card className="border border-white/10 bg-slate-900/80 shadow-lg">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Text className="text-white" weight="medium">Library</Text>
          <Badge size="1" variant="soft">{assets.length}</Badge>
        </div>
        <Button size="1" variant="surface" onClick={() => inputRef.current?.click()}>
          Upload
        </Button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
      </div>

      <ScrollArea className="max-h-[320px] px-3 pb-4">
        {error ? (
          <Callout.Root color="red" variant="soft" className="m-2">
            <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        ) : loading ? (
          <Text color="gray" className="px-2 py-1">Loading assets…</Text>
        ) : assets.length === 0 ? (
          <Text color="gray" className="px-2 py-1">No assets yet. Upload to seed generations.</Text>
        ) : (
          <Grid columns={{ initial: "2", sm: "4", md: "6" }} gap="2">
            {assets
              .filter((a) => a.kind === "file" && (a.contentType ?? "").startsWith("image/"))
              .map((asset) => (
                <HoverCard.Root key={asset.id} openDelay={80} closeDelay={60}>
                  <HoverCard.Trigger asChild>
                    <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                      <div className="h-20 w-full overflow-hidden rounded-md bg-black/40">
                        <AssetThumb asset={asset} />
                      </div>
                      <Text size="1" className="mt-1 block truncate text-white">{asset.name}</Text>
                      <div className="mt-1 flex items-center gap-1">
                        <Button size="1" variant="ghost" onClick={() => onUse("image-reference", asset)}>Seed</Button>
                        <Button size="1" variant="ghost" disabled={medium !== "video"} onClick={() => onUse("first-frame", asset)}>First</Button>
                        <Button size="1" variant="ghost" disabled={medium !== "video"} onClick={() => onUse("last-frame", asset)}>Last</Button>
                      </div>
                    </div>
                  </HoverCard.Trigger>
                  <AssetHoverPreview asset={asset} />
                </HoverCard.Root>
              ))}
          </Grid>
        )}
      </ScrollArea>
    </Card>
  );
}

function AssetThumb({ asset }: { asset: CreativeAsset }) {
  const { url, loading } = useAssetPreviewUrl(asset, { expiresInSeconds: 600 });
  if (loading) {
    return <div className="flex h-full w-full items-center justify-center text-white/60 text-xs">Loading…</div>;
  }
  return (
    <img
      src={url ?? asset.publicUrl ?? asset.fullPath}
      alt={asset.name}
      className="h-full w-full object-cover"
    />
  );
}

function AssetHoverPreview({ asset }: { asset: CreativeAsset }) {
  const { url, loading, canPreview } = useAssetPreviewUrl(asset, { expiresInSeconds: 600 });
  if (!canPreview) return null;
  return (
    <HoverCard.Content sideOffset={8} className="rounded-lg border border-white/10 bg-black p-2 shadow-xl">
      <div className="relative h-72 w-72 overflow-hidden rounded-md bg-black/40">
        {loading ? (
          <div className="flex h-full items-center justify-center text-white/60">Loading…</div>
        ) : asset.contentType?.startsWith("video/") ? (
          <video src={url ?? asset.publicUrl ?? asset.fullPath} muted playsInline controls className="h-full w-full object-contain" />
        ) : (
          <img src={url ?? asset.publicUrl ?? asset.fullPath} alt={asset.name} className="h-full w-full object-contain" />
        )}
      </div>
      <Text size="1" color="gray" className="mt-2 block truncate">{asset.name}</Text>
    </HoverCard.Content>
  );
}
