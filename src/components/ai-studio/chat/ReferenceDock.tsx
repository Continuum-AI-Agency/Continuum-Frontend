"use client";

import React from "react";
import { Badge, Button, Card, Flex, IconButton, ScrollArea, Text } from "@radix-ui/themes";
import Image from "next/image";
import { ImageIcon, TrashIcon, UploadIcon } from "@radix-ui/react-icons";
import { useDropzone, type FileRejection, type FileError } from "react-dropzone";
import type { RefImage } from "@/lib/types/chatImage";

import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/dropzone";
import { useToast } from "@/components/ui/ToastProvider";
import { CREATIVE_ASSET_DRAG_TYPE } from "@/lib/creative-assets/drag";
import { createSignedAssetUrl } from "@/lib/creative-assets/storageClient";

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
const TEXT_MIME = "text/plain";

export type LocalFile = File & { preview?: string; errors: readonly FileError[] };

export type DZReturn = ReturnType<typeof useDropzone> & {
  files: LocalFile[];
  setFiles: React.Dispatch<React.SetStateAction<LocalFile[]>>;
  successes: string[];
  isSuccess: boolean;
  loading: boolean;
  errors: { name: string; message: string }[];
  setErrors: React.Dispatch<React.SetStateAction<{ name: string; message: string }[]>>;
  onUpload: () => Promise<void>;
  maxFileSize: number;
  maxFiles: number;
  allowedMimeTypes: string[];
};

const useLocalDropzone = (
  opts: { maxFiles: number; allowedMimeTypes: string[]; maxFileSize: number },
  onAcceptUpload: (files: File[]) => Promise<void>
): DZReturn => {
  const [files, setFiles] = React.useState<LocalFile[]>([]);
  const [errors, setErrors] = React.useState<{ name: string; message: string }[]>([]);
  const [successes, setSuccesses] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  const dz = useDropzone({
    noClick: true,
    noDragEventsBubbling: false,
    maxFiles: opts.maxFiles,
    maxSize: opts.maxFileSize,
    multiple: opts.maxFiles !== 1,
    accept: opts.allowedMimeTypes.reduce<Record<string, string[]>>((acc, type) => ({ ...acc, [type]: [] }), {}),
    onDrop: (accepted, rejected) => {
      const acceptedWithMeta = accepted.map(file => ({
        ...(file as File),
        preview: URL.createObjectURL(file),
        errors: [] as readonly FileError[],
      })) as LocalFile[];

      const rejectedWithMeta = rejected.map(rej => ({
        ...(rej.file as File),
        preview: URL.createObjectURL(rej.file),
        errors: rej.errors as readonly FileError[],
      })) as LocalFile[];
      const next = [...files, ...acceptedWithMeta, ...rejectedWithMeta];
      setFiles(next);
      setErrors([
        ...errors,
        ...rejected.map((rej) => ({
          name: rej.file.name,
          message: rej.errors.map((e) => e.message).join(", "),
        })),
      ]);
    },
  });

  const onUpload = React.useCallback(async () => {
    setLoading(true);
    setErrors([]);
    await onAcceptUpload(files);
    setSuccesses(files.map((f) => f.name));
    setLoading(false);
    setFiles([]);
  }, [files, onAcceptUpload]);

  const isSuccess = errors.length === 0 && successes.length > 0;

  return {
    ...dz,
    files,
    setFiles,
    successes,
    isSuccess,
    loading,
    errors,
    setErrors,
    onUpload,
    maxFileSize: opts.maxFileSize,
    maxFiles: opts.maxFiles,
    allowedMimeTypes: opts.allowedMimeTypes,
  };
};

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
  const hasCreativePayload = React.useCallback((types: DataTransfer["types"]) => {
    const list = Array.from(types ?? []);
    return list.includes(CREATIVE_ASSET_DRAG_TYPE) || list.includes(RF_DRAG_MIME) || list.includes(TEXT_MIME);
  }, []);

  const fileToBase64 = React.useCallback((file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  }), []);

  const handleLocalFiles = React.useCallback(
    async (files: FileList | File[] | null, slot?: "first" | "last" | "video") => {
      if (!files || (Array.isArray(files) ? files.length === 0 : files.length === 0)) return;
      const fileArray = Array.isArray(files) ? files : Array.from(files);
      const max = slot ? 1 : maxRefs - refs.length;
      const slice = fileArray.slice(0, Math.max(1, max));

      for (const file of slice) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        if (slot === "video") {
          if (!isVideo) {
            show({ title: "Unsupported", description: "Reference video must be a video file", variant: "error" });
            continue;
          }
          if (file.size > 1_000_000) {
            show({ title: "Video too large", description: "Reference video must be under 1MB", variant: "error" });
            continue;
          }
          const base64 = await fileToBase64(file);
          onChangeReferenceVideo?.({
            id: `${file.name}-${Date.now()}`,
            name: file.name,
            mime: file.type || "video/mp4",
            base64,
            filename: file.name,
          });
          continue;
        }

        if (!isImage) {
          show({ title: "Unsupported", description: "Only image references are supported", variant: "error" });
          continue;
        }

        if (file.size > 750_000) {
          show({ title: "Image too large", description: "Reference images must be under 750KB", variant: "error" });
          continue;
        }

        if (!slot && refs.length >= maxRefs) {
          show({ title: "Reference limit", description: `Max ${maxRefs} reference images`, variant: "error" });
          break;
        }

        const base64 = await fileToBase64(file);
        const ref: RefImage = {
          id: `${file.name}-${Date.now()}`,
          name: file.name,
          path: file.name,
          mime: file.type || "image/png",
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
      }
    },
    [fileToBase64, maxRefs, mode, onChangeFirstFrame, onChangeLastFrame, onChangeReferenceVideo, onChangeRefs, refs, show]
  );

  const handleDrop = React.useCallback(
    async (event: React.DragEvent<HTMLDivElement>, slot?: "first" | "last" | "video") => {
      event.preventDefault();
      setIsDragging(false);

      const dataTransfer = event.dataTransfer;
      if (dataTransfer.files && dataTransfer.files.length > 0) {
        await handleLocalFiles(dataTransfer.files, slot);
        // don't return; allow creative payloads in same drop
      }
      const refPayload =
        dataTransfer.getData(CREATIVE_ASSET_DRAG_TYPE) ||
        dataTransfer.getData(RF_DRAG_MIME) ||
        dataTransfer.getData(TEXT_MIME);
      if (!refPayload) {
        if (!dataTransfer.files || dataTransfer.files.length === 0) {
          show({ title: "Drop ignored", description: "No asset data detected in drop.", variant: "warning" });
        }
        return;
      }

      try {
        type DragPayload =
          | { name: string; path: string; contentType?: string | null }
          | { type?: string; payload: { path?: string; publicUrl?: string; mimeType?: string } };

        let parsed: DragPayload | null = null;
        try {
          parsed = JSON.parse(refPayload) as DragPayload;
        } catch {
          parsed = null; // plain text or data URL
        }

        const path = parsed
          ? "path" in parsed
            ? parsed.path
            : (parsed as Extract<DragPayload, { payload: unknown }>).payload?.path
          : undefined;
        const mime = parsed
          ? "contentType" in parsed
            ? parsed.contentType ?? undefined
            : (parsed as Extract<DragPayload, { payload: unknown }>).payload?.mimeType
          : undefined;
        const publicUrl = parsed && "payload" in parsed ? (parsed as Extract<DragPayload, { payload: unknown }>).payload?.publicUrl : undefined;

        if (!path && !publicUrl && !refPayload.startsWith("data:")) {
          show({ title: "Drop failed", description: "Missing asset data", variant: "error" });
          return;
        }
        const resolvedMime =
          mime ??
          (refPayload.startsWith("data:video")
            ? "video/mp4"
            : refPayload.startsWith("data:image")
              ? "image/png"
              : "image/png");
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

        let signedUrl: string;
        try {
          signedUrl = publicUrl ?? (path ? await createSignedAssetUrl(path, 300) : refPayload);
        } catch (err) {
          show({ title: "Link failed", description: err instanceof Error ? err.message : "Could not sign asset URL", variant: "error" });
          return;
        }

        const base64 = refPayload.startsWith("data:")
          ? refPayload.split(",")[1] ?? ""
          : await fetchBase64(signedUrl);

        if (slot === "video") {
          const safeName = (path ?? signedUrl).split("/").pop() ?? path ?? "reference-video";
          onChangeReferenceVideo?.({
            id: `${path ?? safeName}-${Date.now()}`,
            name: safeName,
            mime: mime ?? "video/mp4",
            base64,
            filename: safeName,
          });
          return;
        }

        if (refs.length >= maxRefs && !slot) {
          show({ title: "Reference limit", description: `Max ${maxRefs} reference images`, variant: "error" });
          return;
        }

        const ref: RefImage = {
          id: `${path ?? signedUrl}-${Date.now()}`,
          name: (path ?? signedUrl).split("/").pop(),
          path: path ?? signedUrl,
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
    [handleLocalFiles, refs, maxRefs, mode, onChangeRefs, onChangeFirstFrame, onChangeLastFrame, onChangeReferenceVideo, show]
  );
  const tryHandleAssetDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>, slot?: "first" | "last" | "video") => {
      const dt = event.dataTransfer;
      const types = Array.from(dt.types ?? []);
      const hasFiles = types.includes("Files");
      const hasCreative = hasCreativePayload(dt.types);

      if (!hasCreative || hasFiles) return;

      event.preventDefault();
      event.stopPropagation();
      void handleDrop(event, slot);
    },
    [handleDrop, hasCreativePayload]
  );

  const refsDropzone = useLocalDropzone(
    { maxFiles: maxRefs, allowedMimeTypes: ["image/*"], maxFileSize: 750_000 },
    async (files) => handleLocalFiles(files, undefined)
  );
  const firstDropzone = useLocalDropzone(
    { maxFiles: 1, allowedMimeTypes: ["image/*"], maxFileSize: 750_000 },
    async (files) => handleLocalFiles(files, "first")
  );
  const lastDropzone = useLocalDropzone(
    { maxFiles: 1, allowedMimeTypes: ["image/*"], maxFileSize: 750_000 },
    async (files) => handleLocalFiles(files, "last")
  );
  const videoDropzone = useLocalDropzone(
    { maxFiles: 1, allowedMimeTypes: ["video/*"], maxFileSize: 1_000_000 },
    async (files) => handleLocalFiles(files, "video")
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
      onDrop={(e) => {
        const types = Array.from(e.dataTransfer.types ?? []);
        if (types.includes("Files") && !hasCreativePayload(e.dataTransfer.types)) return; // let dropzones handle pure file drops
        void handleDrop(e);
      }}
      onDropCapture={(e) => tryHandleAssetDrop(e)}
    >
      <Flex justify="between" align="center" className="mb-2">
        <Flex gap="2" align="center">
          <ImageIcon />
          <Text weight="medium">References</Text>
        </Flex>
        <Badge variant="soft" color="gray" size="2">{refs.length}</Badge>
      </Flex>

      <div
        onDropCapture={(e) => tryHandleAssetDrop(e)}
        onDragOverCapture={(e) => {
          const types = Array.from(e.dataTransfer.types ?? []);
          if (types.includes("Files") && !hasCreativePayload(e.dataTransfer.types)) return;
          e.preventDefault();
          setIsDragging(true);
        }}
      >
        <Dropzone {...refsDropzone} className="mb-3 w-full rounded-lg border border-dashed border-white/20 bg-white/5 p-3 text-white">
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
              {refs.length === 0 ? <Text size="1" color="gray">Drop or upload images.</Text> : null}
            </Flex>
          </ScrollArea>
          <DropzoneEmptyState />
          <DropzoneContent />
        </Dropzone>
      </div>

      {mode === "video" ? (
        <div className="grid grid-cols-3 gap-3">
          <FrameTile
            label="First frame"
            refImage={firstFrame}
            onDrop={(e) => void handleDrop(e, "first")}
            dropzoneProps={firstDropzone}
            onAssetDrop={(e) => tryHandleAssetDrop(e, "first")}
            onClear={() => onChangeFirstFrame?.()}
          />
          <FrameTile
            label="Last frame"
            refImage={lastFrame}
            onDrop={(e) => void handleDrop(e, "last")}
            dropzoneProps={lastDropzone}
            onAssetDrop={(e) => tryHandleAssetDrop(e, "last")}
            onClear={() => onChangeLastFrame?.()}
          />
          <VideoTile
            label="Reference video"
            refVideo={referenceVideo}
            onDrop={(e) => void handleDrop(e, "video")}
            dropzoneProps={videoDropzone}
            onAssetDrop={(e) => tryHandleAssetDrop(e, "video")}
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
    <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-1 backdrop-blur max-w-full">
      <Image
        src={`data:${refImage.mime};base64,${refImage.base64}`}
        alt={refImage.name ?? refImage.id}
        width={48}
        height={48}
        unoptimized
        className="h-10 w-10 sm:h-12 sm:w-12 rounded-md object-cover"
      />
      <Text size="1" className="truncate max-w-[140px] sm:max-w-[180px]">{refImage.name ?? "ref"}</Text>
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

function FrameTile({
  label,
  refImage,
  onDrop,
  onClear,
  dropzoneProps,
  onAssetDrop,
}: {
  label: string;
  refImage?: RefImage;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onClear: () => void;
  dropzoneProps: ReturnType<typeof useDropzone> & {
    files: LocalFile[];
    setFiles: React.Dispatch<React.SetStateAction<LocalFile[]>>;
    successes: string[];
    isSuccess: boolean;
    loading: boolean;
    errors: { name: string; message: string }[];
    setErrors: React.Dispatch<React.SetStateAction<{ name: string; message: string }[]>>;
    onUpload: () => Promise<void>;
    maxFileSize: number;
    maxFiles: number;
    allowedMimeTypes: string[];
  };
  onAssetDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="flex min-h-[128px] flex-col justify-between rounded-lg border border-dashed border-white/20 bg-white/5 p-2 backdrop-blur transition hover:border-white/40"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDropCapture={onAssetDrop}
    >
      <Text size="2" weight="medium">{label}</Text>
      {refImage ? (
        <div className="relative h-full min-h-[140px]">
          <Image
            src={`data:${refImage.mime};base64,${refImage.base64}`}
            alt={label}
            fill
            unoptimized
            sizes="(max-width: 640px) 80vw, 200px"
            className="rounded-md object-contain"
          />
          <Button size="1" color="red" variant="surface" className="absolute right-1 top-1" onClick={onClear}>Clear</Button>
        </div>
      ) : (
        <Dropzone {...dropzoneProps} className="h-full w-full rounded-md border border-dashed border-white/15 bg-white/5 text-white min-h-[140px]">
          <DropzoneEmptyState />
          <DropzoneContent />
        </Dropzone>
      )}
    </div>
  );
}

function VideoTile({
  label,
  refVideo,
  onDrop,
  onClear,
  dropzoneProps,
  onAssetDrop,
}: {
  label: string;
  refVideo?: { mime: string; base64: string; name?: string };
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onClear: () => void;
  dropzoneProps: ReturnType<typeof useDropzone> & {
    files: LocalFile[];
    setFiles: React.Dispatch<React.SetStateAction<LocalFile[]>>;
    successes: string[];
    isSuccess: boolean;
    loading: boolean;
    errors: { name: string; message: string }[];
    setErrors: React.Dispatch<React.SetStateAction<{ name: string; message: string }[]>>;
    onUpload: () => Promise<void>;
    maxFileSize: number;
    maxFiles: number;
    allowedMimeTypes: string[];
  };
  onAssetDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="flex min-h-[128px] flex-col justify-between rounded-lg border border-dashed border-white/20 bg-white/5 p-2 backdrop-blur transition hover:border-white/40"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDropCapture={onAssetDrop}
    >
      <Text size="2" weight="medium">{label}</Text>
      {refVideo ? (
        <div className="relative h-full min-h-[140px]">
          <video src={`data:${refVideo.mime};base64,${refVideo.base64}`} className="h-full w-full rounded-md object-contain" muted playsInline />
          <Button size="1" color="red" variant="surface" className="absolute right-1 top-1" onClick={onClear}>Clear</Button>
        </div>
      ) : (
        <Dropzone {...dropzoneProps} className="h-full w-full rounded-md border border-dashed border-white/15 bg-white/5 text-white min-h-[140px]">
          <DropzoneEmptyState />
          <DropzoneContent />
        </Dropzone>
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
