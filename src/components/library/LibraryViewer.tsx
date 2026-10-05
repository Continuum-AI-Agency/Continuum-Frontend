'use client';

import type {
  CollectionViewConfig,
  CommentDeepLink,
  CustomField,
  CustomFieldFilter,
  LibraryAspectRatioBin,
  LibraryBrowseDestination,
  LibraryBrowseFacets,
  LibraryBrowseQuery,
  LibraryLayout,
  LibraryMediaType,
  LibraryPreviewFrame,
  LibrarySavedView,
  LibrarySort,
  LibrarySortKey,
  LibrarySortSpec,
  MediaAsset,
  MediaCollection,
  MediaSearchResultItem,
  TemplateSourceSummary,
} from '@continuum/contracts';
import {
  classifyLibraryFile,
  LIBRARY_ACCEPT_ATTRIBUTE,
  libraryAspectRatioBin,
  MAX_LIBRARY_THEN_BY,
  templateFamilyForLibraryFormat,
} from '@continuum/contracts';
import {
  ChevronDown,
  Columns3,
  FolderUp,
  GalleryHorizontalEnd,
  LayoutGrid,
  List,
  ScanSearch,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
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
import {
  DesignTemplateImports,
  useDesignTemplateImports,
} from '@/components/forge/DesignTemplateImports';
import { isForgeDesignFile } from '@/components/forge/ForgeProjectDrop';
import { FigmaIcon } from '@/components/shared/icons';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast-imperative';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import {
  createLibraryCollectionOperation,
  mutateCollectionMembershipOperation,
} from '@/lib/library/creativeOperations';
import {
  createFolderCollections,
  type FolderFile,
  folderFilesFromDrop,
  folderFilesFromInput,
  folderPaths,
} from '@/lib/library/folderUpload';
import { librarySearchPath, withReviewStates } from '@/lib/library/libraryHref';
import { fetchTemplateSources } from '@/lib/library/templateSources';
import {
  buildLibraryBrowseParams,
  KIND_FILTERS,
  type KindFilterValue,
  kindToMediaType,
  LIBRARY_SORT_OPTIONS,
  LIBRARY_THEN_BY_KEYS,
  type LibraryTagOption,
  librarySortLabel,
  mediaTypeToKind,
  type SourceFilterValue,
  type StructuredLibraryFilters,
} from '@/lib/media/filters';
import type { LibrarySection } from '@/lib/media/sections';
import { useProjects } from '@/lib/projects';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { LibraryBoardView } from './board/LibraryBoardView';
import { FontUploadReviewDialog } from './FontUploadReviewDialog';
import { useCustomFields } from './fields/useCustomFields';
import { LibraryBulkToolbar } from './LibraryBulkToolbar';
import { LibraryElementsGrid } from './LibraryElementsGrid';
import { LibraryFilterBar } from './LibraryFilterBar';
import { LibraryRenderQueue } from './LibraryRenderQueue';
import { LibrarySidebar } from './LibrarySidebar';
import { LibraryTagManager } from './LibraryTagManager';
import { partitionLibraryUploadFiles } from './libraryUploadRouting';
import { McpUploadIntentPanel } from './McpUploadIntentPanel';
import { MediaGrid } from './MediaGrid';
import { MediaSearchBar } from './MediaSearchBar';
import { PipelinePanel } from './PipelinePanel';
import { PlacementBar } from './PlacementBar';
import { RatioShelves } from './RatioShelves';
import { TemplateGrid } from './TemplateGrid';
import { TypographyPanel } from './TypographyPanel';
import { TrashView } from './trash/TrashView';
import { UploadStrip } from './UploadStrip';
import { useMediaLibrary } from './useMediaLibrary';
import { useMediaUpload } from './useMediaUpload';
import { useCollectionAssetDrop } from './views/assetDrag';
import { CardOptionsMenu } from './views/CardOptionsMenu';
import { chosenCustomFieldIds } from './views/cardOptions';
import { LibraryBreadcrumbs } from './views/LibraryBreadcrumbs';
import { ListView } from './views/ListView';
import { ReelView } from './views/ReelView';
import { stackDroppedAssets } from './views/stackDrop';
import { useAssetFieldValues } from './views/useAssetFieldValues';
import { useLibraryViewPreferences } from './views/useLibraryViewPreferences';

// The detail stage (zoom, players, waveforms) loads when an asset is opened, not with the grid.
const AssetDetailModal = dynamic(
  () => import('./detail/AssetDetailModal').then((module) => module.AssetDetailModal),
  { ssr: false, loading: () => null },
);

const TEMPLATE_ACCEPT_ATTRIBUTE = '.aep,.aepx,.aet,.zip,application/zip,.psd,.ai';

const LAYOUT_TABS = [
  { id: 'grid', label: 'Grid', Icon: LayoutGrid },
  { id: 'list', label: 'List', Icon: List },
  { id: 'board', label: 'Board', Icon: Columns3 },
  { id: 'reel', label: 'Reel', Icon: GalleryHorizontalEnd },
] as const;

type Props = {
  brandId: string;
  isPaid: boolean;
  initialAssets: MediaAsset[];
  initialDetailAsset: MediaAsset | null;
  initialNextCursor: string | null;
  initialBrowseQuery: LibraryBrowseQuery;
  initialCollections: MediaCollection[];
  initialSavedViews: LibrarySavedView[];
  captionStyle: CaptionStyle;
  section: LibrarySection;
  initialDeepLink?: CommentDeepLink;
  /** The user's saved layout + card options (media.library_view_preferences). */
  initialViewConfig?: CollectionViewConfig;
  initialTrashOpen?: boolean;
};

export function LibraryViewer({
  brandId,
  isPaid,
  initialAssets,
  initialDetailAsset,
  initialNextCursor,
  initialBrowseQuery,
  initialCollections,
  initialSavedViews,
  captionStyle,
  section,
  initialDeepLink,
  initialViewConfig = {},
  initialTrashOpen = false,
}: Props) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const selectedCollectionId = initialBrowseQuery.collectionId ?? null;
  const selectedSource = initialBrowseQuery.createdWith[0] ?? null;
  const selectedKind = mediaTypeToKind(initialBrowseQuery.mediaType);
  const sourceFilter: SourceFilterValue = selectedSource ?? 'all';
  const kindFilter: KindFilterValue = selectedKind ?? 'all';
  const selectedTags = initialBrowseQuery.tags;
  // Filtering is a soft navigation. useTransition keeps the grid visible (and
  // dimmed) during the refetch; useOptimistic flips the active pill instantly so
  // the bar reacts on click instead of waiting for the round-trip to commit.
  const [isFiltering, startFilterTransition] = useTransition();
  const [optimisticSource, setOptimisticSource] = useOptimistic<SourceFilterValue>(sourceFilter);
  const [optimisticCreatedWith, setOptimisticCreatedWith] = useOptimistic(
    initialBrowseQuery.createdWith,
  );
  const [optimisticKind, setOptimisticKind] = useOptimistic<KindFilterValue>(kindFilter);
  const [optimisticMediaType, setOptimisticMediaType] = useOptimistic<LibraryMediaType>(
    initialBrowseQuery.mediaType,
  );
  const [optimisticTags, setOptimisticTags] = useOptimistic(selectedTags);
  const [optimisticProjectIds, setOptimisticProjectIds] = useOptimistic(
    initialBrowseQuery.projectIds,
  );
  // The project vocabulary the filter section and the bulk "tag into project" control both
  // read. One fetch for the page: two hooks would be two identical round-trips.
  const { projects } = useProjects(brandId);
  // A new project filters the Library to zero rows, and the generic "No media yet." reads as
  // a broken Library rather than as an empty scope — the first thing a user sees after
  // creating their first project should not look like a bug. Named, so the message can say
  // WHICH project is empty when exactly one is selected.
  const filteredProjectNames = initialBrowseQuery.projectIds
    .map((id) => projects.find((project) => project.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const [optimisticSort, setOptimisticSort] = useOptimistic(initialBrowseQuery.sort);
  const [optimisticLayout, setOptimisticLayout] = useOptimistic(initialBrowseQuery.layout);
  const [optimisticReviewStatuses, setOptimisticReviewStatuses] = useOptimistic(
    initialBrowseQuery.reviewStatuses,
  );
  const committedStructured = useMemo<StructuredLibraryFilters>(
    () => ({
      families: initialBrowseQuery.families,
      ranges: initialBrowseQuery.ranges,
      technical: initialBrowseQuery.technical,
      fieldRanges: initialBrowseQuery.fieldRanges,
    }),
    [initialBrowseQuery],
  );
  const [optimisticStructured, setOptimisticStructured] = useOptimistic(committedStructured);
  const [optimisticThenBy, setOptimisticThenBy] = useOptimistic(initialBrowseQuery.thenBy);
  // Custom-field filters stay in client state rather than the URL: the RSC seed
  // cannot pre-filter on them (the values live in their own table), so a URL
  // round-trip would buy nothing but an unreadable query string.
  const { fields: customFields } = useCustomFields(brandId);
  const [fieldFilters, setFieldFilters] = useState<CustomFieldFilter[]>([]);
  // The brand's custom review states (review_state_id). Client state like the field filters —
  // the browse read model cannot filter on them — mirrored into ?reviewStates= so a link keeps
  // the view.
  const [reviewStateIds, setReviewStateIdsState] = useState<string[]>(() =>
    typeof window === 'undefined'
      ? []
      : (new URLSearchParams(window.location.search).get('reviewStates') ?? '')
          .split(',')
          .filter(Boolean),
  );
  // The URL the filters were last navigated to, while that navigation is still pending: the
  // custom-state setter and the filter push each build on it, so neither drops the other.
  const pendingPathRef = useRef<string | null>(null);
  const reviewStateIdsRef = useRef(reviewStateIds);
  useEffect(() => {
    pendingPathRef.current = null;
  }, [initialBrowseQuery]);
  const { assets, hasMore, loadingMore, loadMore } = useMediaLibrary({
    query: initialBrowseQuery,
    fieldFilters,
    reviewStateIds,
    seed: initialAssets,
    initialNextCursor,
  });
  const [tagOptions, setTagOptions] = useState<LibraryTagOption[]>([]);
  const [familyCounts, setFamilyCounts] = useState<Record<string, number>>({});
  const [reviewStateCounts, setReviewStateCounts] = useState<Record<string, number>>({});
  const [tagRevision, setTagRevision] = useState(0);
  const facetQueryKey = buildLibraryBrowseParams(initialBrowseQuery, {
    includeBrandId: true,
    cursor: null,
  }).toString();
  useEffect(() => {
    let cancelled = false;
    const countsByValue = (facets: LibraryBrowseFacets['families'] = []) =>
      Object.fromEntries(facets.map(({ value, count }) => [value, count]));
    fetch(`/api/library/facets?${facetQueryKey}`)
      .then((response) => (response.ok ? response.json() : { tags: [] }))
      .then((data: Pick<LibraryBrowseFacets, 'tags'> & Partial<LibraryBrowseFacets>) => {
        if (!cancelled) {
          setTagOptions(data.tags.map(({ value, count }) => ({ tag: value, count })));
          setFamilyCounts(countsByValue(data.families));
          setReviewStateCounts(countsByValue(data.reviewStates));
        }
      })
      .catch((err: unknown) => {
        console.error('[LibraryViewer] tag vocabulary fetch failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [facetQueryKey, tagRevision]);

  const {
    card: cardOptions,
    setLayout: saveLayout,
    setCard,
  } = useLibraryViewPreferences(brandId, initialViewConfig);
  const chosenFields = chosenCustomFieldIds(cardOptions)
    .map((id) => customFields?.find((field) => field.id === id))
    .filter((field): field is CustomField => !!field);
  const [trashOpen, setTrashOpen] = useState(initialTrashOpen);
  const [view, setView] = useState<'media' | 'inspiration'>('media');
  const [detailAsset, setDetailAsset] = useState<MediaAsset | null>(initialDetailAsset);
  const [deepLink, setDeepLink] = useState<CommentDeepLink>(
    initialDeepLink ?? { commentId: null, timeMs: null, endMs: null },
  );
  const [assetRevision, setAssetRevision] = useState(0);
  // Loaded for the Templates and Typography panels. Typography needs them too: "which
  // families do your templates ask for" is the whole reason the two sections sit together.
  const [templateSources, setTemplateSources] = useState<TemplateSourceSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<MediaSearchResultItem[] | null>(null);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState(false);
  const [fontReviewFiles, setFontReviewFiles] = useState<File[]>([]);
  const [fontRevision, setFontRevision] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Files from a folder upload → the collection made for the folder each one sat in.
  const folderTargets = useRef(new Map<File, string>());
  const dragDepth = useRef(0);

  const isSearching = searchResults !== null;
  const emptyHint = isSearching
    ? 'No results. Try a different search.'
    : filteredProjectNames.length === 1
      ? `Nothing in ${filteredProjectNames[0]} yet. Select assets and use Tag to add them.`
      : filteredProjectNames.length > 1
        ? 'Nothing in these projects yet. Select assets and use Tag to add them.'
        : undefined;
  const displayedAssets = (() => {
    const rows = isSearching ? searchResults!.map((r) => r.asset) : assets;
    const bins = initialBrowseQuery.aspectRatios;
    if (bins.length === 0) return rows;
    const allowed = new Set(bins);
    return rows.filter((asset) => {
      const bin = asset.aspectRatio ?? libraryAspectRatioBin(asset.width, asset.height);
      return bin != null && allowed.has(bin);
    });
  })();
  const fieldValues = useAssetFieldValues(
    brandId,
    displayedAssets.map((asset) => asset.id),
    chosenFields.length > 0 && (optimisticLayout === 'grid' || optimisticLayout === 'list'),
    assetRevision,
  );
  const activeCollection = selectedCollectionId
    ? initialCollections.find((c) => c.id === selectedCollectionId)
    : null;
  const destinationTitle: Record<string, string> = {
    home: 'Home',
    canvas: 'Canvas',
    elements: 'Elements',
    sources: 'Source files',
    templates: 'Templates',
    review: 'Needs review',
    everything: 'Everything',
    images: 'Images',
    videos: 'Videos',
  };
  const browseTitle =
    destinationTitle[initialBrowseQuery.destination ?? ''] ??
    (optimisticMediaType === 'carousel'
      ? 'Carousels'
      : KIND_FILTERS.find((option) => option.value === optimisticKind)?.label);

  // A List column header can order by any key in either direction; the select still names it.
  const sortOptions = LIBRARY_SORT_OPTIONS.filter(
    (option) => option.value !== 'manual' || selectedCollectionId,
  );
  if (!sortOptions.some((option) => option.value === optimisticSort)) {
    sortOptions.push({ value: optimisticSort, label: librarySortLabel(optimisticSort) });
  }

  const showTemplates = initialBrowseQuery.templateOnly;
  const showTypography = section === 'typography';
  const showPipelines = section === 'pipelines';
  const showElements = initialBrowseQuery.destination === 'elements';
  // Only fetched for the two panels that read it — the creative grid must not pay for a
  // template list nobody asked for.
  const needsTemplateSources = showTemplates || showTypography;
  // assetRevision is intentional: a Forge hand-off or a new upload bumps it, and that bump
  // IS the signal to re-read the template list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: assetRevision re-fetches after a write
  useEffect(() => {
    if (!needsTemplateSources) return;
    let cancelled = false;
    setTemplatesLoading(true);
    fetchTemplateSources(brandId)
      .then((items) => {
        if (!cancelled) setTemplateSources(items);
      })
      .catch((error: unknown) => {
        console.error('[LibraryViewer] template source fetch failed', error);
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, needsTemplateSources, assetRevision]);

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
      createdWith?: LibraryBrowseQuery['createdWith'];
      kind?: KindFilterValue;
      mediaType?: LibraryMediaType;
      tags?: string[];
      projectIds?: string[];
      destination?: LibraryBrowseQuery['destination'];
      previewFrame?: LibraryPreviewFrame;
      aspectRatios?: LibraryBrowseQuery['aspectRatios'];
      sort?: LibrarySort;
      layout?: LibraryLayout;
      reviewStatuses?: LibraryBrowseQuery['reviewStatuses'];
      placements?: LibraryBrowseQuery['placements'];
      used?: boolean | null;
      shared?: boolean | null;
      leadingOnly?: boolean;
      templateOnly?: boolean;
      ratios?: string[];
      fonts?: string[];
      performanceWindow?: LibraryBrowseQuery['performanceWindow'];
      boardGroupBy?: string;
      // Replaces all four at once: a key absent here means cleared, not unchanged.
      structured?: StructuredLibraryFilters;
      thenBy?: LibrarySortSpec[];
    }) => {
      setSearchResults(null);
      setTrashOpen(false);
      const nextSource = next.createdWith
        ? (next.createdWith[0] ?? 'all')
        : (next.source ?? optimisticSource);
      const nextCreatedWith =
        next.createdWith ??
        (next.source !== undefined
          ? next.source === 'all'
            ? []
            : [next.source]
          : optimisticCreatedWith);
      const nextKind = next.kind ?? optimisticKind;
      const nextMediaType =
        next.mediaType ??
        (next.kind !== undefined
          ? kindToMediaType(nextKind === 'all' ? null : nextKind)
          : optimisticMediaType);
      const nextTags = next.tags ?? optimisticTags;
      const nextProjectIds = next.projectIds ?? optimisticProjectIds;
      const nextSort = next.sort ?? optimisticSort;
      const nextThenBy = next.thenBy ?? optimisticThenBy;
      const nextStructured = next.structured ?? optimisticStructured;
      const nextFamilies = nextStructured.families ?? [];
      const nextLayout = next.layout ?? optimisticLayout;
      const nextCollectionId =
        next.collectionId !== undefined ? next.collectionId : selectedCollectionId;
      const nextQuery: LibraryBrowseQuery = {
        ...initialBrowseQuery,
        collectionId: nextCollectionId,
        mediaType: nextMediaType,
        createdWith: [...nextCreatedWith],
        tags: [...nextTags],
        projectIds: [...nextProjectIds],
        reviewStatuses: next.reviewStatuses ?? initialBrowseQuery.reviewStatuses,
        placements: next.placements ?? initialBrowseQuery.placements,
        used: next.used !== undefined ? next.used : initialBrowseQuery.used,
        shared: next.shared !== undefined ? next.shared : initialBrowseQuery.shared,
        leadingOnly: next.leadingOnly ?? initialBrowseQuery.leadingOnly,
        templateOnly: next.templateOnly ?? false,
        ratios: next.ratios ?? initialBrowseQuery.ratios,
        fonts: next.fonts ?? initialBrowseQuery.fonts,
        performanceWindow: next.performanceWindow ?? initialBrowseQuery.performanceWindow,
        families: [...nextFamilies],
        ranges: nextStructured.ranges,
        technical: nextStructured.technical,
        fieldRanges: [...(nextStructured.fieldRanges ?? [])],
        sort: nextSort,
        thenBy: [...nextThenBy],
        layout: nextLayout,
        boardGroupBy: next.boardGroupBy ?? initialBrowseQuery.boardGroupBy,
        destination: next.destination ?? initialBrowseQuery.destination,
        previewFrame: next.previewFrame ?? initialBrowseQuery.previewFrame,
        aspectRatios:
          next.aspectRatios !== undefined
            ? next.aspectRatios
            : next.previewFrame && next.previewFrame !== 'native'
              ? []
              : initialBrowseQuery.aspectRatios,
        cursor: null,
      };
      if (nextQuery.sort === 'manual' && !nextCollectionId) nextQuery.sort = 'created_desc';
      // Home is recent images and videos only, so a Format choice there would read as empty.
      if (nextFamilies.length > 0 && nextQuery.destination === 'home') {
        nextQuery.destination = 'everything';
      }
      startFilterTransition(() => {
        setOptimisticSource(nextSource);
        setOptimisticCreatedWith(nextCreatedWith);
        setOptimisticKind(nextKind);
        setOptimisticMediaType(nextMediaType);
        setOptimisticTags(nextTags);
        setOptimisticProjectIds(nextProjectIds);
        setOptimisticSort(nextSort);
        setOptimisticThenBy(nextThenBy);
        setOptimisticStructured(nextStructured);
        setOptimisticLayout(nextLayout);
        setOptimisticReviewStatuses(nextQuery.reviewStatuses);
        const path = withReviewStates(
          librarySearchPath(nextQuery, {
            assetId: detailAsset?.id,
            deepLink: detailAsset ? deepLink : null,
          }),
          reviewStateIdsRef.current,
        );
        pendingPathRef.current = path;
        router.push(path);
      });
    },
    [
      router,
      detailAsset,
      deepLink,
      selectedCollectionId,
      optimisticSource,
      optimisticCreatedWith,
      optimisticKind,
      optimisticMediaType,
      optimisticTags,
      optimisticProjectIds,
      optimisticSort,
      optimisticThenBy,
      optimisticStructured,
      optimisticLayout,
      initialBrowseQuery,
      setOptimisticSource,
      setOptimisticCreatedWith,
      setOptimisticKind,
      setOptimisticMediaType,
      setOptimisticTags,
      setOptimisticProjectIds,
      setOptimisticSort,
      setOptimisticThenBy,
      setOptimisticStructured,
      setOptimisticLayout,
      setOptimisticReviewStatuses,
    ],
  );

  // Selecting a real collection clears the source filter (membership spans
  // sources); selecting a derived "Browse" folder sets source + clears the
  // collection. Both share state so sidebar + chip bar stay in sync.
  const onSelectCollection = useCallback(
    (id: string | null) => pushFilters({ collectionId: id, source: 'all' }),
    [pushFilters],
  );

  const onSelectKind = useCallback(
    (value: KindFilterValue) => pushFilters({ collectionId: null, kind: value }),
    [pushFilters],
  );

  const openDetail = useCallback(
    (asset: MediaAsset, link: CommentDeepLink | null = null) => {
      setDetailAsset(asset);
      setDeepLink(link ?? { commentId: null, timeMs: null, endMs: null });
      router.replace(
        withReviewStates(
          librarySearchPath(initialBrowseQuery, {
            assetId: asset.id,
            deepLink: link,
          }),
          reviewStateIdsRef.current,
        ),
        { scroll: false },
      );
    },
    [initialBrowseQuery, router],
  );

  const closeDetail = useCallback(() => {
    setDetailAsset(null);
    setDeepLink({ commentId: null, timeMs: null, endMs: null });
    router.replace(
      withReviewStates(librarySearchPath(initialBrowseQuery), reviewStateIdsRef.current),
      { scroll: false },
    );
  }, [initialBrowseQuery, router]);

  // The grid re-seeds from the RSC; the board holds its own fetch, so it also needs
  // an explicit revision bump to re-read.
  const refreshAssets = useCallback(() => {
    setAssetRevision((revision) => revision + 1);
    router.refresh();
  }, [router]);

  const toggleSelected = useCallback(
    (asset: MediaAsset) =>
      setSelectedAssetIds((current) => {
        const next = new Set(current);
        if (next.has(asset.id)) next.delete(asset.id);
        else next.add(asset.id);
        return next;
      }),
    [],
  );

  // The preference is written BEFORE navigating: a URL without `layout` (grid) makes
  // the page read the saved one, and it must not read the previous choice.
  const onLayoutChange = useCallback(
    (layout: LibraryLayout) => {
      void saveLayout(layout).then(() => pushFilters({ layout }));
    },
    [pushFilters, saveLayout],
  );

  const onStackDrop = useCallback(
    (target: MediaAsset, sourceAssetIds: string[]) => {
      void stackDroppedAssets(brandId, target, sourceAssetIds).then((stacked) => {
        if (!stacked) return;
        setSelectedAssetIds((current) => {
          const next = new Set(current);
          for (const id of sourceAssetIds) next.delete(id);
          return next;
        });
        refreshAssets();
      });
    },
    [brandId, refreshAssets],
  );

  const collectionDrop = useCollectionAssetDrop({
    brandId,
    sourceCollectionId: selectedCollectionId,
    collectionName: (id) => initialCollections.find((collection) => collection.id === id)?.name,
    onDropped: refreshAssets,
  });

  const setReviewStateIds = useCallback(
    (ids: string[]) => {
      // Like the field filters: narrowing the listing leaves search mode.
      setSearchResults(null);
      setReviewStateIdsState(ids);
      reviewStateIdsRef.current = ids;
      const path = withReviewStates(
        pendingPathRef.current ?? `${window.location.pathname}${window.location.search}`,
        ids,
      );
      if (pendingPathRef.current) {
        // A filter navigation is in flight: supersede it through the router with the URL that
        // carries both, so the page data (and the grid's refetch) follows. An out-of-band
        // history write here left the pending navigation stranded — the grid kept the query
        // without the base status and never refetched.
        pendingPathRef.current = path;
        startFilterTransition(() => router.replace(path, { scroll: false }));
        return;
      }
      window.history.replaceState(null, '', path);
    },
    [router],
  );

  const setTrashUrl = useCallback(
    (open: boolean) => {
      window.history.replaceState(
        null,
        '',
        open
          ? '/library?view=trash'
          : withReviewStates(librarySearchPath(initialBrowseQuery), reviewStateIdsRef.current),
      );
    },
    [initialBrowseQuery],
  );

  // Card presentation + stacking for every grid, including the ratio shelves, which
  // forward their props to MediaGrid.
  const gridCardProps = {
    card: cardOptions,
    cardFields: chosenFields,
    fieldValues,
    onStackDrop,
  };

  const detailIndex = detailAsset
    ? displayedAssets.findIndex((asset) => asset.id === detailAsset.id)
    : -1;
  const previousAsset = detailIndex > 0 ? displayedAssets[detailIndex - 1] : undefined;
  const nextAsset = detailIndex >= 0 ? displayedAssets[detailIndex + 1] : undefined;

  const onDeepLinkChange = useCallback(
    (link: CommentDeepLink) => {
      setDeepLink(link);
      if (!detailAsset) return;
      router.replace(
        withReviewStates(
          librarySearchPath(initialBrowseQuery, { assetId: detailAsset.id, deepLink: link }),
          reviewStateIdsRef.current,
        ),
        { scroll: false },
      );
    },
    [detailAsset, initialBrowseQuery, router],
  );

  const onSelectPreviewFrame = useCallback(
    (frame: LibraryPreviewFrame) => {
      pushFilters({
        previewFrame: frame,
        aspectRatios: frame === 'native' ? initialBrowseQuery.aspectRatios : [],
      });
    },
    [pushFilters, initialBrowseQuery.aspectRatios],
  );

  const onSelectRatioBin = useCallback(
    (bin: LibraryAspectRatioBin) => {
      pushFilters({
        previewFrame: 'native',
        aspectRatios: [bin],
        destination: 'home',
      });
    },
    [pushFilters],
  );

  const onSelectDestination = useCallback(
    (destination: LibraryBrowseDestination) => {
      const common = {
        collectionId: null,
        source: 'all' as const,
        reviewStatuses: [] as LibraryBrowseQuery['reviewStatuses'],
        createdWith: [] as LibraryBrowseQuery['createdWith'],
        destination,
        templateOnly: false,
      };
      switch (destination) {
        case 'home':
          pushFilters({ ...common, mediaType: 'all', sort: 'updated_desc' });
          return;
        case 'images':
          pushFilters({ ...common, mediaType: 'image', sort: 'created_desc' });
          return;
        case 'videos':
          pushFilters({ ...common, mediaType: 'video', sort: 'created_desc' });
          return;
        case 'canvas':
          pushFilters({
            ...common,
            mediaType: 'all',
            createdWith: ['canvas'],
            sort: 'updated_desc',
          });
          return;
        case 'templates':
          pushFilters({
            ...common,
            mediaType: 'project_file',
            templateOnly: true,
            sort: 'created_desc',
          });
          return;
        case 'sources':
          pushFilters({ ...common, mediaType: 'project_file', sort: 'created_desc' });
          return;
        case 'typography':
          startFilterTransition(() => router.push('/library?section=typography'));
          return;
        case 'pipelines':
          startFilterTransition(() => router.push('/library?section=pipelines'));
          return;
        case 'review':
          pushFilters({
            ...common,
            mediaType: 'all',
            reviewStatuses: ['in_review', 'needs_changes'],
            sort: 'updated_desc',
          });
          return;
        case 'elements':
          pushFilters({ ...common, mediaType: 'all', sort: 'updated_desc' });
          return;
        case 'everything':
          pushFilters({ ...common, mediaType: 'all', sort: 'created_desc' });
      }
    },
    [pushFilters, router],
  );

  const { imports: designImports, start: importDesign } = useDesignTemplateImports(brandId, () => {
    setAssetRevision((revision) => revision + 1);
    router.refresh();
  });

  // A Photoshop/Illustrator file dropped on Templates becomes one (anywhere else it is just a file).
  const templateDesigns = useRef(new Set<File>());
  const onUploaded = useCallback(
    ({ file, uploaded }: { file: File; uploaded: { assetId: string } }) => {
      if (templateDesigns.current.delete(file)) void importDesign(file.name, uploaded.assetId);
      const collectionId = folderTargets.current.get(file);
      if (collectionId) {
        folderTargets.current.delete(file);
        void mutateCollectionMembershipOperation(createSupabaseBrowserClient(), {
          brandId,
          collectionId,
          assetIds: [uploaded.assetId],
          mode: 'add',
        })
          .then(() => router.refresh())
          .catch(() => toast.error(`${file.name} uploaded, but could not be filed in its folder`));
      }
      setAssetRevision((revision) => revision + 1);
      router.refresh();
      const format = classifyLibraryFile({ fileName: file.name, mimeType: file.type });
      if (format.accepted && templateFamilyForLibraryFormat(format.family)) {
        onSelectDestination('templates');
      }
    },
    [brandId, importDesign, onSelectDestination, router],
  );
  const { uploads, uploadFiles, pauseUpload, resumeUpload, retryUpload, cancelUpload, moveUpload } =
    useMediaUpload(brandId, { onUploaded });

  const onSelectSavedView = useCallback(
    (savedView: LibrarySavedView) => {
      const params = buildLibraryBrowseParams(
        { ...savedView.query, brandId, cursor: null },
        { includeBrandId: false, cursor: null },
      );
      setSearchResults(null);
      startFilterTransition(() => router.push(`/library?${params.toString()}`));
    },
    [brandId, router],
  );

  const routeUploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      let files = Array.from(fileList);
      if (showTemplates) {
        try {
          const { expandDesignArchives } = await import('@/components/forge/designArchive');
          files = await expandDesignArchives(files);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not open the ZIP');
          return;
        }
      }
      const { fonts, media } = partitionLibraryUploadFiles(files);
      if (fonts.length > 0) setFontReviewFiles(fonts);
      if (showTemplates) {
        for (const file of media)
          if (isForgeDesignFile(file.name)) templateDesigns.current.add(file);
      }
      if (media.length > 0) void uploadFiles(media);
    },
    [showTemplates, uploadFiles],
  );

  const routeFolderFiles = useCallback(
    async (entries: FolderFile[]) => {
      try {
        const ids = await createFolderCollections(folderPaths(entries), ({ name, parentId }) =>
          createLibraryCollectionOperation(createSupabaseBrowserClient(), {
            brandId,
            name,
            kind: 'manual',
            parentId,
          }),
        );
        for (const { file, folders } of entries) {
          const collectionId = ids.get(folders.join('/'));
          if (collectionId) folderTargets.current.set(file, collectionId);
        }
        router.refresh();
      } catch {
        toast.error('Could not recreate the folders as collections; uploading the files anyway');
      }
      routeUploadFiles(entries.map((entry) => entry.file));
    },
    [brandId, routeUploadFiles, router],
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
    const { files, items } = e.dataTransfer;
    // Started synchronously: the dropped entries are gone once this handler returns.
    void folderFilesFromDrop(items).then((entries) =>
      entries ? routeFolderFiles(entries) : routeUploadFiles(files),
    );
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
          {/* Delegated drop target: any sidebar row carrying data-collection-id
              accepts dragged assets (useCollectionAssetDrop finds the row). */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: drop delegation only; the sidebar rows stay the interactive controls */}
          <div
            className="flex min-h-0"
            onDragOver={collectionDrop.onDragOver}
            onDragLeave={collectionDrop.onDragLeave}
            onDrop={collectionDrop.onDrop}
          >
            <LibrarySidebar
              brandId={brandId}
              collections={initialCollections}
              savedViews={initialSavedViews}
              currentQuery={initialBrowseQuery}
              onSelectSavedView={onSelectSavedView}
              selectedCollectionId={selectedCollectionId}
              onSelectCollection={onSelectCollection}
              selectedMediaType={optimisticMediaType}
              selectedSort={optimisticSort}
              selectedReviewStatuses={optimisticReviewStatuses}
              selectedTemplateOnly={showTemplates}
              section={section}
              onSelectDestination={onSelectDestination}
            />
          </div>

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
              title={
                showTypography
                  ? 'Typography'
                  : showPipelines
                    ? 'Pipelines'
                    : showTemplates
                      ? 'Templates'
                      : (activeCollection?.name ?? browseTitle ?? 'Home')
              }
              action={
                showTemplates ? undefined : (
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1 sm:w-64">
                      <MediaSearchBar
                        brandId={brandId}
                        source={selectedSource}
                        kind={selectedKind}
                        collectionId={selectedCollectionId}
                        tags={selectedTags}
                        reviewStateIds={reviewStateIds}
                        reviewStatuses={optimisticReviewStatuses}
                        customFields={customFields ?? []}
                        onResults={setSearchResults}
                        onClear={() => setSearchResults(null)}
                      />
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* Still disabled, and deliberately. The dialog and the whole importer
                        are written, but POST /figma/import answers 501 by design until its
                        live bench and product review are accepted
                        (integrations-ts/src/figma.ts). Rendering the dialog over that would
                        trade an honest "not yet" for a button that fails on click. The
                        structural parse behind it is wired and tested, so parity ships the
                        day that route opens. */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                        title="Figma import is work in progress"
                      >
                        <FigmaIcon className="size-4" />
                        <span className="hidden sm:inline">Figma</span>
                        <span className="rounded bg-muted px-1 py-0.5 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
                          WIP
                        </span>
                      </Button>
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
                        variant={trashOpen ? 'secondary' : 'outline'}
                        size="sm"
                        data-testid="library-trash-open"
                        aria-pressed={trashOpen}
                        onClick={() => {
                          setTrashOpen(!trashOpen);
                          setTrashUrl(!trashOpen);
                        }}
                        title="Recently deleted assets"
                      >
                        <Trash2 className="size-4" />
                        <span className="hidden sm:inline">Trash</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="library-upload-folder"
                        onClick={() => folderInputRef.current?.click()}
                        title="Upload a folder: its subfolders become nested collections"
                      >
                        <FolderUp className="size-4" />
                        <span className="hidden sm:inline">Folder</span>
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
                )
              }
            />

            <div
              className={cn(
                'flex items-center justify-between gap-3',
                (showTemplates || showTypography || showPipelines || showElements || trashOpen) &&
                  'hidden',
              )}
            >
              <LibraryFilterBar
                source={optimisticSource}
                kind={optimisticKind}
                onSourceChange={(value) => pushFilters({ source: value })}
                onKindChange={(value) => pushFilters({ kind: value })}
                mediaType={optimisticMediaType}
                onMediaTypeChange={(value) => pushFilters({ mediaType: value })}
                createdWith={optimisticCreatedWith}
                onCreatedWithChange={(values) => pushFilters({ createdWith: values })}
                placements={initialBrowseQuery.placements}
                onPlacementsChange={(values) => pushFilters({ placements: values })}
                reviewStatuses={optimisticReviewStatuses}
                onReviewStatusesChange={(values) => pushFilters({ reviewStatuses: values })}
                brandId={brandId}
                reviewStateIds={reviewStateIds}
                onReviewStateIdsChange={setReviewStateIds}
                used={initialBrowseQuery.used}
                onUsedChange={(value) => pushFilters({ used: value })}
                shared={initialBrowseQuery.shared}
                onSharedChange={(value) => pushFilters({ shared: value })}
                leadingOnly={initialBrowseQuery.leadingOnly}
                onLeadingOnlyChange={(value) => pushFilters({ leadingOnly: value })}
                showSource
                tagOptions={tagOptions}
                selectedTags={optimisticTags}
                onTagsChange={(tags) => pushFilters({ tags })}
                projectOptions={projects}
                selectedProjectIds={optimisticProjectIds}
                onProjectIdsChange={(projectIds) => pushFilters({ projectIds })}
                customFields={customFields ?? []}
                fieldFilters={fieldFilters}
                onFieldFiltersChange={(next) => {
                  // A field filter narrows the LISTING; a search result set is
                  // ranked server-side against its own filters, so changing one
                  // leaves search mode the way the other chips do.
                  setSearchResults(null);
                  setFieldFilters(next);
                }}
                structuredFilters={optimisticStructured}
                onStructuredFiltersChange={(structured) => pushFilters({ structured })}
                familyCounts={familyCounts}
                reviewStateCounts={reviewStateCounts}
              />
              {view === 'media' &&
              !showTemplates &&
              !showTypography &&
              !showPipelines &&
              !showElements ? (
                <PlacementBar
                  value={initialBrowseQuery.previewFrame}
                  onChange={onSelectPreviewFrame}
                />
              ) : null}
              {tagOptions.length > 0 ? (
                <LibraryTagManager
                  brandId={brandId}
                  options={tagOptions}
                  onCompleted={(sourceTags, targetTag) => {
                    setTagRevision((revision) => revision + 1);
                    const sourceSet = new Set(sourceTags.map((tag) => tag.toLocaleLowerCase()));
                    if (optimisticTags.some((tag) => sourceSet.has(tag.toLocaleLowerCase()))) {
                      pushFilters({
                        tags: [
                          ...new Set(
                            optimisticTags.map((tag) =>
                              sourceSet.has(tag.toLocaleLowerCase()) ? targetTag : tag,
                            ),
                          ),
                        ],
                      });
                    }
                  }}
                />
              ) : null}
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={optimisticSort}
                  onValueChange={(value: LibrarySort) => pushFilters({ sort: value })}
                >
                  <SelectTrigger size="sm" aria-label="Sort library" className="h-8">
                    <SelectValue
                      items={Object.fromEntries(
                        sortOptions.map((option) => [option.value, option.label]),
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {sortOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ThenBySortControl
                  value={optimisticThenBy}
                  onChange={(thenBy) => pushFilters({ thenBy })}
                />
                {optimisticSort === 'best_performing' ? (
                  <Select
                    value={initialBrowseQuery.performanceWindow}
                    onValueChange={(value: LibraryBrowseQuery['performanceWindow']) =>
                      pushFilters({ performanceWindow: value })
                    }
                  >
                    <SelectTrigger size="sm" aria-label="Performance window" className="h-8 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value="d7">7 days</SelectItem>
                      <SelectItem value="d14">14 days</SelectItem>
                      <SelectItem value="d30">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
                {optimisticLayout === 'grid' || optimisticLayout === 'list' ? (
                  <CardOptionsMenu
                    card={cardOptions}
                    customFields={customFields ?? []}
                    onChange={setCard}
                    showSizeAndAspect={optimisticLayout === 'grid'}
                  />
                ) : null}
                <div
                  className="flex items-center gap-1 rounded-lg border border-border p-0.5"
                  role="tablist"
                  aria-label="Library layout"
                >
                  {LAYOUT_TABS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      data-testid={`library-layout-${id}`}
                      aria-selected={optimisticLayout === id}
                      onClick={() => onLayoutChange(id)}
                      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
                        optimisticLayout === id
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
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={showTemplates ? TEMPLATE_ACCEPT_ATTRIBUTE : LIBRARY_ACCEPT_ATTRIBUTE}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) routeUploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              data-testid="library-folder-input"
              // Not in React's typings; it makes the picker choose a folder and gives every
              // file its webkitRelativePath.
              {...{ webkitdirectory: '' }}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void routeFolderFiles(folderFilesFromInput(e.target.files));
                e.target.value = '';
              }}
            />

            <McpUploadIntentPanel brandId={brandId} />

            <AnimatePresence initial={false}>
              {uploads.length > 0 && (
                <UploadStrip
                  uploads={uploads}
                  onPause={pauseUpload}
                  onResume={resumeUpload}
                  onRetry={retryUpload}
                  onCancel={cancelUpload}
                  onMove={moveUpload}
                />
              )}
            </AnimatePresence>
            <DesignTemplateImports
              imports={designImports}
              onRetry={importDesign}
              sourceIds={templateSources.map((source) => source.assetId)}
              onOpen={(assetId) => router.push(`/forge?template=${encodeURIComponent(assetId)}`)}
            />

            {selectedAssetIds.size > 0 ? (
              <LibraryBulkToolbar
                brandId={brandId}
                assetIds={[...selectedAssetIds]}
                collections={initialCollections}
                projects={projects}
                customFields={customFields ?? []}
                currentCollectionId={selectedCollectionId}
                onClear={() => setSelectedAssetIds(new Set())}
                onProjectCreatedAction={(projectId) => pushFilters({ projectIds: [projectId] })}
                onCompleted={() => {
                  setAssetRevision((revision) => revision + 1);
                  router.refresh();
                }}
              />
            ) : null}

            {!isPaid && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-600 dark:text-amber-400">
                Upgrade to a paid plan to enable AI analysis, descriptions, and semantic search.
              </div>
            )}

            {view === 'media' ? <LibraryRenderQueue /> : null}

            {selectedCollectionId && !trashOpen ? (
              <LibraryBreadcrumbs
                collections={initialCollections}
                collectionId={selectedCollectionId}
                onSelectCollection={onSelectCollection}
                drop={collectionDrop}
              />
            ) : null}

            <div
              className={`transition-opacity ${isFiltering ? 'pointer-events-none opacity-60' : ''}`}
              aria-busy={isFiltering}
            >
              {trashOpen ? (
                <TrashView
                  brandId={brandId}
                  onClose={() => {
                    setTrashOpen(false);
                    setTrashUrl(false);
                  }}
                  onRestored={refreshAssets}
                />
              ) : showTypography ? (
                <TypographyPanel
                  key={fontRevision}
                  brandId={brandId}
                  templateSources={templateSources}
                  onReviewFiles={setFontReviewFiles}
                />
              ) : showPipelines ? (
                <PipelinePanel brandId={brandId} />
              ) : showElements ? (
                <LibraryElementsGrid brandId={brandId} />
              ) : showTemplates ? (
                <TemplateGrid
                  brandId={brandId}
                  sources={templateSources}
                  assets={displayedAssets}
                  loading={templatesLoading}
                  onChanged={() => setAssetRevision((revision) => revision + 1)}
                  onChooseFiles={() => fileInputRef.current?.click()}
                />
              ) : optimisticLayout === 'board' ? (
                <>
                  {/* Board reads /api/library/assets, which has no project support at all —
                      it is a different endpoint from the grid's browse RPC. So a project
                      filter set here changes the URL, renders its chip, and narrows nothing.
                      Saying so is the honest half of the fix; making it work needs
                      p_project_ids on the listing route, which is not this change. */}
                  {initialBrowseQuery.projectIds.length > 0 ? (
                    <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                      Board view doesn&apos;t filter by project yet — switch to Grid to see only
                      this project&apos;s assets.
                    </p>
                  ) : null}
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
                    onOpenDetail={openDetail}
                    selectedAssetIds={selectedAssetIds}
                    onToggleSelected={toggleSelected}
                    groupBy={initialBrowseQuery.boardGroupBy}
                    onGroupByChange={(boardGroupBy) => pushFilters({ boardGroupBy })}
                  />
                </>
              ) : optimisticLayout === 'list' ? (
                <ListView
                  assets={displayedAssets}
                  card={cardOptions}
                  customFields={chosenFields}
                  fieldValues={fieldValues}
                  serverSort={optimisticSort}
                  onServerSort={(sort) => pushFilters({ sort })}
                  onOpenDetail={openDetail}
                  selectedAssetIds={selectedAssetIds}
                  onToggleSelected={toggleSelected}
                  onLoadMore={isSearching ? undefined : loadMore}
                  hasMore={isSearching ? false : hasMore}
                  loadingMore={loadingMore}
                  emptyHint={emptyHint}
                />
              ) : optimisticLayout === 'reel' ? (
                <ReelView
                  assets={displayedAssets}
                  active={!detailAsset}
                  onOpenDetail={openDetail}
                  onExit={() => onLayoutChange('grid')}
                  onLoadMore={isSearching ? undefined : loadMore}
                  hasMore={isSearching ? false : hasMore}
                  loadingMore={loadingMore}
                />
              ) : initialBrowseQuery.destination === 'home' &&
                !isSearching &&
                initialBrowseQuery.previewFrame === 'native' ? (
                <RatioShelves
                  {...gridCardProps}
                  brandId={brandId}
                  assets={displayedAssets}
                  showBoundingBoxes={showBoundingBoxes}
                  captionStyle={captionStyle}
                  emptyHint={emptyHint}
                  onLoadMore={loadMore}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onOpenDetail={openDetail}
                  onSelectBin={onSelectRatioBin}
                  onAssetChanged={refreshAssets}
                  selectedAssetIds={selectedAssetIds}
                  onToggleSelected={toggleSelected}
                />
              ) : (
                <MediaGrid
                  brandId={brandId}
                  assets={displayedAssets}
                  showBoundingBoxes={showBoundingBoxes}
                  captionStyle={captionStyle}
                  emptyHint={emptyHint}
                  onLoadMore={isSearching ? undefined : loadMore}
                  hasMore={isSearching ? false : hasMore}
                  loadingMore={loadingMore}
                  previewFrame={initialBrowseQuery.previewFrame}
                  onOpenDetail={openDetail}
                  onAssetChanged={refreshAssets}
                  selectedAssetIds={selectedAssetIds}
                  onToggleSelected={toggleSelected}
                  {...gridCardProps}
                />
              )}
            </div>

            {fontReviewFiles.length > 0 ? (
              <FontUploadReviewDialog
                key={fontReviewFiles.map((file) => `${file.name}:${file.size}`).join('|')}
                brandId={brandId}
                files={fontReviewFiles}
                onClose={() => setFontReviewFiles([])}
                onUploaded={() => {
                  setFontRevision((revision) => revision + 1);
                  router.push('/library?section=typography');
                }}
              />
            ) : null}

            <AssetDetailModal
              brandId={brandId}
              asset={detailAsset}
              initialDeepLink={deepLink}
              previewFrame={initialBrowseQuery.previewFrame}
              onDeepLinkChange={onDeepLinkChange}
              onClose={closeDetail}
              onAssetChanged={refreshAssets}
              onPrev={previousAsset ? () => openDetail(previousAsset) : undefined}
              onNext={nextAsset ? () => openDetail(nextAsset) : undefined}
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
                    <span className="text-sm font-medium">
                      {showTemplates ? 'Drop to add template' : 'Drop to upload'}
                    </span>
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

/** Tie-breaking keys after the main sort, each flipped between ascending and descending. */
function ThenBySortControl({
  value,
  onChange,
}: {
  value: readonly LibrarySortSpec[];
  onChange: (thenBy: LibrarySortSpec[]) => void;
}) {
  const labelOf = (key: string) =>
    LIBRARY_THEN_BY_KEYS.find((option) => option.value === key)?.label ?? key;
  const unused = LIBRARY_THEN_BY_KEYS.filter(
    (option) => !value.some((spec) => spec.key === option.value),
  );
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent"
          >
            Then by
            {value.length > 0 ? (
              <span className="rounded-full bg-primary/10 px-1.5 text-primary">{value.length}</span>
            ) : null}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        }
      />
      <PopoverContent align="end" className="w-64 space-y-1 p-2">
        {value.map((spec, index) => {
          const label = labelOf(spec.key);
          const ascending = spec.dir === 'asc';
          return (
            <div key={spec.key} className="flex min-h-9 items-center gap-1">
              <span className="min-w-0 flex-1 truncate px-2 text-sm">{label}</span>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    value.map((current, at) =>
                      at === index ? { ...current, dir: ascending ? 'desc' : 'asc' } : current,
                    ),
                  )
                }
                aria-label={`${label}: ${ascending ? 'ascending' : 'descending'}. Reverse`}
                className="rounded-md px-2 py-1 text-sm hover:bg-accent"
              >
                {ascending ? '↑' : '↓'}
              </button>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, at) => at !== index))}
                aria-label={`Stop sorting by ${label}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
        {value.length < MAX_LIBRARY_THEN_BY ? (
          <Select
            value={null}
            onValueChange={(key: LibrarySortKey) => onChange([...value, { key, dir: 'desc' }])}
          >
            <SelectTrigger size="sm" aria-label="Add a sort key" className="h-8 w-full">
              <SelectValue placeholder="Add a sort key" />
            </SelectTrigger>
            <SelectContent>
              {unused.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
