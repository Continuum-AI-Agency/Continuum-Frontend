/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderPlus,
  Search,
  Upload,
  MoreHorizontal,
  X,
  Play
} from "lucide-react";
import {
  Button,
  IconButton,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import * as HoverCard from "@radix-ui/react-hover-card";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";


import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
import { sanitizeCreativeAssetUrl } from "@/lib/creative-assets/assetUrl";
import { useToast } from "@/components/ui/ToastProvider";
import { CREATIVE_ASSET_DRAG_TYPE } from "@/lib/creative-assets/drag";
import { cn } from "@/lib/utils";

const DRAG_MIME = "application/reactflow-node-data";
const FOLDER_CACHE_LIMIT = 20;

type CreativeLibrarySidebarProps = {
  brandProfileId: string;
  expandedWidth?: number;
};

export function CreativeLibrarySidebar({
  brandProfileId,
  expandedWidth = 400,
}: CreativeLibrarySidebarProps) {
  return <CreativeLibrarySidebarContent brandProfileId={brandProfileId} expandedWidth={expandedWidth} />;
}

function CreativeLibrarySidebarContent({ brandProfileId, expandedWidth }: { brandProfileId: string; expandedWidth: number }) {
  const [open, setOpen] = React.useState(false);
  const { show } = useToast();
  const [query, setQuery] = React.useState("");
  const browser = useCreativeAssetBrowser(brandProfileId);
  const previewCache = React.useRef<Map<string, string>>(new Map());
  const folderCache = React.useRef<Map<string, CreativeAsset[]>>(new Map());
  const folderCacheOrder = React.useRef<string[]>([]);
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

      const cachedPreview = sanitizeCreativeAssetUrl(previewCache.current.get(asset.fullPath));
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
      event.dataTransfer.setData("text/plain", cachedPreview ?? "");

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

  // Close when clicking outside on the overlay part (if Sidebar doesn't handle it)
  // Sidebar with collapsible="offcanvas" doesn't automatically add an overlay backdrop usually.
  // We can add a backdrop manually if open.
  
  return createPortal(
    <>
      {/* Floating Trigger Button */}
      <div className="pointer-events-auto fixed right-4 top-1/2 z-40 -translate-y-1/2">
         <Button
            className="h-10 w-10 rounded-full shadow-xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => setOpen(true)}
            aria-label="Open creative library"
         >
            <Archive className="h-5 w-5" />
         </Button>
      </div>

      {/* Backdrop for mobile-like overlay behavior on desktop if needed */}
      {open && (
         <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 pointer-events-auto"
            onClick={() => setOpen(false)}
         />
      )}

      <div
         className="fixed right-0 top-0 h-full w-96 bg-slate-950/95 border-l border-white/10 shadow-2xl backdrop-blur-xl z-50"
         style={{ width: expandedWidth }}
         onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col h-full">
          <div className="border-b border-white/5 p-4 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-2 text-white">
                  <Archive className="h-5 w-5" />
                  <span className="font-medium">Creative Library</span>
               </div>
               <Button
                  variant="ghost"
                  size="1"
                  className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-white/10 rounded-full"
                  onClick={() => setOpen(false)}
               >
                  <X className="h-4 w-4" />
               </Button>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <BreadcrumbTrail
                 items={browser.breadcrumbs}
                 onSelect={(path) => void browser.navigateTo(path)}
              />
            </div>

            <div className="flex items-center gap-2">
               <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                     className="w-full bg-white/5 border border-white/10 rounded-md py-1.5 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                     placeholder="Search assets..."
                     value={query}
                     onChange={(e) => setQuery(e.target.value)}
                  />
               </div>
               <Tooltip content="Upload files">
                  <label className="cursor-pointer inline-flex items-center justify-center h-8 w-8 rounded-md bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/10">
                     <Upload className="h-4 w-4" />
                     <input type="file" multiple className="hidden" onChange={handleUpload} />
                  </label>
               </Tooltip>
               <Tooltip content="New folder">
                  <button
                     className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/10"
                     onClick={() => {
                        const name = window.prompt("New folder name?");
                        if (name) void createFolderAt(name, "");
                     }}
                  >
                     <FolderPlus className="h-4 w-4" />
                  </button>
               </Tooltip>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <div className="p-2 h-full overflow-y-auto">
              {browser.loading ? (
                <div className="p-4 text-sm text-gray-400">Loading assets...</div>
              ) : filteredAssets.length === 0 ? (
                <div className="p-4 text-sm text-gray-400">No assets found.</div>
              ) : (
                <TreeList
                   brandProfileId={brandProfileId}
                   assets={filteredAssets}
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
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  , document.body);
}

// ------------------------------------------------------------------
// Recursive Tree Components
// ------------------------------------------------------------------

type TreeListProps = {
  brandProfileId: string;
  assets: CreativeAsset[];
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

type TreeItemProps = {
  brandProfileId: string;
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

function TreeList({ assets, ...props }: TreeListProps) {
  const folders = React.useMemo(() => assets.filter((a) => a.kind === "folder"), [assets]);
  const files = React.useMemo(() => assets.filter((a) => a.kind === "file"), [assets]);

  return (
    <div className="space-y-1">
      {folders.map((folder) => (
        <FolderTreeItem key={folder.fullPath} asset={folder} {...props} />
      ))}
      {files.map((file) => (
        <FileTreeItem key={file.fullPath} asset={file} {...props} />
      ))}
    </div>
  );
}

function FolderTreeItem({
  asset,
  brandProfileId,
  expandedPaths,
  setExpandedPaths,
  folderCache,
  folderCacheOrder,
  onCreateFolder,
  ...props

}: TreeItemProps & { asset: CreativeAsset }) {
  const { show } = useToast();
  const folderPath = stripBrandPath(asset.fullPath, brandProfileId);
  const isExpanded = expandedPaths.has(asset.fullPath);
  const [children, setChildren] = React.useState<CreativeAsset[] | null>(() => {
    const cached = folderCache.current.get(folderPath);
    return cached ?? null;
  });
  const [isLoading, setIsLoading] = React.useState(false);

  const ensureChildren = React.useCallback(async () => {
     const cached = folderCache.current.get(folderPath);
     if (cached) {
        setChildren(cached);
        return;
     }
     setIsLoading(true);
     try {
        const listing = await listCreativeAssets(brandProfileId, folderPath);
        folderCache.current.set(folderPath, listing.assets);
        folderCacheOrder.current.push(folderPath);
        if (folderCacheOrder.current.length > FOLDER_CACHE_LIMIT) {
           const oldest = folderCacheOrder.current.shift();
           if (oldest) folderCache.current.delete(oldest);
        }
        setChildren(listing.assets);
     } catch (err) {
        console.error("Failed to load folder", err);
     } finally {
        setIsLoading(false);
     }
  }, [brandProfileId, folderPath, folderCache, folderCacheOrder]);

  const toggle = React.useCallback(async (open: boolean) => {
     if (open) {
        setExpandedPaths(prev => new Set(prev).add(asset.fullPath));
        await ensureChildren();
     } else {
        setExpandedPaths(prev => {
           const next = new Set(prev);
           next.delete(asset.fullPath);
           return next;
        });
     }
  }, [asset.fullPath, ensureChildren, setExpandedPaths]);

  return (
    <div>
      <Collapsible
         open={isExpanded}
         onOpenChange={toggle}
         className="group/collapsible"
      >
         <ContextMenuWrapper asset={asset} onRename={props.onRename} onDelete={props.onDelete} onCreateFolder={async () => {
             const name = window.prompt("New folder name?");
             if (name) {
                await onCreateFolder(name, folderPath);
                await ensureChildren();
             }
         }}>
            <CollapsibleTrigger asChild>
               <button className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-gray-300 hover:text-white hover:bg-white/10 rounded-md transition-colors">
                  <ChevronRight className="w-4 h-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 text-gray-500" />
                  <Folder className="w-4 h-4 text-blue-400" />
                  <span className="truncate">{asset.name}</span>
               </button>
            </CollapsibleTrigger>
         </ContextMenuWrapper>

         <CollapsibleContent>
            <div className="ml-6 mt-1">
               {isLoading ? (
                  <div className="py-1 text-xs text-gray-500">Loading...</div>
               ) : children && children.length > 0 ? (
                  <TreeList
                     assets={children}
                     brandProfileId={brandProfileId}
                     expandedPaths={expandedPaths}
                     setExpandedPaths={setExpandedPaths}
                     resolvePreview={props.resolvePreview}
                     onRename={props.onRename}
                     onDelete={props.onDelete}
                     onDragStart={props.onDragStart}
                     onCreateFolder={onCreateFolder}
                     folderCache={folderCache}
                     folderCacheOrder={folderCacheOrder}
                  />
               ) : children ? (
                  <div className="py-1 text-xs text-gray-500">Empty</div>
               ) : null}
            </div>
         </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function FileTreeItem({ asset, resolvePreview, onDragStart, ...props }: TreeItemProps & { asset: CreativeAsset }) {
  const [hoverOpen, setHoverOpen] = React.useState(false);

  return (
     <div>
        <HoverCard.Root openDelay={200} closeDelay={100} open={hoverOpen} onOpenChange={setHoverOpen}>
           <ContextMenuWrapper asset={asset} onRename={props.onRename} onDelete={props.onDelete}>
              <HoverCard.Trigger asChild>
                 <div
                    draggable
                    onDragStart={(e) => onDragStart(e, asset)}
                    className="w-full"
                 >
                    <button className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-gray-300 hover:text-white hover:bg-white/10 rounded-md transition-colors">
                       <FileThumb asset={asset} resolvePreview={resolvePreview} />
                       <span className="truncate">{asset.name}</span>
                    </button>
                 </div>
              </HoverCard.Trigger>
           </ContextMenuWrapper>
           <SidebarHoverContent asset={asset} resolvePreview={resolvePreview} open={hoverOpen} />
        </HoverCard.Root>
     </div>
  );
}

// ------------------------------------------------------------------
// Utilities & Helpers
// ------------------------------------------------------------------

function ContextMenuWrapper({ 
   children, 
   asset, 
   onRename, 
   onDelete,
   onCreateFolder
}: { 
   children: React.ReactNode, 
   asset: CreativeAsset,
   onRename: (asset: CreativeAsset, name: string) => Promise<string>,
   onDelete: (asset: CreativeAsset) => Promise<void>,
   onCreateFolder?: () => void
}) {
   const [renameOpen, setRenameOpen] = React.useState(false);
   const [deleteOpen, setDeleteOpen] = React.useState(false);
   const [nextName, setNextName] = React.useState(asset.name);
   
   const handleRename = async () => {
      const trimmed = nextName.trim();
      if (trimmed && trimmed !== asset.name) {
         await onRename(asset, trimmed);
      }
      setRenameOpen(false);
   };

   return (
      <>
         <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
               {children}
            </ContextMenu.Trigger>
            <ContextMenu.Content className="min-w-[160px] rounded-md border border-white/10 bg-slate-900/95 p-1 shadow-2xl backdrop-blur-md z-50">
               {onCreateFolder && (
                  <ContextMenu.Item 
                     className="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none text-white hover:bg-white/10 focus:bg-white/10"
                     onSelect={onCreateFolder}
                  >
                     New folder
                  </ContextMenu.Item>
               )}
               {asset.kind === "file" && (
                  <ContextMenu.Item 
                     className="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none text-white hover:bg-white/10 focus:bg-white/10"
                     onSelect={async () => {
                        try {
                           const url = await createSignedDownloadUrl(asset.fullPath, 600, asset.name);
                           window.open(url, "_blank");
                        } catch {
                           console.error("Download failed");
                        }
                     }}
                  >
                     Download
                  </ContextMenu.Item>
               )}
               <ContextMenu.Item 
                  className="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none text-white hover:bg-white/10 focus:bg-white/10"
                  onSelect={() => setRenameOpen(true)}
               >
                  Rename
               </ContextMenu.Item>
               <ContextMenu.Item 
                  className="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none text-red-400 hover:bg-white/10 focus:bg-white/10"
                  onSelect={() => setDeleteOpen(true)}
               >
                  Delete
               </ContextMenu.Item>
            </ContextMenu.Content>
         </ContextMenu.Root>

         {/* Rename Dialog */}
         <Dialog.Root open={renameOpen} onOpenChange={setRenameOpen}>
            <Dialog.Portal>
               <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" />
               <Dialog.Content className="fixed left-1/2 top-1/2 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/15 bg-slate-950 p-4 shadow-2xl z-[70]">
                  <Dialog.Title className="text-white text-lg font-medium">Rename</Dialog.Title>
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

         {/* Delete Alert */}
         <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialog.Portal>
               <AlertDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" />
               <AlertDialog.Content className="fixed left-1/2 top-1/2 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/15 bg-slate-950 p-4 shadow-2xl z-[70]">
                  <AlertDialog.Title className="text-white text-lg font-medium">Delete “{asset.name}”?</AlertDialog.Title>
                  <AlertDialog.Description className="mt-2 text-sm text-white/70">
                     This cannot be undone.
                  </AlertDialog.Description>
                  <div className="mt-4 flex justify-end gap-2">
                     <AlertDialog.Cancel asChild>
                        <Button variant="ghost">Cancel</Button>
                     </AlertDialog.Cancel>
                     <AlertDialog.Action asChild>
                        <Button color="red" onClick={async () => {
                           await onDelete(asset);
                           setDeleteOpen(false);
                        }}>Delete</Button>
                     </AlertDialog.Action>
                  </div>
               </AlertDialog.Content>
            </AlertDialog.Portal>
         </AlertDialog.Root>
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
   const safeUrl = sanitizeCreativeAssetUrl(url);
 
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
     <HoverCard.Content sideOffset={10} className="rounded-lg border border-white/10 bg-slate-900/95 p-2 shadow-xl z-50 backdrop-blur-sm">
       <div className="relative h-64 w-64 overflow-hidden rounded-md bg-black/60 flex items-center justify-center">
         {loading ? (
           <div className="text-sm text-gray-400">Loading...</div>
         ) : isVideo && safeUrl ? (
           <video
             src={`${safeUrl}#t=0.01`}
             preload="metadata"
             muted
             playsInline
             controls
             className="h-full w-full object-contain"
           />
         ) : isImage && safeUrl ? (
           <img src={safeUrl} alt={asset.name} className="h-full w-full object-contain" />
         ) : (
           <FileIcon className="h-12 w-12 text-gray-600" />
         )}
       </div>
       <div className="mt-2">
          <p className="text-sm font-medium text-white truncate max-w-[16rem]">{asset.name}</p>
          <p className="text-xs text-gray-400">{asset.contentType ?? "file"}</p>
       </div>
     </HoverCard.Content>
   );
 }

function FileThumb({ asset, resolvePreview }: { asset: CreativeAsset; resolvePreview: (asset: CreativeAsset) => Promise<string> }) {
   const [url, setUrl] = React.useState<string | null>(null);
   const isImage = asset.contentType?.startsWith("image/");
   const isVideo = asset.contentType?.startsWith("video/");
   
   React.useEffect(() => {
      if (isImage || isVideo) {
         resolvePreview(asset).then(setUrl).catch(() => {});
      }
   }, [asset, isImage, isVideo, resolvePreview]);

   if (isImage && url) {
      return <div className="h-4 w-4 rounded-sm overflow-hidden bg-white/10"><img src={url} alt="" className="h-full w-full object-cover" /></div>;
   }
   if (isVideo) {
      return <Play className="h-4 w-4 text-purple-400" />;
   }
   return <FileIcon className="h-4 w-4 text-gray-400" />;
}

function BreadcrumbTrail({ items, onSelect }: { items: { label: string; path: string }[]; onSelect: (path: string) => void }) {
   if (!items.length) return null;
   return (
     <div className="flex flex-wrap items-center gap-1 text-xs text-gray-400 mb-2">
       {items.map((crumb, index) => (
         <React.Fragment key={crumb.path ?? index}>
           <button
             type="button"
             className="hover:text-white hover:underline transition-colors"
             onClick={() => onSelect(crumb.path)}
           >
             {crumb.label || "Root"}
           </button>
           {index < items.length - 1 ? <span>/</span> : null}
         </React.Fragment>
       ))}
     </div>
   );
 }

function stripBrandPath(fullPath: string, brandProfileId: string) {
  return fullPath.replace(new RegExp(`^${brandProfileId}/?`), "");
}
