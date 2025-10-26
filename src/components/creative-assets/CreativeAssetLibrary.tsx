"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Separator,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(3);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width < 420) setColumns(1);
      else if (width < 720) setColumns(2);
      else if (width < 960) setColumns(3);
      else setColumns(4);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const assets = browser.assets;

  const rows = useMemo(() => {
    const grouped: CreativeAsset[][] = [];
    const chunk = Math.max(columns, 1);
    for (let index = 0; index < assets.length; index += chunk) {
      grouped.push(assets.slice(index, index + chunk));
    }
    return grouped;
  }, [assets, columns]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 220,
    overscan: 4,
  });

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

  const virtualRows = rowVirtualizer.getVirtualItems();

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

      <Box
        className="rounded-lg border border-gray-200 dark:border-gray-800"
        style={{ height }}
      >
        <div ref={scrollRef} className="relative h-full overflow-auto">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualRows.map((virtualRow) => {
              const rowAssets = rows[virtualRow.index] ?? [];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  data-index={virtualRow.index}
                >
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    }}
                  >
                    {rowAssets.map((asset) => (
                      <AssetTile
                        key={asset.fullPath}
                        asset={asset}
                        onOpenFolder={browser.navigateInto}
                        onRename={browser.renameAssetPath}
                        onDelete={browser.deleteAssetPath}
                        onDragStart={onAssetDragStart}
                        onSelect={onAssetClick}
                        scrollContainer={scrollRef}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
  scrollContainer: React.RefObject<HTMLDivElement | null>;
};

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
        <Flex gap="1">
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
    import("@/lib/creative-assets/storage")
      .then(({ createSignedAssetUrl, getPublicAssetUrl }) => {
        const resolver = async () => {
          try {
            if (process.env.NEXT_PUBLIC_SUPABASE_STORAGE_PUBLIC === "true") {
              return getPublicAssetUrl(asset.fullPath);
            }
            return createSignedAssetUrl(asset.fullPath, 60);
          } catch {
            return null;
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
