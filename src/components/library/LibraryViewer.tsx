'use client';

import type {
  CustomFieldFilter,
  MediaAsset,
  MediaCollection,
  MediaKind,
  MediaSearchResultItem,
  MediaSource,
} from '@continuum/contracts';
import { Columns3, LayoutGrid, ScanSearch, Upload } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { CompetitorInspirationPanel } from '@/components/competitor-spy/CompetitorInspirationPanel';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import {
  type KindFilterValue,
  type LibraryTagOption,
  parseTagsParam,
  type SourceFilterValue,
} from '@/lib/media/filters';
import { cn } from '@/lib/utils';
import { LibraryBoardView } from './board/LibraryBoardView';
import { AssetDetailModal } from './detail/AssetDetailModal';
import { useCustomFields } from './fields/useCustomFields';
import { LibraryFilterBar } from './LibraryFilterBar';
import { LibrarySidebar } from './LibrarySidebar';
import { MediaGrid } from './MediaGrid';
import { MediaSearchBar } from './MediaSearchBar';
import { UploadStrip } from './UploadStrip';
import { useMediaLibrary } from './useMediaLibrary';
import { useMediaUpload } from './useMediaUpload';

type Props = {
  brandId: string;
  isPaid: boolean;
  initialAssets: MediaAsset[];
  initialCollections: MediaCollection[];
  storageUsedBytes: number;
  captionStyle: CaptionStyle;
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
  captionStyle,
  selectedCollectionId,
  selectedSource,
  selectedKind,
}: Props) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const sourceFilter: SourceFilterValue = selectedSource ?? 'all';
  const kindFilter: KindFilterValue = selectedKind ?? 'all';
  // Tags live in the URL like source/kind, but the RSC page doesn't read them —
  // the client derives them from the search params directly.
  const tagsParam = searchParams.get('tags');
  const selectedTags = useMemo(() => parseTagsParam(tagsParam), [tagsParam]);
  // Filtering is a soft navigation. useTransition keeps the grid visible (and
  // dimmed) during the refetch; useOptimistic flips the active pill instantly so
  // the bar reacts on click instead of waiting for the round-trip to commit.
  const [isFiltering, startFilterTransition] = useTransition();
  const [optimisticSource, setOptimisticSource] = useOptimistic(sourceFilter);
  const [optimisticKind, setOptimisticKind] = useOptimistic(kindFilter);
  const [optimisticTags, setOptimisticTags] = useOptimistic(selectedTags);
  // Custom-field filters stay in client state rather than the URL: the RSC seed
  // cannot pre-filter on them (the values live in their own table), so a URL
  // round-trip would buy nothing but an unreadable query string.
  const { fields: customFields } = useCustomFields(brandId);
  const [fieldFilters, setFieldFilters] = useState<CustomFieldFilter[]>([]);
  const { assets, hasMore, loadingMore, loadMore } = useMediaLibrary({
    brandId,
    collectionId: selectedCollectionId,
    source: selectedSource,
    kind: selectedKind,
    tags: selectedTags,
    fieldFilters,
    seed: initialAssets,
  });
  const { uploads, uploadFiles } = useMediaUpload(brandId);

  const [tagOptions, setTagOptions] = useState<LibraryTagOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/library/tags?brandId=${brandId}`)
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((data: { tags?: LibraryTagOption[] }) => {
        if (!cancelled) setTagOptions(data.tags ?? []);
      })
      .catch((err: unknown) => {
        console.error('[LibraryViewer] tag vocabulary fetch failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const [view, setView] = useState<'media' | 'inspiration'>('media');
  const [layout, setLayout] = useState<'grid' | 'board'>('grid');
  const [detailAsset, setDetailAsset] = useState<MediaAsset | null>(null);
  const [assetRevision, setAssetRevision] = useState(0);
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
  // change resets to page 0. Untouched dimensions derive from the OPTIMISTIC
  // values, not the committed props — rapid multi-chip toggles would otherwise
  // drop an in-flight change. The page reads `collection` (not `collectionId`,
  // which is the API param name).
  const pushFilters = useCallback(
    (next: {
      collectionId?: string | null;
      source?: SourceFilterValue;
      kind?: KindFilterValue;
      tags?: string[];
    }) => {
      setSearchResults(null);
      const nextSource = next.source ?? optimisticSource;
      const nextKind = next.kind ?? optimisticKind;
      const nextTags = next.tags ?? optimisticTags;
      const nextCollectionId =
        next.collectionId !== undefined ? next.collectionId : selectedCollectionId;
      const params = new URLSearchParams();
      if (nextCollectionId) params.set('collection', nextCollectionId);
      if (nextSource !== 'all') params.set('source', nextSource);
      if (nextKind !== 'all') params.set('kind', nextKind);
      if (nextTags.length > 0) params.set('tags', nextTags.join(','));
      const qs = params.toString();
      startFilterTransition(() => {
        setOptimisticSource(nextSource);
        setOptimisticKind(nextKind);
        setOptimisticTags(nextTags);
        router.push(qs ? `/library?${qs}` : '/library');
      });
    },
    [
      router,
      selectedCollectionId,
      optimisticSource,
      optimisticKind,
      optimisticTags,
      setOptimisticSource,
      setOptimisticKind,
      setOptimisticTags,
    ],
  );

  // Selecting a real collection clears the source filter (membership spans
  // sources); selecting a derived "Browse" folder sets source + clears the
  // collection. Both share state so sidebar + chip bar stay in sync.
  const onSelectCollection = useCallback(
    (id: string | null) => pushFilters({ collectionId: id, source: 'all' }),
    [pushFilters],
  );

  const onSelectSource = useCallback(
    (value: SourceFilterValue) => pushFilters({ collectionId: null, source: value }),
    [pushFilters],
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    if (Array.from(e.dataTransfer.types).includes('Files')) setDragging(true);
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
      <div
        className="flex shrink-0 items-center gap-1 border-b border-border px-4 pt-2"
        role="tablist"
        aria-label="Library sections"
      >
        {(['media', 'inspiration'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${
              view === id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {id}
          </button>
        ))}
      </div>

      {view === 'inspiration' ? (
        <CompetitorInspirationPanel brandId={brandId} />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <LibrarySidebar
            brandId={brandId}
            collections={initialCollections}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={onSelectCollection}
            selectedSource={optimisticSource}
            onSelectSource={onSelectSource}
            storageUsedBytes={storageUsedBytes}
          />

          {/* biome-ignore lint/a11y/noStaticElementInteractions: full-area drag-and-drop upload surface; the keyboard-accessible path is the Upload button above */}
          <div
            className={cn(
              'relative flex min-w-0 flex-1 flex-col gap-[var(--app-shell-gap)] overflow-y-auto p-[var(--card-pad)]',
              // Give the docked detail panel its own room once the viewport is
              // wide enough to spare it; below that the panel floats over the
              // grid (still scrollable — there is no scrim and no scroll lock).
              detailAsset && 'min-[1500px]:pr-[58rem]',
            )}
            onDragEnter={handleDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <PageHeader
              title={activeCollection?.name ?? 'All Media'}
              action={
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1 sm:w-64">
                    <MediaSearchBar
                      brandId={brandId}
                      source={selectedSource}
                      kind={selectedKind}
                      collectionId={selectedCollectionId}
                      tags={selectedTags}
                      onResults={setSearchResults}
                      onClear={() => setSearchResults(null)}
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant={showBoundingBoxes ? 'secondary' : 'outline'}
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
              }
            />

            <div className="flex items-center justify-between gap-3">
              <LibraryFilterBar
                source={optimisticSource}
                kind={optimisticKind}
                onSourceChange={(value) => pushFilters({ source: value })}
                onKindChange={(value) => pushFilters({ kind: value })}
                showSource={false}
                tagOptions={tagOptions}
                selectedTags={optimisticTags}
                onTagsChange={(tags) => pushFilters({ tags })}
                customFields={customFields ?? []}
                fieldFilters={fieldFilters}
                onFieldFiltersChange={(next) => {
                  // A field filter narrows the LISTING; a search result set is
                  // ranked server-side against its own filters, so changing one
                  // leaves search mode the way the other chips do.
                  setSearchResults(null);
                  setFieldFilters(next);
                }}
              />
              <div
                className="flex shrink-0 items-center gap-1 rounded-lg border border-border p-0.5"
                role="tablist"
                aria-label="Library layout"
              >
                {(
                  [
                    { id: 'grid', label: 'Grid', Icon: LayoutGrid },
                    { id: 'board', label: 'Board', Icon: Columns3 },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={layout === id}
                    onClick={() => setLayout(id)}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
                      layout === id
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.aep"
              multiple
              className="hidden"
              onChange={(e) => {
                void uploadFiles(e.target.files);
                e.target.value = '';
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
              className={`transition-opacity ${isFiltering ? 'pointer-events-none opacity-60' : ''}`}
              aria-busy={isFiltering}
            >
              {layout === 'board' ? (
                <LibraryBoardView
                  brandId={brandId}
                  filters={{
                    source: selectedSource,
                    kind: selectedKind,
                    tags: selectedTags,
                    collectionId: selectedCollectionId,
                    fieldFilters,
                  }}
                  customFields={customFields ?? []}
                  assetsOverride={isSearching ? displayedAssets : null}
                  refreshKey={assetRevision}
                  onOpenDetail={setDetailAsset}
                />
              ) : (
                <MediaGrid
                  brandId={brandId}
                  assets={displayedAssets}
                  showBoundingBoxes={showBoundingBoxes}
                  captionStyle={captionStyle}
                  emptyHint={isSearching ? 'No results. Try a different search.' : undefined}
                  onLoadMore={isSearching ? undefined : loadMore}
                  hasMore={isSearching ? false : hasMore}
                  loadingMore={loadingMore}
                  onOpenDetail={setDetailAsset}
                  onAssetChanged={() => {
                    setAssetRevision((revision) => revision + 1);
                    router.refresh();
                  }}
                />
              )}
            </div>

            <AssetDetailModal
              brandId={brandId}
              asset={detailAsset}
              onClose={() => setDetailAsset(null)}
              onAssetChanged={() => {
                // The grid re-seeds from the RSC; the board holds its own fetch,
                // so it needs an explicit revision bump to re-read the lanes.
                setAssetRevision((n) => n + 1);
                router.refresh();
              }}
            />

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
        </div>
      )}
    </div>
  );
}
