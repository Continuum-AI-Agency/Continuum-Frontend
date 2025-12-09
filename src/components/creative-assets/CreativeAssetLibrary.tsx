"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Separator,
  ScrollArea,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import * as Accordion from "@radix-ui/react-accordion";
import {
  ChevronLeftIcon,
  FileIcon,
  ArchiveIcon,
  ImageIcon,
  Pencil1Icon,
  ReloadIcon,
  TrashIcon,
  UploadIcon,
} from "@radix-ui/react-icons";

import { useToast } from "@/components/ui/ToastProvider";
import type { CreativeAsset } from "@/lib/creative-assets/types";
import {
  CREATIVE_ASSET_DRAG_TYPE,
  type CreativeAssetDragPayload,
} from "@/lib/creative-assets/drag";
import { useCreativeAssetBrowser } from "@/lib/creative-assets/useCreativeAssetBrowser";
import { listCreativeAssets } from "@/lib/creative-assets/storageClient";

const FOLDER_CACHE_LIMIT = 20;

type CreativeAssetLibraryProps = {
  brandProfileId: string;
  height?: number;
  onAssetDragStart?: (asset: CreativeAsset) => void;
  onAssetClick?: (asset: CreativeAsset) => void;
};

const MIME_VIDEO = /^video\//i;
const MIME_IMAGE = /^image\//i;

export function CreativeAssetLibrary({
  brandProfileId,
  height = 520,
  onAssetDragStart,
  onAssetClick,
}: CreativeAssetLibraryProps) {
  const { show } = useToast();
  const browser = useCreativeAssetBrowser(brandProfileId);
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const folderCacheRef = useRef<Map<string, CreativeAsset[]>>(new Map());
  const folderCacheOrderRef = useRef<string[]>([]);

  const assets = browser.assets;
  const folders = useMemo(() => assets.filter((a) => a.kind === "folder"), [assets]);
  const files = useMemo(() => assets.filter((a) => a.kind === "file"), [assets]);

  const handleUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      try {
        await browser.uploadFiles(Array.from(files));
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

  const onDropUpload = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const files = event.dataTransfer.files;
      void handleUploadFiles(files);
    },
    [handleUploadFiles]
  );

  const onDragOverUpload = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  return (
    <Box className="space-y-3">
      <Flex align="center" justify="between">
        <Heading size="4">Creative Assets</Heading>
        <Flex gap="2" align="center">
          <Breadcrumbs breadcrumbs={browser.breadcrumbs} onNavigate={browser.navigateTo} />
          <Tooltip content="Refresh">
            <IconButton size="2" variant="soft" onClick={() => browser.refresh()} disabled={browser.loading}>
              <ReloadIcon className={browser.loading ? "animate-spin" : ""} />
            </IconButton>
          </Tooltip>
        </Flex>
      </Flex>

      <Box
        className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950"
        onDrop={onDropUpload}
        onDragOver={onDragOverUpload}
      >
        <Flex align="center" justify="between" mb="3">
          <Flex align="center" gap="2">
            <UploadIcon />
            <Text size="2" weight="medium">
              Upload files
            </Text>
          </Flex>
          <label className="cursor-pointer text-sm font-medium text-violet-600 hover:text-violet-700">
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleUploadFiles(event.target.files);
                event.target.value = "";
              }}
            />
            Choose files
          </label>
        </Flex>
        <Text size="1" color="gray">
          Drag and drop files here or click to upload. Assets remain private until a signed URL is generated.
        </Text>
      </Box>

      <Box className="rounded-lg border border-gray-200 dark:border-gray-800" style={{ height }}>
        <ScrollArea type="always" scrollbars="vertical" style={{ height: "100%" }}>
          <div className="space-y-3 p-3">
            <Accordion.Root
              type="multiple"
              value={openFolders}
              onValueChange={(values) => setOpenFolders(values as string[])}
              className="space-y-2"
            >
              {folders.map((folder) => (
                <Accordion.Item key={folder.fullPath} value={folder.fullPath} className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
                  <Accordion.Trigger className="w-full px-3 py-2 text-left font-medium flex items-center justify-between">
                    <Flex align="center" gap="2">
                      <ArchiveIcon /> <Text>{folder.name}</Text>
                    </Flex>
                    <ChevronLeftIcon className="data-[state=open]:rotate-90 transition-transform" />
                  </Accordion.Trigger>
                  <Accordion.Content className="px-3 pb-3">
                    <FolderContents
                      brandProfileId={brandProfileId}
                      folder={folder}
                      isOpen={openFolders.includes(folder.fullPath)}
                      getCachedAssets={(path) => folderCacheRef.current.get(path)}
                      setCachedAssets={(path, assetsToCache) => {
                        const cache = folderCacheRef.current;
                        const order = folderCacheOrderRef.current;
                        if (!cache.has(path)) {
                          order.push(path);
                        }
                        cache.set(path, assetsToCache);
                        while (order.length > FOLDER_CACHE_LIMIT) {
                          const oldest = order.shift();
                          if (oldest) cache.delete(oldest);
                        }
                      }}
                      onRename={browser.renameAssetPath}
                      onDelete={browser.deleteAssetPath}
                      onDragStart={onAssetDragStart}
                      onSelect={onAssetClick}
                    />
                  </Accordion.Content>
                </Accordion.Item>
              ))}
            </Accordion.Root>

            {files.length > 0 && (
              <Box className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                <Text weight="medium" size="2" className="mb-2 block">
                  Files in this folder
                </Text>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
                >
                  {files.map((asset) => (
                    <AssetTile
                      key={asset.fullPath}
                      asset={asset}
                      onOpenFolder={browser.navigateInto}
                      onRename={browser.renameAssetPath}
                      onDelete={browser.deleteAssetPath}
                      onDragStart={onAssetDragStart}
                      onSelect={onAssetClick}
                      scrollContainer={null}
                    />
                  ))}
                </div>
              </Box>
            )}
          </div>
        </ScrollArea>
      </Box>

      {browser.error && (
        <Text size="2" color="red">
          {browser.error}
        </Text>
      )}
      {browser.loading && (
        <Flex justify="center">
          <Text size="2" color="gray">
            Loading assets…
          </Text>
        </Flex>
      )}
    </Box>
  );
}

type AssetTileProps = {
  asset: CreativeAsset;
  onOpenFolder: (asset: CreativeAsset) => void;
  onRename: (asset: CreativeAsset, name: string) => Promise<unknown>;
  onDelete: (asset: CreativeAsset) => Promise<unknown>;
  onDragStart?: (asset: CreativeAsset) => void;
  onSelect?: (asset: CreativeAsset) => void;
  scrollContainer: React.RefObject<HTMLDivElement | null> | null;
};

type FolderContentsProps = {
  brandProfileId: string;
  folder: CreativeAsset;
  isOpen: boolean;
  getCachedAssets: (path: string) => CreativeAsset[] | undefined;
  setCachedAssets: (path: string, assets: CreativeAsset[]) => void;
  onRename: (asset: CreativeAsset, name: string) => Promise<unknown>;
  onDelete: (asset: CreativeAsset) => Promise<unknown>;
  onDragStart?: (asset: CreativeAsset) => void;
  onSelect?: (asset: CreativeAsset) => void;
};

function FolderContents({
  brandProfileId,
  folder,
  isOpen,
  getCachedAssets,
  setCachedAssets,
  onRename,
  onDelete,
  onDragStart,
  onSelect,
}: FolderContentsProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<CreativeAsset[] | null>(null);
  const [openNested, setOpenNested] = useState<string[]>([]);
  const folderPath = useMemo(() => folder.fullPath.replace(new RegExp(`^${brandProfileId}/?`), ""), [brandProfileId, folder.fullPath]);

  useEffect(() => {
    if (!isOpen || loading) return;
    const cached = getCachedAssets(folderPath);
    if (cached) {
      setAssets(cached);
      return;
    }
    if (assets !== null) return;
    setLoading(true);
    listCreativeAssets(brandProfileId, folderPath)
      .then((listing) => {
        setAssets(listing.assets);
        setCachedAssets(folderPath, listing.assets);
        setError(null);
      })
      .catch((err) => setError((err as Error)?.message ?? "Failed to load folder"))
      .finally(() => setLoading(false));
  }, [assets, brandProfileId, folderPath, getCachedAssets, isOpen, loading, setCachedAssets]);

  const files = useMemo(() => (assets ?? []).filter((a) => a.kind === "file"), [assets]);
  const subfolders = useMemo(() => (assets ?? []).filter((a) => a.kind === "folder"), [assets]);

  return (
    <Box className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-900">
      {loading && <Text size="1">Loading…</Text>}
      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}

      {files.length === 0 && subfolders.length === 0 && !loading ? (
        <Text size="1" color="gray">
          Empty folder
        </Text>
      ) : null}

      {files.length > 0 && (
        <ScrollArea type="always" scrollbars="vertical" style={{ maxHeight: 480 }}>
          <div
            ref={scrollRef}
            className="grid gap-3 p-2"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gridAutoRows: "220px",
            }}
          >
            {files.map((asset) => (
              <AssetTile
                key={asset.fullPath}
                asset={asset}
                onOpenFolder={() => {}}
                onRename={onRename}
                onDelete={onDelete}
                onDragStart={onDragStart}
                onSelect={onSelect}
                scrollContainer={scrollRef}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {subfolders.length > 0 && (
        <Accordion.Root
          type="multiple"
          value={openNested}
          onValueChange={(values) => setOpenNested(values as string[])}
          className="mt-2 space-y-2"
        >
          {subfolders.map((child) => (
            <Accordion.Item key={child.fullPath} value={child.fullPath} className="rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <Accordion.Trigger className="w-full px-2 py-1 text-left font-medium flex items-center justify-between">
                <Flex align="center" gap="2">
                  <ArchiveIcon width={16} height={16} /> <Text size="1">{child.name}</Text>
                </Flex>
                <ChevronLeftIcon className="data-[state=open]:rotate-90 transition-transform" />
              </Accordion.Trigger>
              <Accordion.Content className="px-2 pb-2">
                <FolderContents
                  brandProfileId={brandProfileId}
                  folder={child}
                  isOpen={openNested.includes(child.fullPath)}
                  getCachedAssets={getCachedAssets}
                  setCachedAssets={setCachedAssets}
                  onRename={onRename}
                  onDelete={onDelete}
                  onDragStart={onDragStart}
                  onSelect={onSelect}
                />
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      )}
    </Box>
  );
}

function AssetTile({
  asset,
  onOpenFolder,
  onRename,
  onDelete,
  onDragStart,
  onSelect,
  scrollContainer,
}: AssetTileProps) {
  const { show } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(asset.name);
  const previewRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!scrollContainer) {
      setIsVisible(true);
      return;
    }
    const target = previewRef.current;
    const root = scrollContainer.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { root, rootMargin: "100px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollContainer]);

  useEffect(() => {
    setName(asset.name);
  }, [asset.name]);

  const handleRename = useCallback(async () => {
    if (name.trim() === "" || name.trim() === asset.name) {
      setIsEditing(false);
      setName(asset.name);
      return;
    }
    try {
      await onRename(asset, name.trim());
      show({ title: "Renamed asset", variant: "success" });
    } catch (error) {
      show({
        title: "Rename failed",
        description: (error as Error)?.message ?? "Could not rename asset.",
        variant: "error",
      });
      setName(asset.name);
    } finally {
      setIsEditing(false);
    }
  }, [asset, name, onRename, show]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete ${asset.name}?`)) return;
    try {
      await onDelete(asset);
      show({ title: "Deleted asset", variant: "success" });
    } catch (error) {
      show({
        title: "Delete failed",
        description: (error as Error)?.message ?? "Could not delete asset.",
        variant: "error",
      });
    }
  }, [asset, onDelete, show]);

  const handleDoubleClick = useCallback(() => {
    if (asset.kind === "folder") {
      void onOpenFolder(asset);
    } else if (onSelect) {
      onSelect(asset);
    }
  }, [asset, onOpenFolder, onSelect]);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (asset.kind !== "file") return;
      const payload: CreativeAssetDragPayload = {
        name: asset.name,
        path: asset.fullPath,
        contentType: asset.contentType,
      };
      event.dataTransfer.setData(CREATIVE_ASSET_DRAG_TYPE, JSON.stringify(payload));
      event.dataTransfer.effectAllowed = "copy";
      onDragStart?.(asset);
    },
    [asset, onDragStart]
  );

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:border-violet-500 hover:shadow dark:border-gray-800 dark:bg-gray-950"
      draggable={asset.kind === "file"}
      onDragStart={handleDragStart}
      onDoubleClick={handleDoubleClick}
      onClick={() => {
        if (asset.kind === "file") {
          onSelect?.(asset);
        }
      }}
    >
      <div ref={previewRef} className="relative mb-3 h-44 w-full overflow-hidden rounded-md bg-gray-100 dark:bg-gray-900">
        {asset.kind === "folder" ? (
          <Flex align="center" justify="center" className="h-full w-full text-gray-500 dark:text-gray-400">
            <ArchiveIcon width={32} height={32} />
          </Flex>
        ) : isVisible ? (
          <AssetPreview asset={asset} />
        ) : (
          <Flex align="center" justify="center" className="h-full w-full text-gray-400">
            <ImageIcon width={24} height={24} />
          </Flex>
        )}
      </div>

      {isEditing ? (
        <TextField.Root
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleRename();
            } else if (event.key === "Escape") {
              setName(asset.name);
              setIsEditing(false);
            }
          }}
          onBlur={() => void handleRename()}
        />
      ) : (
        <Text size="2" weight="medium" className="truncate">
          {asset.name}
        </Text>
      )}

      <Flex justify="between" align="center" mt="3">
        <Text size="1" color="gray">
          {asset.kind === "folder" ? "Folder" : asset.contentType ?? "File"}
        </Text>
        <Flex gap="2">
          <IconButton
            size="1"
            variant="soft"
            onClick={() => setIsEditing(true)}
            aria-label="Rename"
          >
            <Pencil1Icon />
          </IconButton>
          <IconButton
            size="1"
            variant="soft"
            color="red"
            onClick={() => void handleDelete()}
            aria-label="Delete"
            disabled={asset.kind === "folder"}
          >
            <TrashIcon />
          </IconButton>
        </Flex>
      </Flex>
    </div>
  );
}

function AssetPreview({ asset }: { asset: CreativeAsset }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isVideo = MIME_VIDEO.test(asset.contentType ?? "");
  const isImage = MIME_IMAGE.test(asset.contentType ?? "");

  useEffect(() => {
    let cancelled = false;
    if (!isVideo && !isImage) {
      setSignedUrl(null);
      return;
    }
    setLoading(true);
    // Lazy-import to avoid circular dependency
    import("@/lib/creative-assets/storageClient")
      .then(({ createSignedAssetUrl, getPublicAssetUrl }) => {
        const resolver = async () => {
          try {
            if (process.env.NEXT_PUBLIC_SUPABASE_STORAGE_PUBLIC === "true") {
              return getPublicAssetUrl(asset.fullPath);
            }
            return createSignedAssetUrl(asset.fullPath, 60);
          } catch (err) {
            try {
              return getPublicAssetUrl(asset.fullPath);
            } catch (err2) {
              console.error("asset preview url failed", err ?? err2);
              return null;
            }
          }
        };
        return resolver();
      })
      .then((url) => {
        if (!cancelled) {
          setSignedUrl(url ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSignedUrl(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [asset.fullPath, isImage, isVideo]);

  const handleHover = useCallback(
    (playing: boolean) => {
      if (!videoRef.current) return;
      if (playing) {
        void videoRef.current.play().catch(() => undefined);
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    },
    []
  );

  if (!signedUrl) {
    return (
      <Flex align="center" justify="center" className="h-full w-full text-gray-400">
        {loading ? <ReloadIcon className="animate-spin" /> : <FileIcon width={24} height={24} />}
      </Flex>
    );
  }

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        src={signedUrl}
        muted
        preload="metadata"
        playsInline
        className="h-full w-full object-cover"
        onMouseEnter={() => handleHover(true)}
        onMouseLeave={() => handleHover(false)}
      />
    );
  }

  return (
    <Image
      src={signedUrl}
      alt={asset.name}
      fill
      className="object-cover"
      sizes="(max-width: 768px) 200px, 240px"
      unoptimized
      priority={false}
      loading="lazy"
    />
  );
}

function Breadcrumbs({
  breadcrumbs,
  onNavigate,
}: {
  breadcrumbs: Array<{ label: string; path: string }>;
  onNavigate: (path: string) => Promise<unknown>;
}) {
  if (breadcrumbs.length <= 1) {
    return (
      <IconButton
        size="2"
        variant="soft"
        onClick={() => onNavigate("")}
        aria-label="Root"
      >
        <ChevronLeftIcon />
      </IconButton>
    );
  }
  return (
    <Flex gap="2" align="center">
      <Button
        size="1"
        variant="soft"
        onClick={() => onNavigate("")}
      >
        Root
      </Button>
      <Separator orientation="vertical" />
      <Flex gap="1" align="center">
        {breadcrumbs.slice(1).map((crumb, index) => (
          <Button
            key={crumb.path + index}
            size="1"
            variant="soft"
            onClick={() => onNavigate(crumb.path)}
          >
            {crumb.label}
          </Button>
        ))}
      </Flex>
    </Flex>
  );
}
