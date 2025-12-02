/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Flex,
  IconButton,
  ScrollArea,
  Separator,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import {
  ArchiveIcon,
  ChevronRightIcon,
  FileIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  UploadIcon,
  VideoIcon,
} from "@radix-ui/react-icons";

import { getCreativeAssetsBucket } from "@/lib/creative-assets/config";
import { useCreativeAssetBrowser } from "@/lib/creative-assets/useCreativeAssetBrowser";
import { createSignedAssetUrl } from "@/lib/creative-assets/storageClient";
import type { CreativeAsset } from "@/lib/creative-assets/types";
import { useToast } from "@/components/ui/ToastProvider";

const DRAG_MIME = "application/reactflow-node-data";

type CreativeLibrarySidebarProps = {
  brandProfileId: string;
  expandedWidth?: number;
};

export function CreativeLibrarySidebar({
  brandProfileId,
  expandedWidth = 360,
}: CreativeLibrarySidebarProps) {
  const { show } = useToast();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [query, setQuery] = React.useState("");
  const browser = useCreativeAssetBrowser(brandProfileId);
  const previewCache = React.useRef<Map<string, string>>(new Map());
  const [panelWidth, setPanelWidth] = React.useState(expandedWidth);
  const dragState = React.useRef<{ startX: number; startWidth: number } | null>(null);

  const filteredAssets = React.useMemo(() => {
    if (!query.trim()) return browser.assets;
    const q = query.toLowerCase();
    return browser.assets.filter((asset) => asset.name.toLowerCase().includes(q));
  }, [browser.assets, query]);

  const ensurePreviewUrl = React.useCallback(
    async (asset: CreativeAsset) => {
      if (previewCache.current.has(asset.fullPath)) {
        return previewCache.current.get(asset.fullPath)!;
      }
      try {
        const url = await createSignedAssetUrl(asset.fullPath, 120);
        previewCache.current.set(asset.fullPath, url);
        return url;
      } catch {
        try {
          const { getPublicAssetUrl } = await import("@/lib/creative-assets/storageClient");
          const publicUrl = await getPublicAssetUrl(asset.fullPath);
          previewCache.current.set(asset.fullPath, publicUrl);
          return publicUrl;
        } catch (error) {
          console.error("preview url resolution failed", error);
          return asset.fullPath;
        }
      }
    },
    []
  );

  const handleDragStart = React.useCallback(
    async (event: React.DragEvent<HTMLDivElement>, asset: CreativeAsset) => {
      event.dataTransfer.effectAllowed = "copy";
      const previewUrl = await ensurePreviewUrl(asset);
      const payload = {
        type: "asset_drop",
        payload: {
          source: "supabase",
          bucket: getCreativeAssetsBucket(),
          path: asset.fullPath,
          publicUrl: previewUrl,
          mimeType: asset.contentType ?? "application/octet-stream",
          meta: {
            size: asset.size ?? undefined,
            updatedAt: asset.updatedAt ?? undefined,
          },
        },
      };
      event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
      event.dataTransfer.setData("text/plain", previewUrl);
    },
    [ensurePreviewUrl]
  );

  const handleUpload = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? Array.from(event.target.files) : [];
      event.target.value = "";
      if (!files.length) return;
      try {
        await browser.uploadFiles(files);
        await browser.refresh();
        show({ title: "Upload complete", variant: "success" });
      } catch (error) {
        show({
          title: "Upload failed",
          description: (error as Error)?.message ?? "Could not upload files.",
          variant: "error",
        });
      }
    },
    [browser, show]
  );

  return (
    <>
      <div className="pointer-events-auto fixed right-4 top-1/2 z-40 -translate-y-1/2">
        <IconButton
          size="3"
          variant="solid"
          className="rounded-full border border-white/10 bg-slate-900/90 shadow-xl"
          onClick={() => setOpen(true)}
        >
          <ArchiveIcon />
        </IconButton>
      </div>

      <div className="pointer-events-none fixed right-0 top-0 z-50 h-full">
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="library"
              initial={{ x: expandedWidth, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: expandedWidth, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="pointer-events-auto h-full"
              style={{ width: panelWidth }}
            >
              <Box className="relative h-full rounded-l-2xl border border-white/10 bg-slate-950/85 shadow-2xl backdrop-blur-xl">
                <IconButton
                  size="2"
                  variant="ghost"
                  className="absolute right-3 top-3 rounded-full border border-white/15 bg-slate-900/90 shadow-lg"
                  onClick={() => setOpen(false)}
                  aria-label="Close library"
                >
                  <ChevronRightIcon className="rotate-180" />
                </IconButton>

                <div
                  className="absolute left-0 top-0 h-full w-2 cursor-col-resize"
                  onMouseDown={(e) => {
                    dragState.current = { startX: e.clientX, startWidth: panelWidth };
                    const onMove = (ev: MouseEvent) => {
                      if (!dragState.current) return;
                      const delta = dragState.current.startX - ev.clientX;
                      const next = Math.min(expandedWidth * 2, Math.max(expandedWidth, dragState.current.startWidth + delta));
                      setPanelWidth(next);
                    };
                    const onUp = () => {
                      dragState.current = null;
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                />

                <div className="flex h-full flex-col gap-3 p-3">
                  <Flex align="center" justify="between">
                    <Flex align="center" gap="2">
                      <ArchiveIcon />
                      <Text weight="medium">Creative Library</Text>
                    </Flex>
                    <Text color="gray" size="1">
                      {getCreativeAssetsBucket()}
                    </Text>
                  </Flex>

                  <Flex align="center" gap="2" className="flex-wrap">
                    <BreadcrumbTrail
                      items={browser.breadcrumbs}
                      onSelect={(path) => void browser.navigateTo(path)}
                    />
                    <Tooltip content="New folder">
                      <IconButton size="2" variant="soft" onClick={() => {
                        const name = window.prompt("New folder name?");
                        if (name) void browser.createFolder(name);
                      }}>
                        <ChevronRightIcon className="rotate-90" />
                      </IconButton>
                    </Tooltip>
                  </Flex>

                  <Flex gap="2" align="center">
                    <TextField.Root
                      size="2"
                      placeholder="Search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    >
                      <TextField.Slot>
                        <MagnifyingGlassIcon />
                      </TextField.Slot>
                    </TextField.Root>
                    <Tooltip content="Grid view">
                      <IconButton
                        variant={view === "grid" ? "solid" : "ghost"}
                        onClick={() => setView("grid")}
                      >
                        <ImageIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="List view">
                      <IconButton
                        variant={view === "list" ? "solid" : "ghost"}
                        onClick={() => setView("list")}
                      >
                        <FileIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="Upload">
                      <IconButton asChild variant="soft">
                        <label className="cursor-pointer">
                          <UploadIcon />
                          <input type="file" multiple className="hidden" onChange={handleUpload} />
                        </label>
                      </IconButton>
                    </Tooltip>
                  </Flex>

                  <Separator className="bg-white/10" />

                  <ScrollArea className="h-full rounded-xl border border-white/5 bg-white/5">
                    {browser.loading ? (
                      <div className="p-4 text-sm text-gray-300">Loading assets…</div>
                    ) : filteredAssets.length === 0 ? (
                      <div className="p-4 text-sm text-gray-400">No assets yet.</div>
                    ) : view === "grid" ? (
                      <div className="grid grid-cols-2 gap-3 p-3">
                        {filteredAssets.map((asset) => (
                          <AssetCard
                            key={asset.fullPath}
                            asset={asset}
                            onDragStart={handleDragStart}
                            onRename={browser.renameAssetPath}
                            onDelete={browser.deleteAssetPath}
                            resolvePreview={ensurePreviewUrl}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {filteredAssets.map((asset) => (
                          <AssetRow
                            key={asset.fullPath}
                            asset={asset}
                            onDragStart={handleDragStart}
                            onRename={browser.renameAssetPath}
                            onDelete={browser.deleteAssetPath}
                            onOpenFolder={browser.navigateInto}
                            resolvePreview={ensurePreviewUrl}
                          />
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </Box>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}

type AssetCardProps = {
  asset: CreativeAsset;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, asset: CreativeAsset) => void;
  onRename: (asset: CreativeAsset, nextName: string) => Promise<string>;
  onDelete: (asset: CreativeAsset) => Promise<void>;
  onOpenFolder?: (asset: CreativeAsset) => Promise<void>;
  resolvePreview: (asset: CreativeAsset) => Promise<string>;
};

function AssetCard({ asset, onDragStart, onRename, onDelete, onOpenFolder, resolvePreview }: AssetCardProps) {
  const isImage = asset.contentType?.startsWith("image/");
  const isVideo = asset.contentType?.startsWith("video/");
  const isFolder = asset.kind === "folder";
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (isFolder) return;
    resolvePreview(asset)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [asset, isFolder, resolvePreview]);

  return (
    <div
      className="group relative overflow-hidden rounded-lg border border-white/10 bg-slate-900/70 shadow-md"
      draggable={!isFolder}
      onDragStart={(e) => {
        if (!isFolder) onDragStart(e, asset);
      }}
      onDoubleClick={() => {
        if (isFolder && onOpenFolder) void onOpenFolder(asset);
      }}
    >
      <div className="relative aspect-square w-full bg-black/50">
        {isFolder ? (
          <div className="flex h-full items-center justify-center text-gray-200">
            <ArchiveIcon />
          </div>
        ) : isImage ? (
          <img src={previewUrl ?? asset.fullPath} alt={asset.name} className="h-full w-full object-cover" />
        ) : isVideo ? (
          <video
            ref={videoRef}
            src={previewUrl ?? asset.fullPath}
            muted
            playsInline
            loop
            className="h-full w-full object-cover group-hover:opacity-100 opacity-80"
            onMouseEnter={() => {
              if (videoRef.current) {
                void videoRef.current.play().catch(() => undefined);
              }
            }}
            onMouseLeave={() => {
              if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
              }
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <FileIcon />
          </div>
        )}
        {/* Simplified overlay to avoid double rendering */}
      </div>
      <div className="flex items-center justify-between px-2 py-1 text-xs text-gray-200">
        <span className="truncate">{asset.name}</span>
        <div className="flex items-center gap-2">
          {isVideo ? <PlayIcon className="h-3 w-3" /> : null}
          <IconButton
            size="1"
            variant="ghost"
            onClick={() => {
              const next = window.prompt("Rename asset", asset.name);
              if (next && next !== asset.name) void onRename(asset, next);
            }}
          >
            <ChevronRightIcon className="rotate-90" />
          </IconButton>
          <IconButton
            size="1"
            variant="ghost"
            color="red"
            onClick={() => void onDelete(asset)}
          >
            <FileIcon />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function AssetRow({ asset, onDragStart, onRename, onDelete, onOpenFolder, resolvePreview }: AssetCardProps) {
  const isImage = asset.contentType?.startsWith("image/");
  const isVideo = asset.contentType?.startsWith("video/");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (asset.kind === "folder") return;
    resolvePreview(asset)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [asset, resolvePreview]);
  return (
    <div
      className="flex cursor-grab items-center gap-3 px-3 py-2 hover:bg-white/5"
      draggable={asset.kind !== "folder"}
      onDragStart={(e) => {
        if (asset.kind !== "folder") onDragStart(e, asset);
      }}
      onDoubleClick={() => {
        if (asset.kind === "folder" && onOpenFolder) void onOpenFolder(asset);
      }}
    >
      <div className="h-10 w-10 overflow-hidden rounded-md bg-black/40">
        {isImage ? (
          <img src={previewUrl ?? asset.fullPath} alt={asset.name} className="h-full w-full object-cover" />
        ) : isVideo ? (
          <video
            ref={videoRef}
            src={previewUrl ?? asset.fullPath}
            muted
            playsInline
            className="h-full w-full object-cover"
            onMouseEnter={() => {
              if (videoRef.current) void videoRef.current.play().catch(() => undefined);
            }}
            onMouseLeave={() => {
              if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
              }
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <FileIcon />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Text size="2" className="truncate text-white">
          {asset.name}
        </Text>
        <Text size="1" color="gray">
          {asset.contentType ?? "unknown"} · {asset.size ? formatBytes(asset.size) : "size n/a"}
        </Text>
      </div>
      <div className="flex items-center gap-2">
        {asset.kind === "folder" ? <ArchiveIcon /> : isVideo ? <VideoIcon /> : isImage ? <ImageIcon /> : <FileIcon />}
        <IconButton
          size="1"
          variant="ghost"
          onClick={() => {
            if (asset.kind === "folder" && onOpenFolder) return void onOpenFolder(asset);
            const next = window.prompt("Rename", asset.name);
            if (next && next !== asset.name) void onRename(asset, next);
          }}
        >
          <ChevronRightIcon className="rotate-90" />
        </IconButton>
        <IconButton
          size="1"
          variant="ghost"
          color="red"
          onClick={() => void onDelete(asset)}
        >
          <FileIcon />
        </IconButton>
      </div>
    </div>
  );
}

type BreadcrumbTrailProps = {
  items: { label: string; path: string }[];
  onSelect: (path: string) => void;
};

function BreadcrumbTrail({ items, onSelect }: BreadcrumbTrailProps) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-gray-200">
      {items.map((crumb, index) => (
        <React.Fragment key={crumb.path ?? index}>
          <button
            type="button"
            className="rounded px-1 py-0.5 hover:bg-white/10"
            onClick={() => onSelect(crumb.path)}
          >
            {crumb.label || "Root"}
          </button>
          {index < items.length - 1 ? <span className="text-gray-500">/</span> : null}
        </React.Fragment>
      ))}
    </div>
  );
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** exponent;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}
