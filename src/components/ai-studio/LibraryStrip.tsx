/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { Badge, Button, Callout, Card, Grid, ScrollArea, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";

import { useCreativeAssetBrowser } from "@/lib/creative-assets/useCreativeAssetBrowser";
import type { CreativeAsset } from "@/lib/creative-assets/types";

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
                <div key={asset.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="h-20 w-full overflow-hidden rounded-md bg-black/40">
                    <img src={asset.publicUrl ?? asset.fullPath} alt={asset.name} className="h-full w-full object-cover" />
                  </div>
                  <Text size="1" className="mt-1 block truncate text-white">{asset.name}</Text>
                  <div className="mt-1 flex items-center gap-1">
                    <Button size="1" variant="ghost" onClick={() => onUse("image-reference", asset)}>Seed</Button>
                    <Button size="1" variant="ghost" disabled={medium !== "video"} onClick={() => onUse("first-frame", asset)}>First</Button>
                    <Button size="1" variant="ghost" disabled={medium !== "video"} onClick={() => onUse("last-frame", asset)}>Last</Button>
                  </div>
                </div>
              ))}
          </Grid>
        )}
      </ScrollArea>
    </Card>
  );
}
