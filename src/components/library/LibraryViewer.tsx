"use client";

import { useCallback, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Upload, ScanSearch } from "lucide-react";
import type {
  MediaAsset,
  MediaCollection,
  MediaKind,
  MediaSearchResultItem,
  MediaSource,
} from "@continuum/contracts";
import { Button } from "@/components/ui/button";
import { LibrarySidebar } from "./LibrarySidebar";
import { LibraryFilterBar } from "./LibraryFilterBar";
import { MediaGrid } from "./MediaGrid";
import { MediaSearchBar } from "./MediaSearchBar";
import { MediaDetailDialog } from "./MediaDetailDialog";
import { UploadStrip } from "./UploadStrip";
import { useMediaLibrary } from "./useMediaLibrary";
import { useMediaUpload } from "./useMediaUpload";
import {
  buildLibraryQuery,
  type KindFilterValue,
  type SourceFilterValue,
} from "@/lib/media/filters";
import { CompetitorInspirationPanel } from "@/components/competitor-spy/CompetitorInspirationPanel";

type Props = {
  brandId: string;
  isPaid: boolean;
  initialAssets: MediaAsset[];
  initialCollections: MediaCollection[];
  storageUsedBytes: number;
  selectedCollectionId: string | null;
  selectedSource: MediaSource | null;
  selectedKind: MediaKind | null;
};

export function LibraryViewer({
  brandId,
  isPaid,
  initialAssets,
  initialCollections,
  storageUsedBytes,
  selectedCollectionId,
  selectedSource,
  selectedKind,
}: Props) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const sourceFilter: SourceFilterValue = selectedSource ?? "all";
  const kindFilter: KindFilterValue = selectedKind ?? "all";
  // Filtering is a soft navigation. useTransition keeps the grid visible (and
  // dimmed) during the refetch; useOptimistic flips the active pill instantly so
  // the bar reacts on click instead of waiting for the round-trip to commit.
  const [isFiltering, startFilterTransition] = useTransition();
  const [optimisticSource, setOptimisticSource] = useOptimistic(sourceFilter);
  const [optimisticKind, setOptimisticKind] = useOptimistic(kindFilter);
  const { assets, hasMore, loadingMore, loadMore } = useMediaLibrary({
    brandId,
    collectionId: selectedCollectionId,
    source: selectedSource,
    kind: selectedKind,
    seed: initialAssets,
  });
  const { uploads, uploadFiles } = useMediaUpload(brandId);

  const [view, setView] = useState<"media" | "inspiration">("media");
  const [openAsset, setOpenAsset] = useState<MediaAsset | null>(null);
  const [searchResults, setSearchResults] = useState<MediaSearchResultItem[] | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const isSearching = searchResults !== null;
  const displayedAssets = isSearching ? searchResults!.map((r) => r.asset) : assets;
  const activeCollection = selectedCollectionId
    ? initialCollections.find((c) => c.id === selectedCollectionId)
    : null;

  // All library navigation is URL-driven (shareable + RSC refetch). Pagination
  // params (offset/limit) are intentionally omitted here so the chip/collection
  // change resets to page 0.
  const pushFilters = useCallback(
    (next: { collectionId?: string | null; source?: SourceFilterValue; kind?: KindFilterValue }) => {
      setSearchResults(null);
      const nextSource = next.source ?? sourceFilter;
      const nextKind = next.kind ?? kindFilter;
      const params = buildLibraryQuery({
        brandId,
        collectionId: next.collectionId !== undefined ? next.collectionId : selectedCollectionId,
        source: nextSource,
        kind: nextKind,
      });
      params.delete("brandId");
      const qs = params.toString();
      startFilterTransition(() => {
        setOptimisticSource(nextSource);
        setOptimisticKind(nextKind);
        router.push(qs ? `/library?${qs}` : "/library");
      });
    },
    [brandId, router, selectedCollectionId, sourceFilter, kindFilter, setOptimisticSource, setOptimisticKind, startFilterTransition],
  );

  const onSelectCollection = useCallback(
    (id: string | null) => pushFilters({ collectionId: id }),
    [pushFilters],
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    if (Array.from(e.dataTransfer.types).includes("Files")) setDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void uploadFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 pt-2" role="tablist" aria-label="Library sections">
        {(["media", "inspiration"] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${
              view === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {id}
          </button>
        ))}
      </div>

      {view === "inspiration" ? (
        <CompetitorInspirationPanel brandId={brandId} />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
      <LibrarySidebar
        brandId={brandId}
        collections={initialCollections}
        selectedCollectionId={selectedCollectionId}
        onSelectCollection={onSelectCollection}
        storageUsedBytes={storageUsedBytes}
      />

      <div
        className="relative flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
        onDragEnter={handleDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="text-base font-semibold text-balance">
            {activeCollection?.name ?? "All Media"}
          </h1>
          <div className="min-w-0 flex-1">
            <MediaSearchBar
              brandId={brandId}
              source={selectedSource}
              kind={selectedKind}
              onResults={setSearchResults}
              onClear={() => setSearchResults(null)}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant={showBoundingBoxes ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowBoundingBoxes((v) => !v)}
              title="Toggle detected-object overlays"
              className="active:scale-[0.96] [transition-property:scale]"
            >
              <ScanSearch className="size-4" />
              <span className="hidden sm:inline">Objects</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="active:scale-[0.96] [transition-property:scale]"
            >
              <Upload className="size-4" />
              Upload
            </Button>
          </div>
        </div>

        <LibraryFilterBar
          source={optimisticSource}
          kind={optimisticKind}
          onSourceChange={(value) => pushFilters({ source: value })}
          onKindChange={(value) => pushFilters({ kind: value })}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <AnimatePresence initial={false}>
          {uploads.length > 0 && <UploadStrip uploads={uploads} />}
        </AnimatePresence>

        {!isPaid && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-600 dark:text-amber-400">
            Upgrade to a paid plan to enable AI analysis, descriptions, and semantic search.
          </div>
        )}

        <div
          className={`transition-opacity ${isFiltering ? "pointer-events-none opacity-60" : ""}`}
          aria-busy={isFiltering}
        >
          <MediaGrid
            assets={displayedAssets}
            onOpenAsset={setOpenAsset}
            showBoundingBoxes={showBoundingBoxes}
            emptyHint={isSearching ? "No results. Try a different search." : undefined}
            onLoadMore={isSearching ? undefined : loadMore}
            hasMore={isSearching ? false : hasMore}
            loadingMore={loadingMore}
          />
        </div>

        {/* Full-area drop overlay */}
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/60 bg-primary/5 backdrop-blur-sm"
            >
              <div className="flex flex-col items-center gap-2 text-primary">
                <Upload className="size-7" />
                <span className="text-sm font-medium">Drop to upload</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

          <MediaDetailDialog
            asset={openAsset}
            onClose={() => setOpenAsset(null)}
            brandId={brandId}
            collections={initialCollections}
          />
        </div>
      )}
    </div>
  );
}
