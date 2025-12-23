/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Button,
  Flex,
  IconButton,
  ScrollArea,
  Separator,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import * as HoverCard from "@radix-ui/react-hover-card";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  ArchiveIcon,
  ChevronRightIcon,
  FileIcon,
  MagnifyingGlassIcon,
  UploadIcon,
  VideoIcon,
} from "@radix-ui/react-icons";

import { getCreativeAssetsBucket } from "@/lib/creative-assets/config";
import { useCreativeAssetBrowser } from "@/lib/creative-assets/useCreativeAssetBrowser";
import {
  createSignedAssetUrl,
  createSignedDownloadUrl,
  getPublicAssetDownloadUrl,
  listCreativeAssets,
  createCreativeFolder,
} from "@/lib/creative-assets/storageClient";
import type { CreativeAsset } from "@/lib/creative-assets/types";
import { useToast } from "@/components/ui/ToastProvider";
import { CREATIVE_ASSET_DRAG_TYPE } from "@/lib/creative-assets/drag";

const DRAG_MIME = "application/reactflow-node-data";
const FOLDER_CACHE_LIMIT = 20;

type CreativeLibrarySidebarProps = {
  brandProfileId: string;
  expandedWidth?: number;
};

export function CreativeLibrarySidebar({
  brandProfileId,
  expandedWidth = 540,
}: CreativeLibrarySidebarProps) {
  const { show } = useToast();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const browser = useCreativeAssetBrowser(brandProfileId);
  const previewCache = React.useRef<Map<string, string>>(new Map());
  const folderCache = React.useRef<Map<string, CreativeAsset[]>>(new Map());
  const folderCacheOrder = React.useRef<string[]>([]);
  const [panelWidth, setPanelWidth] = React.useState(expandedWidth);
  const dragState = React.useRef<{ startX: number; startWidth: number } | null>(null);
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(() => new Set());
  const [isDraggingAsset, setIsDraggingAsset] = React.useState(false);

  React.useEffect(() => {
    const endDrag = () => setIsDraggingAsset(false);
    window.addEventListener("dragend", endDrag);
    window.addEventListener("drop", endDrag);
    return () => {
      window.removeEventListener("dragend", endDrag);
      window.removeEventListener("drop", endDrag);
    };
  }, []);

  const filteredAssets = React.useMemo(() => {
    if (!query.trim()) return browser.assets;
    const q = query.toLowerCase();
    return browser.assets.filter((asset) => asset.name.toLowerCase().includes(q));
  }, [browser.assets, query]);

  const createFolderAt = React.useCallback(
    async (name: string, parentPath: string) => {
      try {
        await createCreativeFolder(brandProfileId, parentPath, name);
        const listing = await listCreativeAssets(brandProfileId, parentPath);
        folderCache.current.set(parentPath, listing.assets);
        folderCacheOrder.current.push(parentPath);
        while (folderCacheOrder.current.length > FOLDER_CACHE_LIMIT) {
          const oldest = folderCacheOrder.current.shift();
          if (oldest) folderCache.current.delete(oldest);
        }
        await browser.refresh();
        show({ title: "Folder created", variant: "success" });
      } catch (error) {
        show({
          title: "Folder creation failed",
          description: (error as Error)?.message ?? "Could not create folder",
          variant: "error",
        });
      }
    },
    [brandProfileId, browser, show]
  );

  const ensurePreviewUrl = React.useCallback(
    async (asset: CreativeAsset) => {
      if (previewCache.current.has(asset.fullPath)) {
        return previewCache.current.get(asset.fullPath)!;
      }
      try {
        const url = await createSignedAssetUrl(asset.fullPath, 600);
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
    (event: React.DragEvent<HTMLDivElement>, asset: CreativeAsset) => {
      event.dataTransfer.effectAllowed = "copy";
      setIsDraggingAsset(true);

      const cachedPreview = previewCache.current.get(asset.fullPath);
      const payload = {
        type: "asset_drop",
        payload: {
          source: "supabase",
          bucket: getCreativeAssetsBucket(),
          path: asset.fullPath,
          publicUrl: cachedPreview,
          mimeType: asset.contentType ?? "application/octet-stream",
          meta: {
            size: asset.size ?? undefined,
            updatedAt: asset.updatedAt ?? undefined,
          },
        },
      };

      event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
      event.dataTransfer.setData(
        CREATIVE_ASSET_DRAG_TYPE,
        JSON.stringify({ name: asset.name, path: asset.fullPath, contentType: asset.contentType })
      );
      event.dataTransfer.setData("text/plain", cachedPreview ?? asset.fullPath);

      if (!cachedPreview) {
        void ensurePreviewUrl(asset).then((url) => previewCache.current.set(asset.fullPath, url));
      }
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
          color="gray"
          highContrast
          aria-label="Open creative library"
          className="rounded-full shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          onClick={() => setOpen(true)}
        >
          <ArchiveIcon />
        </IconButton>
      </div>

      <div
        className={`fixed inset-0 z-50 flex justify-end ${
          open ? (isDraggingAsset ? "pointer-events-none" : "pointer-events-auto") : "pointer-events-none"
        }`}
        onClick={() => {
          if (open && !isDraggingAsset) setOpen(false);
        }}
      >
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
              <>
                <div className="flex-1" />
                <Box
                  className="relative h-full rounded-l-2xl border border-white/10 bg-slate-950/85 shadow-2xl backdrop-blur-xl"
                  onClick={(event) => event.stopPropagation()}
                >
                <IconButton
                  size="2"
                  variant="ghost"
                  className="absolute right-3 top-3 rounded-full border border-white/15 bg-slate-900/90 shadow-lg"
                  onClick={() => setOpen(false)}
                  aria-label="Close library"
                >
                    <ChevronRightIcon className="rotate-180 text-white" />
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
                <ChevronRightIcon className="rotate-90 text-white" />
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
                    <Tooltip content="Upload">
                      <IconButton asChild variant="soft">
                        <label className="cursor-pointer">
                          <UploadIcon />
                          <input type="file" multiple className="hidden" onChange={handleUpload} />
                        </label>
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="New folder">
                      <IconButton
                        variant="soft"
                        onClick={() => {
                          const name = window.prompt("New folder name?");
                          if (name) void createFolderAt(name, "");
                        }}
                      >
                        <ArchiveIcon />
                      </IconButton>
                    </Tooltip>
                  </Flex>

                  <Separator className="bg-white/10" />

                  <ScrollArea className="h-full rounded-xl border border-white/5 bg-black/75">
                    {browser.loading ? (
                      <div className="p-4 text-sm text-gray-300">Loading assets…</div>
                    ) : filteredAssets.length === 0 ? (
                      <div className="p-4 text-sm text-gray-400">No assets yet.</div>
                    ) : (
                      <div className="p-2">
                        <TreeList
                          brandProfileId={brandProfileId}
                          assets={filteredAssets}
                          depth={0}
                          expandedPaths={expandedPaths}
                          setExpandedPaths={setExpandedPaths}
                          resolvePreview={ensurePreviewUrl}
                          onRename={browser.renameAssetPath}
                          onDelete={browser.deleteAssetPath}
                          onDragStart={handleDragStart}
                          onCreateFolder={createFolderAt}
                          folderCache={folderCache}
                          folderCacheOrder={folderCacheOrder}
                        />
                      </div>
                    )}
                  </ScrollArea>
                </div>
                </Box>
              </>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </>
  );
}

function SidebarHoverContent({
  asset,
  resolvePreview,
  open,
}: {
  asset: CreativeAsset;
  resolvePreview: (asset: CreativeAsset) => Promise<string>;
  open: boolean;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const isVideo = asset.contentType?.startsWith("video/");
  const isImage = asset.contentType?.startsWith("image/");
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!open) return () => { cancelled = true; };
    setLoading(true);
    resolvePreview(asset)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset, resolvePreview, open]);

  return (
    <HoverCard.Content sideOffset={10} className="rounded-lg border border-white/10 bg-slate-900/90 p-2 shadow-xl">
      <div className="relative h-64 w-64 overflow-hidden rounded-md bg-black/60">
        {loading ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            Loading…
          </div>
        ) : isVideo ? (
          <video
            src={url ? `${url}#t=0.01` : undefined}
            ref={videoRef}
            preload="metadata"
            muted
            playsInline
            controls
            className="h-full w-full object-contain"
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v) v.currentTime = 0.01;
            }}
          />
        ) : isImage ? (
          <img src={url ?? asset.fullPath} alt={asset.name} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-200">
            <FileIcon />
          </div>
        )}
      </div>
      <Text size="2" weight="medium" className="mt-2 block truncate text-white">
        {asset.name}
      </Text>
      <Text size="1" color="gray">
        {asset.contentType ?? "file"}
      </Text>
    </HoverCard.Content>
  );
}

type TreeListProps = {
  brandProfileId: string;
  assets: CreativeAsset[];
  depth: number;
  expandedPaths: Set<string>;
  setExpandedPaths: React.Dispatch<React.SetStateAction<Set<string>>>;
  resolvePreview: (asset: CreativeAsset) => Promise<string>;
  onRename: (asset: CreativeAsset, nextName: string) => Promise<string>;
  onDelete: (asset: CreativeAsset) => Promise<void>;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, asset: CreativeAsset) => void;
  onCreateFolder: (name: string, parentPath: string) => Promise<void>;
  folderCache: React.MutableRefObject<Map<string, CreativeAsset[]>>;
  folderCacheOrder: React.MutableRefObject<string[]>;
};

function TreeList({
  brandProfileId,
  assets,
  depth,
  expandedPaths,
  setExpandedPaths,
  resolvePreview,
  onRename,
  onDelete,
  onDragStart,
  onCreateFolder,
  folderCache,
  folderCacheOrder,
}: TreeListProps) {
  const folders = React.useMemo(() => assets.filter((a) => a.kind === "folder"), [assets]);
  const files = React.useMemo(() => assets.filter((a) => a.kind === "file"), [assets]);
  return (
    <div className="space-y-[2px]">
      {folders.map((folder) => (
        <TreeRow
          key={folder.fullPath}
          brandProfileId={brandProfileId}
          asset={folder}
          depth={depth}
          expandedPaths={expandedPaths}
          setExpandedPaths={setExpandedPaths}
          resolvePreview={resolvePreview}
          onRename={onRename}
          onDelete={onDelete}
          onDragStart={onDragStart}
          onCreateFolder={onCreateFolder}
          folderCache={folderCache}
          folderCacheOrder={folderCacheOrder}
        />
      ))}
      {files.map((file) => (
        <TreeRow
          key={file.fullPath}
          brandProfileId={brandProfileId}
          asset={file}
          depth={depth}
          expandedPaths={expandedPaths}
          setExpandedPaths={setExpandedPaths}
          resolvePreview={resolvePreview}
          onRename={onRename}
          onDelete={onDelete}
          onDragStart={onDragStart}
          onCreateFolder={onCreateFolder}
          folderCache={folderCache}
          folderCacheOrder={folderCacheOrder}
        />
      ))}
    </div>
  );
}

type TreeRowProps = {
  brandProfileId: string;
  asset: CreativeAsset;
  depth: number;
  expandedPaths: Set<string>;
  setExpandedPaths: React.Dispatch<React.SetStateAction<Set<string>>>;
  resolvePreview: (asset: CreativeAsset) => Promise<string>;
  onRename: (asset: CreativeAsset, nextName: string) => Promise<string>;
  onDelete: (asset: CreativeAsset) => Promise<void>;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, asset: CreativeAsset) => void;
  onCreateFolder: (name: string, parentPath: string) => Promise<void>;
  folderCache: React.MutableRefObject<Map<string, CreativeAsset[]>>;
  folderCacheOrder: React.MutableRefObject<string[]>;
};

function TreeRow(props: TreeRowProps) {
  const {
    brandProfileId,
    asset,
    depth,
    expandedPaths,
    setExpandedPaths,
    resolvePreview,
    onRename,
    onDelete,
    onDragStart,
    onCreateFolder,
    folderCache,
    folderCacheOrder,
  } = props;
  const { show } = useToast();
  const isFolder = asset.kind === "folder";
  const [children, setChildren] = React.useState<CreativeAsset[] | null>(() => {
    const cached = folderCache.current.get(stripBrandPath(asset.fullPath, brandProfileId));
    return cached ?? null;
  });
  const [loading, setLoading] = React.useState(false);
  const expanded = expandedPaths.has(asset.fullPath);
  const folderPath = stripBrandPath(asset.fullPath, brandProfileId);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [nextName, setNextName] = React.useState(asset.name);
  const [hoverOpen, setHoverOpen] = React.useState(false);
  const [contextOpen, setContextOpen] = React.useState(false);
  const [nameHovered, setNameHovered] = React.useState(false);

  React.useEffect(() => {
    setNextName(asset.name);
  }, [asset.name]);

  const ensureChildren = React.useCallback(async () => {
    if (!isFolder) return [];
    const cached = folderCache.current.get(folderPath);
    if (cached) return cached;
    setLoading(true);
    try {
      const listing = await listCreativeAssets(brandProfileId, folderPath);
      folderCache.current.set(folderPath, listing.assets);
      folderCacheOrder.current.push(folderPath);
      while (folderCacheOrder.current.length > FOLDER_CACHE_LIMIT) {
        const oldest = folderCacheOrder.current.shift();
        if (oldest) folderCache.current.delete(oldest);
      }
      setChildren(listing.assets);
      return listing.assets;
    } catch (error) {
      console.error("Failed to load folder", error);
      setChildren([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [brandProfileId, folderPath, folderCache, folderCacheOrder, isFolder]);

  const toggle = React.useCallback(async () => {
    if (!isFolder) return;
    if (!expanded) {
      await ensureChildren();
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.add(asset.fullPath);
        return next;
      });
    } else {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.delete(asset.fullPath);
        return next;
      });
    }
  }, [asset.fullPath, expanded, isFolder, ensureChildren, setExpandedPaths]);

  const handleRename = React.useCallback(async () => {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === asset.name) {
      setRenameOpen(false);
      setNextName(asset.name);
      return;
    }
    await onRename(asset, trimmed);
    setRenameOpen(false);
  }, [asset, nextName, onRename]);

  const handleDelete = React.useCallback(async () => {
    await onDelete(asset);
    setDeleteOpen(false);
  }, [asset, onDelete]);

  const handleCreateFolder = React.useCallback(async () => {
    const name = window.prompt("New folder name?");
    if (!name) return;
    await onCreateFolder(name, folderPath);
    await ensureChildren();
  }, [ensureChildren, folderPath, onCreateFolder]);

  const handleDownload = React.useCallback(async () => {
    if (isFolder) return;
    try {
      const url = await createSignedDownloadUrl(asset.fullPath, 600, asset.name);
      const link = document.createElement("a");
      link.href = url;
      link.download = asset.name;
      link.rel = "noopener";
      link.target = "_blank";
      link.click();
    } catch {
      try {
        const url = await getPublicAssetDownloadUrl(asset.fullPath, asset.name);
        const link = document.createElement("a");
        link.href = url;
        link.download = asset.name;
        link.rel = "noopener";
        link.target = "_blank";
        link.click();
      } catch (error) {
        show({
          title: "Download failed",
          description: (error as Error)?.message ?? "Unable to download asset.",
          variant: "error",
        });
      }
    }
  }, [asset.fullPath, asset.name, isFolder, show]);

  const leftPadding = depth * 14;

  const isHighlighted = contextOpen || nameHovered;

  return (
    <>
      <HoverCard.Root openDelay={120} closeDelay={80} open={hoverOpen} onOpenChange={setHoverOpen}>
        <ContextMenu.Root onOpenChange={setContextOpen}>
          <ContextMenu.Trigger asChild>
            <HoverCard.Trigger asChild>
              <div
                className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-white transition ${
                  isHighlighted
                    ? "bg-white/15 ring-1 ring-purple-500/30 shadow-brand-glow"
                    : "hover:bg-white/15"
                }`}
                style={{ paddingLeft: leftPadding }}
                onDoubleClick={toggle}
                onClick={toggle}
                draggable={!isFolder}
                onDragStart={(event) => {
                  if (!isFolder) onDragStart(event, asset);
                }}
              >
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center text-white/80"
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggle();
                  }}
                  aria-label={expanded ? "Collapse" : "Expand"}
                >
                  {isFolder ? (
                    <ChevronRightIcon className={`${expanded ? "rotate-90" : ""} transition-transform text-white`} />
                  ) : (
                    <span className="inline-block w-3" />
                  )}
                </button>
                {isFolder ? (
                  <ArchiveIcon className="text-white" />
                ) : (
                  <FileThumb asset={asset} resolvePreview={resolvePreview} />
                )}
                <span
                  className="truncate"
                  onMouseEnter={() => setNameHovered(true)}
                  onMouseLeave={() => setNameHovered(false)}
                >
                  {asset.name}
                </span>
                {!isFolder ? (
                  <span className="ml-auto text-[10px] uppercase text-white/80">{asset.contentType?.split("/")[0]}</span>
                ) : null}
              </div>
            </HoverCard.Trigger>
          </ContextMenu.Trigger>
          <ContextMenu.Content className="min-w-[180px] rounded-md border border-white/10 bg-slate-900/95 p-1 shadow-2xl backdrop-blur">
            {isFolder ? (
              <ContextMenu.Item className="px-2 py-1 text-sm text-white hover:bg-white/10" onSelect={handleCreateFolder}>
                New folder
              </ContextMenu.Item>
            ) : null}
            {!isFolder ? (
              <ContextMenu.Item className="px-2 py-1 text-sm text-white hover:bg-white/10" onSelect={() => void handleDownload()}>
                Download
              </ContextMenu.Item>
            ) : null}
            <ContextMenu.Item className="px-2 py-1 text-sm text-white hover:bg-white/10" onSelect={() => setRenameOpen(true)}>
              Rename
            </ContextMenu.Item>
            <ContextMenu.Item className="px-2 py-1 text-sm text-red-400 hover:bg-white/10" onSelect={() => setDeleteOpen(true)}>
              Delete
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Root>
        {!isFolder ? <SidebarHoverContent asset={asset} resolvePreview={resolvePreview} open={hoverOpen} /> : null}
      </HoverCard.Root>
      <Dialog.Root open={renameOpen} onOpenChange={setRenameOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/15 bg-slate-950/80 backdrop-blur-lg p-4 shadow-2xl">
            <Dialog.Title className="text-white text-lg font-medium">Rename</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-white/70">
              Update “{asset.name}”.
            </Dialog.Description>
            <div className="mt-3">
              <TextField.Root value={nextName} onChange={(e) => setNextName(e.target.value)} autoFocus />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
              <Button variant="solid" onClick={() => void handleRename()}>Save</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/15 bg-slate-950/80 backdrop-blur-lg p-4 shadow-2xl">
            <AlertDialog.Title className="text-white text-lg font-medium">Delete “{asset.name}”?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-white/70">
              This action removes the asset from storage. It cannot be undone.
            </AlertDialog.Description>
            <div className="mt-4 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button color="red" onClick={() => void handleDelete()}>Delete</Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {isFolder && expanded ? (
        <div className="ml-2 pl-1">
          {loading ? (
            <Text size="1" color="gray">
              Loading…
            </Text>
          ) : children ? (
            <TreeList
              brandProfileId={brandProfileId}
              assets={children}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              setExpandedPaths={setExpandedPaths}
              resolvePreview={resolvePreview}
              onRename={onRename}
              onDelete={async (child) => {
                await onDelete(child);
                await ensureChildren();
              }}
              onDragStart={onDragStart}
              onCreateFolder={onCreateFolder}
              folderCache={folderCache}
              folderCacheOrder={folderCacheOrder}
            />
          ) : (
            <Text size="1" color="gray">
              Empty
            </Text>
          )}
        </div>
      ) : null}
    </>
  );
}

function FileThumb({
  asset,
  resolvePreview,
}: {
  asset: CreativeAsset;
  resolvePreview: (asset: CreativeAsset) => Promise<string>;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const isImage = asset.contentType?.startsWith("image/");
  const isVideo = asset.contentType?.startsWith("video/");
  const thumbRef = React.useRef<HTMLDivElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (asset.kind === "folder" || isVideo) return;
    setLoading(true);
    resolvePreview(asset)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset, resolvePreview, isVideo]);

  React.useEffect(() => {
    if (!isVideo) return;
    const target = thumbRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { rootMargin: "80px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isVideo]);

  React.useEffect(() => {
    let cancelled = false;
    if (!isVideo || !inView || url) return;
    setLoading(true);
    resolvePreview(asset)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset, inView, isVideo, resolvePreview, url]);

  if (loading) {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-white/10 text-[10px] text-white">
        …
      </div>
    );
  }

  if (isImage) {
    return (
      <div ref={thumbRef} className="h-7 w-7 overflow-hidden rounded-sm bg-white/5">
        <img src={url ?? asset.fullPath} alt={asset.name} className="h-full w-full object-cover" />
      </div>
    );
  }
  if (isVideo) {
    return (
      <div ref={thumbRef} className="h-7 w-7 overflow-hidden rounded-sm bg-white/5">
        {url ? (
          <video
            src={`${url}#t=0.01`}
            ref={videoRef}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v) v.currentTime = 0.01;
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-white">▶</div>
        )}
      </div>
    );
  }
  return <FileIcon className="h-6 w-6 text-white" />;
}

function stripBrandPath(fullPath: string, brandProfileId: string) {
  return fullPath.replace(new RegExp(`^${brandProfileId}/?`), "");
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
