"use client";

import React from "react";
import { Badge, Button, Card, Flex, IconButton, ScrollArea, Text } from "@radix-ui/themes";
import Image from "next/image";
import { ImageIcon, TrashIcon, UploadIcon } from "@radix-ui/react-icons";

import { useToast } from "@/components/ui/ToastProvider";
import { CREATIVE_ASSET_DRAG_TYPE } from "@/lib/creative-assets/drag";
import { createSignedAssetUrl } from "@/lib/creative-assets/storageClient";
import type { RefImage } from "@/lib/types/chatImage";

type ReferenceDockProps = {
  mode: "image" | "video";
  maxRefs: number;
  refs: RefImage[];
  firstFrame?: RefImage;
  lastFrame?: RefImage;
  referenceVideo?: { id: string; name?: string; mime: string; base64: string; filename?: string };
  onChangeRefs: (refs: RefImage[]) => void;
  onChangeFirstFrame?: (ref?: RefImage) => void;
  onChangeLastFrame?: (ref?: RefImage) => void;
  onChangeReferenceVideo?: (ref?: { id: string; name?: string; mime: string; base64: string; filename?: string }) => void;
};

const RF_DRAG_MIME = "application/reactflow-node-data";

export function ReferenceDock({
  mode,
  maxRefs,
  refs,
  firstFrame,
  lastFrame,
  referenceVideo,
  onChangeRefs,
  onChangeFirstFrame,
  onChangeLastFrame,
  onChangeReferenceVideo,
}: ReferenceDockProps) {
  const { show } = useToast();
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDrop = React.useCallback(
    async (event: React.DragEvent<HTMLDivElement>, slot?: "first" | "last" | "video") => {
      event.preventDefault();
      setIsDragging(false);

      const dataTransfer = event.dataTransfer;
      const refPayload = dataTransfer.getData(CREATIVE_ASSET_DRAG_TYPE) || dataTransfer.getData(RF_DRAG_MIME);
      if (!refPayload) return;

      try {
        type DragPayload =
          | { name: string; path: string; contentType?: string | null }
          | { type?: string; payload?: { path?: string; publicUrl?: string; mimeType?: string } };

        const parsed = JSON.parse(refPayload) as DragPayload;

        const path = "path" in parsed ? parsed.path : parsed.payload?.path;
        const mime = "contentType" in parsed ? parsed.contentType : parsed.payload?.mimeType;
        const publicUrl = "payload" in parsed ? parsed.payload?.publicUrl : undefined;

        if (!path) {
          show({ title: "Drop failed", description: "Missing asset path", variant: "error" });
          return;
        }
        const resolvedMime = mime ?? "image/png";
        const isImage = /^image\//i.test(resolvedMime);
        const isVideo = /^video\//i.test(resolvedMime);

        if (slot === "video") {
          if (!isVideo) {
            show({ title: "Unsupported", description: "Reference video must be a video file", variant: "error" });
            return;
          }
        } else if (!isImage) {
          show({ title: "Unsupported", description: "Only image references are supported", variant: "error" });
          return;
        }

        const signedUrl = publicUrl ?? (await createSignedAssetUrl(path, 300));
        const base64 = await fetchBase64(signedUrl);

        if (slot === "video") {
          onChangeReferenceVideo?.({ id: `${path}-${Date.now()}`, name: path.split("/").pop(), mime, base64, filename: path.split("/").pop() });
          return;
        }

        if (refs.length >= maxRefs && !slot) {
          show({ title: "Reference limit", description: `Max ${maxRefs} reference images`, variant: "error" });
          return;
        }

        const ref: RefImage = {
          id: `${path}-${Date.now()}`,
          name: path.split("/").pop(),
          path,
          mime: resolvedMime,
          base64,
          referenceType: mode === "video" ? "asset" : undefined,
        };

        if (slot === "first") {
          onChangeFirstFrame?.(ref);
        } else if (slot === "last") {
          onChangeLastFrame?.(ref);
        } else {
          onChangeRefs([...refs, ref]);
        }
      } catch (error) {
        console.error(error);
        show({ title: "Failed to add reference", description: error instanceof Error ? error.message : "Unknown error", variant: "error" });
      }
    },
    [refs, maxRefs, mode, onChangeRefs, onChangeFirstFrame, onChangeLastFrame, onChangeReferenceVideo, show]
  );

  return (
    <Card
      size="3"
      className={`p-4 shadow-xl transition min-h-[220px] ${isDragging ? "ring-2 ring-offset-2 ring-offset-[var(--color-panel)] ring-[var(--accent-9)]" : ""}`}
      style={{
        backgroundColor: "var(--color-surface)",
        border: `1px solid var(--gray-6)`
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => void handleDrop(e)}
    >
      <Flex justify="between" align="center" className="mb-3">
        <Flex gap="2" align="center">
          <ImageIcon />
          <Text weight="medium">References</Text>
        </Flex>
        <Badge variant="soft" color="gray" size="2">{refs.length} images</Badge>
      </Flex>

      <ScrollArea type="always" scrollbars="horizontal" className="mb-3">
        <Flex gap="2" wrap="wrap">
          {refs.map((ref) => (
            <RefChip
              key={ref.id}
              refImage={ref}
              allowReferenceType={mode === "video"}
              onTypeChange={(type) => onChangeRefs(refs.map((r) => (r.id === ref.id ? { ...r, referenceType: type } : r)))}
              onRemove={() => onChangeRefs(refs.filter((r) => r.id !== ref.id))}
            />
          ))}
          {refs.length === 0 ? (
            <Text size="1" color="gray">Drop reference images here.</Text>
          ) : null}
        </Flex>
      </ScrollArea>

      {mode === "video" ? (
        <div className="grid grid-cols-3 gap-3">
          <FrameTile label="First frame" refImage={firstFrame} onDrop={(e) => void handleDrop(e, "first")} onClear={() => onChangeFirstFrame?.()} />
          <FrameTile label="Last frame" refImage={lastFrame} onDrop={(e) => void handleDrop(e, "last")} onClear={() => onChangeLastFrame?.()} />
          <VideoTile
            label="Reference video"
            refVideo={referenceVideo}
            onDrop={(e) => void handleDrop(e, "video")}
            onClear={() => onChangeReferenceVideo?.()}
          />
        </div>
      ) : null}

      <Flex gap="2" className="mt-3" align="center">
        <UploadIcon />
        <Text size="1" color="gray">Drag from Creative Library to seed your generation.</Text>
      </Flex>
    </Card>
  );
}

function RefChip({ refImage, onRemove, allowReferenceType, onTypeChange }: { refImage: RefImage; onRemove: () => void; allowReferenceType?: boolean; onTypeChange?: (type: "asset" | "style") => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-1 backdrop-blur">
      <Image
        src={`data:${refImage.mime};base64,${refImage.base64}`}
        alt={refImage.name ?? refImage.id}
        width={32}
        height={32}
        unoptimized
        className="h-8 w-8 rounded-md object-cover"
      />
      <Text size="1" className="truncate max-w-[120px]">{refImage.name ?? "ref"}</Text>
      {allowReferenceType ? (
        <select
          className="rounded border border-white/15 bg-slate-900/80 text-xs"
          value={refImage.referenceType ?? "asset"}
          onChange={(e) => onTypeChange?.(e.target.value as "asset" | "style")}
        >
          <option value="asset">asset</option>
          <option value="style">style</option>
        </select>
      ) : null}
      <IconButton size="1" variant="ghost" color="red" onClick={onRemove}>
        <TrashIcon />
      </IconButton>
    </div>
  );
}

function FrameTile({ label, refImage, onDrop, onClear }: { label: string; refImage?: RefImage; onDrop: (e: React.DragEvent<HTMLDivElement>) => void; onClear: () => void }) {
  return (
    <div
      className="flex h-32 flex-col justify-between rounded-lg border border-white/15 bg-white/5 p-2 backdrop-blur"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <Text size="2" weight="medium">{label}</Text>
      {refImage ? (
        <div className="relative h-full">
          <Image
            src={`data:${refImage.mime};base64,${refImage.base64}`}
            alt={label}
            fill
            unoptimized
            sizes="128px"
            className="rounded-md object-cover"
          />
          <Button size="1" color="red" variant="surface" className="absolute right-1 top-1" onClick={onClear}>Clear</Button>
        </div>
      ) : (
        <Flex className="h-full" align="center" justify="center">
          <Text size="1" color="gray">Drop image</Text>
        </Flex>
      )}
    </div>
  );
}

function VideoTile({ label, refVideo, onDrop, onClear }: { label: string; refVideo?: { mime: string; base64: string; name?: string }; onDrop: (e: React.DragEvent<HTMLDivElement>) => void; onClear: () => void }) {
  return (
    <div
      className="flex h-32 flex-col justify-between rounded-lg border border-white/15 bg-white/5 p-2 backdrop-blur"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <Text size="2" weight="medium">{label}</Text>
      {refVideo ? (
        <div className="relative h-full">
          <video src={`data:${refVideo.mime};base64,${refVideo.base64}`} className="h-full w-full rounded-md object-cover" muted />
          <Button size="1" color="red" variant="surface" className="absolute right-1 top-1" onClick={onClear}>Clear</Button>
        </div>
      ) : (
        <Flex className="h-full" align="center" justify="center">
          <Text size="1" color="gray">Drop mp4</Text>
        </Flex>
      )}
    </div>
  );
}

async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch asset: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
