'use client';

import {
  DEFAULT_REEL_VIDEO_BATCH_MAX,
  type OneShotPostResponse,
  type PublishPlatform,
  resolvePlannerTimeZone,
} from '@continuum/contracts';
import { ChevronLeft, X } from 'lucide-react';
import { motion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGenerateDraftMedia } from '@/components/organic/hooks/useGenerateDraftMedia';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelCollapseButton,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useBrandInsightsRefresh } from '@/lib/brand-insights/useBrandInsightsRefresh';
import { pluralize } from '@/lib/format/pluralize';
import { readSavedAccountSelection } from '@/lib/organic/account-selection';
import { brandStorageKeyAiStudioLastDraft } from '@/lib/organic/ai-studio-bridge';
import type { CalendarPostAccountsByPlatform } from '@/lib/organic/calendar-posts';
import { evaluateDraftReadiness } from '@/lib/organic/draftReadiness';
import { mapOneShotPostResponseToCalendarDraft } from '@/lib/organic/mapPlacementToDraft';
import { writePlannerUrlState } from '@/lib/organic/plannerUrlState';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { type PlannerAccountOption, useCalendarStore } from '@/lib/organic/store';
import type { Trend } from '@/lib/organic/trends';
import { getLocalStorageJSON, setLocalStorageJSON } from '@/lib/storage';
import { useAiStudioHandoff } from '../hooks/useAiStudioHandoff';
import { useApproveScheduleDraft } from '../hooks/useApproveScheduleDraft';
import { useCalendarDnD } from '../hooks/useCalendarDnD';
import { useCalendarDraftPersistence } from '../hooks/useCalendarDraftPersistence';
import { useCalendarPostedContent } from '../hooks/useCalendarPostedContent';
import { useCalendarRealtimeSync } from '../hooks/useCalendarRealtimeSync';
import { useCalendarSelection } from '../hooks/useCalendarSelection';
import { useDraftGeneration } from '../hooks/useDraftGeneration';
import { useRescheduleDraft } from '../hooks/useRescheduleDraft';
import { AiPostComposer } from './AiPostComposer';
import { AiStudioHandoffProvider } from './AiStudioHandoffContext';
import { BulkActionToolbar } from './BulkActionToolbar';
import { CalendarDndContext } from './CalendarDndContext';
import { CalendarDraftCard } from './CalendarDraftCard';
import { CalendarToolbar } from './CalendarToolbar';
import {
  buildDayRange,
  buildWeekDays,
  formatDayId,
  formatWeekHeading,
  formatWeekRange,
  makeCalendarDay,
  sliceWeekDays,
  startOfWeek,
  UNSCHEDULED_DAY_ID,
} from './calendar-utils';
import { DestructiveConfirmationProvider } from './DestructiveConfirmation';
import { StatusBadge } from './DraftCardBadges';
import {
  DraftDeletionConfirmationProvider,
  useDraftDeletionConfirmation,
} from './DraftDeletionConfirmation';
import { OrganicCreativesPicker } from './OrganicCreativesPicker';
import { OrganicDraftPreview } from './OrganicDraftPreview';
import { ListViewSkeleton, MonthGridSkeleton, PlannerViewSkeleton } from './PlannerViewSkeletons';
import { PlannerWorkflowRail, resolvePlannerStage } from './PlannerWorkflowRail';
import { usePlannerDateAnchors } from './planner-date-anchor';
import {
  buildPlannerPlatforms,
  type CreatePostFormat,
  type CreatePostMode,
  type PlannerPlatformKey,
} from './planner-platforms';
import { derivePlannerInsight } from './plannerIntelligence';
import { TimeGridCanvas } from './TimeGridCanvas';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicCreationStep,
  OrganicEditorSlide,
  OrganicPlatformTag,
  OrganicTrendType,
} from './types';

// `loading` is not decoration: in the App Router, next/dynamic only creates a Suspense
// boundary when `loading` or `ssr: false` is passed. Without one, a lazy view suspends all
// the way to the ROUTE boundary and the whole planner is replaced by the page fallback —
// that is the reported 10-13s "blank grey screen", and the Trends drawer's "opens nothing".
const OrganicMonthlyCalendar = dynamic(
  () => import('./OrganicMonthlyCalendar').then((m) => m.OrganicMonthlyCalendar),
  { loading: () => <MonthGridSkeleton /> },
);
const OrganicListView = dynamic(() => import('./OrganicListView').then((m) => m.OrganicListView), {
  loading: () => <ListViewSkeleton />,
});
// Gesture-gated: nothing renders it until the user opens Trends, so there is no server
// pass worth having.
const OrganicTrendsDrawer = dynamic(
  () => import('./OrganicTrendsDrawer').then((m) => m.OrganicTrendsDrawer),
  { ssr: false },
);

/** Warm the lazy view chunks so the SECOND view switch is instant. */
function warmPlannerViewChunks(): void {
  void import('./OrganicMonthlyCalendar');
  void import('./OrganicListView');
}

const PREVIEW_LAYOUT_KEY = 'continuum:organic-planner:preview-percent';

const WIDE_PLANNER_QUERY = '(min-width: 64rem)';

type OrganicCalendarWorkspaceClientProps = {
  days: OrganicCalendarDay[];
  steps: OrganicCreationStep[];
  editorSlides: OrganicEditorSlide[];
  trendTypes: OrganicTrendType[];
  trends?: Trend[];
  activePlatforms?: OrganicPlatformKey[];
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>;
  platformAccountOptions?: Partial<Record<OrganicPlatformKey, PlannerAccountOption[]>>;
  maxTrendSelections?: number;
  brandProfileId?: string;
  brandName?: string;
  userId?: string;
  instagramAccountId?: string;
  initialWeekStart?: string | null;
  initialSelectedDraftId?: string | null;
  initialView?: 'week' | 'month' | 'list';
  initialComposeTrendId?: string | null;
  initialComposePlatform?: OrganicPlatformKey | null;
  postedContentAccountsByPlatform?: CalendarPostAccountsByPlatform;
  /** Why the server-side trend fetch failed, when it did — the Trends drawer says so. */
  insightsError?: string | null;
};

const NOOP_STRING = (_id: string) => {};

function isSchedulablePlannerPlatform(
  platform: PlannerPlatformKey | undefined,
): platform is OrganicPlatformTag {
  return platform === 'instagram' || platform === 'linkedin';
}

export function OrganicCalendarWorkspaceClient(props: OrganicCalendarWorkspaceClientProps) {
  return (
    <DraftDeletionConfirmationProvider>
      {/* Publish and copy-rewrite already await requestDestructiveConfirmation. Unmounted,
          the context default resolves true — so both fired on a single click, unasked. */}
      <DestructiveConfirmationProvider>
        <OrganicCalendarWorkspaceInner {...props} />
      </DestructiveConfirmationProvider>
    </DraftDeletionConfirmationProvider>
  );
}

function OrganicCalendarWorkspaceInner({
  days: initialDays,
  trendTypes,
  trends = [],
  activePlatforms = [],
  platformAccountIds = {},
  platformAccountOptions = {},
  maxTrendSelections,
  brandProfileId,
  brandName,
  instagramAccountId,
  initialWeekStart,
  initialSelectedDraftId,
  initialView,
  initialComposeTrendId,
  initialComposePlatform,
  postedContentAccountsByPlatform,
  insightsError,
}: OrganicCalendarWorkspaceClientProps) {
  const { requestDraftDeletion } = useDraftDeletionConfirmation();
  const {
    days: calendarDays,
    setDays: setCalendarDays,
    persistedWeekStartId,
    setPersistedWeekStartId,
    toggleTrend,
    bulkDeleteDrafts,
    isViewCleared,
    clearView,
    restoreView,
    setSelectedDraftId,
    setSelectedDraftIds,
    selectedTrendIds,
    gridProgress,
    viewMode,
    setViewMode,
    addDraft,
    updateDraft: updateDraftById,
    backlogDrafts,
    addBacklogDraft,
    deleteBacklogDraft,
    promoteBacklogDraft,
    setAccountContext,
    gridError,
    dateRange,
    setDateRange,
    focusedDayId,
    setFocusedDayId,
    editingDraftId,
    beginEditingDraft,
  } = useCalendarStore(
    useShallow((state) => ({
      days: state.days,
      setDays: state.setDays,
      persistedWeekStartId: state.persistedWeekStartId,
      setPersistedWeekStartId: state.setPersistedWeekStartId,
      toggleTrend: state.toggleTrend,
      bulkDeleteDrafts: state.bulkDeleteDrafts,
      isViewCleared: state.isViewCleared,
      clearView: state.clearView,
      restoreView: state.restoreView,
      setSelectedDraftId: state.setSelectedDraftId,
      setSelectedDraftIds: state.setSelectedDraftIds,
      selectedTrendIds: state.selectedTrendIds,
      gridProgress: state.gridProgress,
      viewMode: state.viewMode,
      setViewMode: state.setViewMode,
      addDraft: state.addDraft,
      updateDraft: state.updateDraft,
      backlogDrafts: state.backlogDrafts,
      addBacklogDraft: state.addBacklogDraft,
      deleteBacklogDraft: state.deleteBacklogDraft,
      promoteBacklogDraft: state.promoteBacklogDraft,
      setAccountContext: state.setAccountContext,
      gridError: state.gridError,
      dateRange: state.dateRange,
      setDateRange: state.setDateRange,
      focusedDayId: state.focusedDayId,
      setFocusedDayId: state.setFocusedDayId,
      editingDraftId: state.editingDraftId,
      beginEditingDraft: state.beginEditingDraft,
    })),
  );

  React.useEffect(() => {
    // One account id per publishable platform — the account this workspace publishes to. It
    // seeds from the brand's default, then from whatever the user last chose in the switcher
    // (per brand), and both generation and publish read it. A choice that only lives in a
    // dropdown is how posts kept landing on the brand's first-resolved account.
    const instagram = instagramAccountId ?? platformAccountIds.instagram;
    const defaults: Partial<Record<PublishPlatform, string>> = {
      ...(instagram ? { instagram } : {}),
      ...(platformAccountIds.facebook ? { facebook: platformAccountIds.facebook } : {}),
      ...(platformAccountIds.linkedin ? { linkedin: platformAccountIds.linkedin } : {}),
    };

    const saved = readSavedAccountSelection(brandProfileId ?? null);
    const accountIds = { ...defaults };
    for (const [platform, accountId] of Object.entries(saved) as Array<[PublishPlatform, string]>) {
      // Only honor a saved choice that is still one of the brand's accounts.
      const options = platformAccountOptions[platform as OrganicPlatformKey] ?? [];
      if (options.some((option) => option.id === accountId)) accountIds[platform] = accountId;
    }

    setAccountContext({
      accountIds,
      accountOptions: platformAccountOptions as Partial<
        Record<PublishPlatform, PlannerAccountOption[]>
      >,
      brandId: brandProfileId ?? null,
    });
  }, [
    instagramAccountId,
    platformAccountIds,
    platformAccountOptions,
    brandProfileId,
    setAccountContext,
  ]);

  // Dismissing the preview has to take `?draftId=` with it. While the param survived, the
  // deep-link watcher below re-selected the draft on the very next render — which is why
  // the panel could not be closed by the X, the chevron, or Escape.
  const forgetDeepLinkedDraft = React.useCallback(() => {
    writePlannerUrlState({ draftId: null, edit: null });
  }, []);

  const {
    selectedId,
    selectedIds,
    handleSelect,
    clearAll,
    handleKeyDown,
    isPreviewCollapsed,
    collapsePreview,
    expandPreview,
    isAutoSelectSuppressed,
  } = useCalendarSelection(calendarDays, { onDismiss: forgetDeepLinkedDraft });

  const resolvedTrends = React.useMemo(() => {
    const merged = [
      ...trends,
      ...trendTypes.flatMap((trendType) => trendType.groups.flatMap((group) => group.trends)),
    ];

    const deduped = new Map<string, Trend>();
    merged.forEach((item) => {
      if (!deduped.has(item.id)) {
        deduped.set(item.id, item);
      }
    });

    return Array.from(deduped.values());
  }, [trendTypes, trends]);

  const { weekStart, setWeekStart, monthAnchorDate, setMonthAnchorDate } = usePlannerDateAnchors({
    initialWeekStart: initialWeekStart ?? undefined,
    persistedWeekStartId,
  });
  const [trendsDrawerOpen, setTrendsDrawerOpen] = React.useState(false);

  // The URL seeds the view mode once, on mount. Guarded by a ref rather than an empty
  // dependency array with a lint suppression, so the effect states its real dependencies.
  const hasSeededViewFromUrlRef = React.useRef(false);
  React.useEffect(() => {
    if (hasSeededViewFromUrlRef.current) return;
    hasSeededViewFromUrlRef.current = true;
    if (initialView) setViewMode(initialView);
  }, [initialView, setViewMode]);

  // …and from then on the store is the sole writer and the URL is a projection of it. The
  // first run is skipped because the store's value CAME from the URL; echoing it back would
  // overwrite a param the user may still be arriving with.
  const hasProjectedViewToUrlRef = React.useRef(false);
  React.useEffect(() => {
    if (!hasProjectedViewToUrlRef.current) {
      hasProjectedViewToUrlRef.current = true;
      return;
    }
    writePlannerUrlState({ view: viewMode });
  }, [viewMode]);

  // The two views the user is not looking at, fetched while the tab is idle: a view switch
  // then has no network cost at all.
  React.useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const idleHandle = window.requestIdleCallback(warmPlannerViewChunks);
      return () => window.cancelIdleCallback(idleHandle);
    }
    const timer = window.setTimeout(warmPlannerViewChunks, 2_000);
    return () => window.clearTimeout(timer);
  }, []);

  const weekStartId = formatDayId(weekStart);

  // The account the switcher settled on — not the brand's default. A draft the planner writes
  // must be stamped with the account it will actually publish to.
  const selectedAccountIds = useCalendarStore(
    useShallow((state) => state.accountContext.accountIds),
  );

  const { refetch: refetchCalendarDrafts, isHydrated: isCalendarHydrated } =
    useCalendarDraftPersistence({
      brandProfileId,
      calendarDays,
      setCalendarDays,
      updateDraftById,
      platformAccountIds:
        Object.keys(selectedAccountIds).length > 0 ? selectedAccountIds : platformAccountIds,
    });

  // Server-authoritative freshness: subscribe to Realtime draft writes for this
  // brand so out-of-band agent drafts (chat tools, Stage-2 blueprint worker) hit
  // the planner instantly via the same nonce-refetch path below.
  useCalendarRealtimeSync({ brandProfileId });

  // Reconcile against the backend when agent-side work completes (bulk run done,
  // single draft ready) so en-masse generated drafts appear without a manual reload.
  const calendarRefetchNonce = useCalendarStore((state) => state.calendarRefetchNonce);
  React.useEffect(() => {
    if (calendarRefetchNonce === 0) return;
    // Debounce so a burst of completions (a bulk run's per-item signals) coalesces
    // into a single reconcile.
    const timer = setTimeout(() => {
      void refetchCalendarDrafts().catch(() => {
        // Best-effort reconcile; the local store remains usable.
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [calendarRefetchNonce, refetchCalendarDrafts]);

  const postedContentAccounts = React.useMemo<CalendarPostAccountsByPlatform>(
    () => ({
      instagram: postedContentAccountsByPlatform?.instagram ?? [],
      facebook: postedContentAccountsByPlatform?.facebook ?? [],
      tiktok: postedContentAccountsByPlatform?.tiktok ?? [],
      youtube: postedContentAccountsByPlatform?.youtube ?? [],
      linkedin: postedContentAccountsByPlatform?.linkedin ?? [],
    }),
    [postedContentAccountsByPlatform],
  );

  const {
    posts: postedContent,
    isLoading: isLoadingPostedContent,
    isFetchingExternal: isFetchingPostedContent,
    error: postedContentError,
    retry: retryPostedContent,
    fetchExternalPosts,
  } = useCalendarPostedContent({
    brandProfileId,
    viewMode,
    weekStart,
    monthAnchorDate,
    accountsByPlatform: postedContentAccounts,
  });

  React.useEffect(() => {
    setPersistedWeekStartId(weekStartId);
  }, [setPersistedWeekStartId, weekStartId]);

  // Pre-fetch placeholder: seed a week scaffold so the grid paints before the
  // fetch-all refetch hydrates the full loaded-day set. Once drafts load (or for a
  // brand with none, the visible-month scaffold), this no longer fires.
  React.useEffect(() => {
    if (calendarDays.length > 0) return;
    setCalendarDays(initialDays.length > 0 ? initialDays : buildWeekDays(weekStart));
  }, [calendarDays.length, initialDays, setCalendarDays, weekStart]);

  // Week navigation is now a pure cursor move over already-loaded data — no per-week
  // fetch or cache swap. The week grid re-slices the loaded set for the new week.
  // Navigating away from a focused day drops the focus: a ring left on an off-screen
  // day would silently redirect the next toolbar "+" somewhere the user can't see.
  const handleWeekChange = React.useCallback(
    (date: Date) => {
      const nextWeekStart = startOfWeek(date);
      if (formatDayId(nextWeekStart) === weekStartId) return;
      clearAll();
      setFocusedDayId(null);
      setWeekStart(nextWeekStart);
    },
    [clearAll, setFocusedDayId, weekStartId],
  );

  const handleViewModeChange = React.useCallback(
    (mode: 'week' | 'month' | 'list') => {
      setFocusedDayId(null);
      setViewMode(mode);
    },
    [setFocusedDayId, setViewMode],
  );

  const handlePreviousWeek = React.useCallback(() => {
    const previous = new Date(weekStart);
    previous.setDate(weekStart.getDate() - 7);
    handleWeekChange(previous);
  }, [handleWeekChange, weekStart]);

  const handleNextWeek = React.useCallback(() => {
    const next = new Date(weekStart);
    next.setDate(weekStart.getDate() + 7);
    handleWeekChange(next);
  }, [handleWeekChange, weekStart]);

  const handleToday = React.useCallback(() => {
    const today = new Date();
    clearAll();
    setWeekStart(startOfWeek(today));
    setFocusedDayId(formatDayId(today));
  }, [clearAll, setFocusedDayId, setWeekStart]);

  const handlePreviousMonth = React.useCallback(() => {
    const prev = new Date(monthAnchorDate);
    prev.setDate(1);
    prev.setMonth(prev.getMonth() - 1);
    setFocusedDayId(null);
    setMonthAnchorDate(prev);
  }, [monthAnchorDate, setFocusedDayId]);

  const handleNextMonth = React.useCallback(() => {
    const next = new Date(monthAnchorDate);
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    setFocusedDayId(null);
    setMonthAnchorDate(next);
  }, [monthAnchorDate, setFocusedDayId]);

  const drafts = React.useMemo(() => calendarDays.flatMap((day) => day.slots), [calendarDays]);

  // Two calendar lenses, both applied on the way to the SCREEN and never to `days`:
  //   "Planned" — when off, hide bulk-plan drafts from the week/month grids (the list view
  //               still shows them, tagged). Default on.
  //   "Clear view" — hide everything. It used to empty `days[].slots`, which reset the
  //               workflow rail and the planning banner and read as total loss of work.
  // `drafts` below stays derived from the unfiltered set, which is what keeps the rail,
  // the banner and the toolbar's counts honest while a lens is on.
  const showPlanned = useCalendarStore((state) => state.showPlanned);
  const gridDays = React.useMemo(() => {
    if (isViewCleared) return calendarDays.map((day) => ({ ...day, slots: [] }));
    if (showPlanned) return calendarDays;
    return calendarDays.map((day) => ({
      ...day,
      slots: day.slots.filter((slot) => !slot.contentPlanId),
    }));
  }, [calendarDays, isViewCleared, showPlanned]);

  // Week VIEW MODEL: exactly the 7 days of the current week, sliced from the full
  // loaded set (synthesizing any missing day) so the grid stays 7 columns wide.
  const visibleWeekDays = React.useMemo(
    () => sliceWeekDays(gridDays, weekStart),
    [gridDays, weekStart],
  );

  // List VIEW MODEL: the loaded set narrowed to the custom timeframe (null = all).
  // Undated drafts (the "unscheduled" sentinel) bypass the date filter so they are
  // always reachable — they are exactly the drafts that were previously invisible.
  const listDays = React.useMemo(() => {
    const scheduled = gridDays.filter((day) => day.id !== UNSCHEDULED_DAY_ID);
    const unscheduled = gridDays.filter((day) => day.id === UNSCHEDULED_DAY_ID);
    const filtered = dateRange
      ? scheduled.filter((day) => day.id >= dateRange.from && day.id <= dateRange.to)
      : scheduled;
    return [...filtered, ...unscheduled];
  }, [gridDays, dateRange]);

  // Every day id the user can currently see, per view. Used to decide whether
  // "today" is a sensible landing spot for a context-free create.
  const visibleDayIds = React.useMemo(() => {
    if (viewMode === 'week') return visibleWeekDays.map((day) => day.id);
    if (viewMode === 'list') {
      return listDays.filter((day) => day.id !== UNSCHEDULED_DAY_ID).map((day) => day.id);
    }
    const monthStart = new Date(monthAnchorDate.getFullYear(), monthAnchorDate.getMonth(), 1);
    const monthEnd = new Date(monthAnchorDate.getFullYear(), monthAnchorDate.getMonth() + 1, 0);
    return buildDayRange(monthStart, monthEnd).map((day) => day.id);
  }, [viewMode, visibleWeekDays, listDays, monthAnchorDate]);

  // Where a "+" with no day of its own lands (the toolbar button, the right-click
  // "New post"): the day the user last clicked, else today when it is on screen,
  // else the first visible day. Never `calendarDays[0]`, which is the top of the
  // loaded week regardless of what the user is looking at.
  const defaultCreateDayId = React.useMemo(() => {
    if (focusedDayId) return focusedDayId;
    const todayId = formatDayId(new Date());
    if (visibleDayIds.includes(todayId)) return todayId;
    return visibleDayIds[0] ?? todayId;
  }, [focusedDayId, visibleDayIds]);

  const selectedDraft = React.useMemo(() => {
    if (!selectedId) return null;
    return drafts.find((draft) => draft.id === selectedId) ?? null;
  }, [drafts, selectedId]);

  // The panel's mount is driven by selection INTENT, not by the resolved draft
  // object. `drafts` is rebuilt from scratch on every autosave/refetch/realtime
  // reconcile (useCalendarDraftPersistence.refetch → setCalendarDays), so
  // `selectedDraft` can transiently resolve to null for a still-valid selection
  // while ids are reconciled — gating the panel on it alone made the post-info
  // panel silently blank until a reload. Gate on `selectedId` and bridge the
  // transient gap with the last-resolved draft so the panel never blanks and
  // re-renders with fresh content the moment the draft resolves again.
  const hasSelection = Boolean(selectedId);
  // Selection keeps the workflow rail on the "review" stage; only an expanded
  // preview claims layout width.
  const isPreviewOpen = hasSelection && !isPreviewCollapsed;
  const lastResolvedDraftRef = React.useRef<OrganicCalendarDraft | null>(null);
  if (!selectedId) {
    lastResolvedDraftRef.current = null;
  } else if (selectedDraft) {
    lastResolvedDraftRef.current = selectedDraft;
  }
  const previewDraft =
    selectedDraft ??
    (selectedId && lastResolvedDraftRef.current?.id === selectedId
      ? lastResolvedDraftRef.current
      : null);

  const allDraftIds = React.useMemo(() => new Set(drafts.map((draft) => draft.id)), [drafts]);

  // Unified selection sync: prune stale selections and restore preferred
  // draft in a single pass to avoid cascading renders.
  React.useEffect(() => {
    // Prune multi-selection IDs that no longer exist
    const nextSelectedIds = selectedIds.filter((id) => allDraftIds.has(id));
    if (nextSelectedIds.length !== selectedIds.length) {
      setSelectedDraftIds(nextSelectedIds);
    }

    // Resolve the active single-selection draft
    const lastDraftKey = brandProfileId ? brandStorageKeyAiStudioLastDraft(brandProfileId) : null;

    if (selectedId && !allDraftIds.has(selectedId)) {
      // Before the fetch-all finishes, allDraftIds is incomplete — a draft we are
      // returning to from AI Studio (or about to restore) may simply not be loaded
      // yet. Don't prune the selection until hydration is authoritative, or the
      // back-nav transiently loses the draft being edited.
      if (!isCalendarHydrated) return;
      // Current selection is stale -- attempt to restore a preferred draft
      // instead of nulling out then re-selecting on the next render cycle.
      if (typeof window !== 'undefined') {
        const preferredDraftId =
          initialSelectedDraftId ??
          (lastDraftKey ? getLocalStorageJSON<string | null>(lastDraftKey, null) : null);
        if (
          preferredDraftId &&
          allDraftIds.has(preferredDraftId) &&
          !isAutoSelectSuppressed(preferredDraftId)
        ) {
          setSelectedDraftId(preferredDraftId);
          return;
        }
      }
      setSelectedDraftId(null);
      return;
    }

    // No current selection -- try to restore from initial prop / localStorage,
    // unless the user just dismissed that very draft from the preview panel.
    if (!selectedId && typeof window !== 'undefined') {
      const preferredDraftId =
        initialSelectedDraftId ??
        (lastDraftKey ? getLocalStorageJSON<string | null>(lastDraftKey, null) : null);
      if (
        preferredDraftId &&
        allDraftIds.has(preferredDraftId) &&
        !isAutoSelectSuppressed(preferredDraftId)
      ) {
        setSelectedDraftId(preferredDraftId);
      }
    }
  }, [
    allDraftIds,
    brandProfileId,
    initialSelectedDraftId,
    isAutoSelectSuppressed,
    isCalendarHydrated,
    selectedId,
    selectedIds,
    setSelectedDraftId,
    setSelectedDraftIds,
  ]);

  // "View draft" deep-link (agent JobGrid → router.push('?tab=planner&draftId=…'))
  // landing on an ALREADY-mounted planner: initialSelectedDraftId is captured at
  // mount and the reconciliation effect above only restores a selection when there
  // is none, so a draftId query-param change on a live planner would otherwise be
  // ignored. Watch the param directly and re-select once the target draft is loaded.
  const searchParams = useSearchParams();
  const searchDraftId = searchParams?.get('draftId') ?? null;
  // The param outlives the panel: closing or collapsing the preview must not be
  // undone on the very next render by this watcher re-selecting the same draft.
  React.useEffect(() => {
    if (!searchDraftId || searchDraftId === selectedId) return;
    if (!isCalendarHydrated || !allDraftIds.has(searchDraftId)) return;
    if (isAutoSelectSuppressed(searchDraftId)) return;
    setSelectedDraftId(searchDraftId);
  }, [
    searchDraftId,
    selectedId,
    isCalendarHydrated,
    allDraftIds,
    isAutoSelectSuppressed,
    setSelectedDraftId,
  ]);

  // `?draftId=…&edit=1` opens the draft IN edit mode. Plain `?draftId=` stays
  // select-only on purpose — collapsing a deep-linked preview must stay collapsed.
  // The `editingDraftId !== searchDraftId` guard keeps this one-shot, so leaving edit
  // mode with the param still in the URL does not re-enter it on the next render.
  const searchWantsEdit = searchParams?.get('edit') === '1';
  React.useEffect(() => {
    if (!searchWantsEdit || !searchDraftId) return;
    if (!isCalendarHydrated || !allDraftIds.has(searchDraftId)) return;
    if (isAutoSelectSuppressed(searchDraftId)) return;
    if (editingDraftId === searchDraftId) return;
    beginEditingDraft(searchDraftId);
  }, [
    searchWantsEdit,
    searchDraftId,
    isCalendarHydrated,
    allDraftIds,
    isAutoSelectSuppressed,
    editingDraftId,
    beginEditingDraft,
  ]);

  // An edit intent raised while the panel is collapsed has to re-open it, or Edit
  // reads as another dead button. No loop: collapsing nulls the intent.
  React.useEffect(() => {
    if (!editingDraftId || !isPreviewCollapsed) return;
    expandPreview();
  }, [editingDraftId, isPreviewCollapsed, expandPreview]);

  const { show } = useToast();
  const { reschedule, rescheduleMany } = useRescheduleDraft();

  const { activeDragDraft, handleDragStart, handleDragEnd, handleNativeDrop } = useCalendarDnD(
    calendarDays,
    drafts,
    platformAccountIds,
    selectedIds,
    { reschedule, rescheduleMany },
  );

  const { gridStatus, handleRegenerate, handleClearFailure } = useDraftGeneration({
    brandProfileId,
    drafts,
  });

  const { refresh: refreshTrends, isFetching: isFetchingTrends } = useBrandInsightsRefresh(
    brandProfileId ?? '',
  );

  // Rows represent either a creation channel or a platform with content worth viewing.
  // Unsupported empty platforms stay out of the matrix so the week remains scan-friendly.
  const plannerPlatforms = React.useMemo(
    () => buildPlannerPlatforms(activePlatforms, calendarDays, postedContent),
    [activePlatforms, calendarDays, postedContent],
  );

  const schedulableChannels = React.useMemo(
    () => plannerPlatforms.filter((platform) => platform.canCreate).length,
    [plannerPlatforms],
  );

  const weekTitle = React.useMemo(() => formatWeekHeading(weekStart), [weekStart]);
  // The zone every scheduled time in this planner is expressed in. The app displayed it
  // nowhere, which left every "9:00 AM" ambiguous to anyone not in the brand's zone.
  const plannerTimeZone = React.useMemo(() => resolvePlannerTimeZone(null), []);
  const weekSubtitle = React.useMemo(
    () =>
      `${formatWeekRange(weekStart)} • ${pluralize(schedulableChannels, 'scheduling channel')} • ${plannerTimeZone}`,
    [plannerTimeZone, schedulableChannels, weekStart],
  );

  const createQuickDraft = React.useCallback(
    (context?: {
      dayId?: string;
      platform?: PlannerPlatformKey;
      status?: 'draft' | 'scheduled' | 'placeholder';
      trendId?: string;
      mode?: CreatePostMode;
      format?: CreatePostFormat;
    }) => {
      const selectedPlatform =
        (isSchedulablePlannerPlatform(context?.platform) && context?.platform) ||
        (activePlatforms.find((platform) => ['instagram', 'linkedin'].includes(platform)) as
          | OrganicPlatformTag
          | undefined) ||
        'instagram';

      // The month grid renders every day of the visible month, but `calendarDays`
      // only holds the loaded week scaffold plus days that already carry drafts. A
      // "+" on any other cell must still create there, so derive the day from its id
      // rather than bailing — `addDraft` materializes it in the store the same way.
      const targetDayId = context?.dayId ?? defaultCreateDayId;
      const targetDay =
        calendarDays.find((day) => day.id === targetDayId) ?? makeCalendarDay(targetDayId);
      const isManual = context?.mode === 'manual';
      const status = context?.status ?? 'draft';
      const trendTag = context?.trendId;
      const targetAccountId = platformAccountIds[selectedPlatform as OrganicPlatformKey];

      const draftId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `draft-${crypto.randomUUID()}`
          : `draft-${Date.now()}`;

      const nextDraft: OrganicCalendarDraft = {
        id: draftId,
        clientKey: draftId,
        title:
          status === 'placeholder'
            ? 'Content idea'
            : `New ${selectedPlatform[0].toUpperCase()}${selectedPlatform.slice(1)} post`,
        summary: '',
        timeLabel: targetDay.suggestedTimes[0] ?? '9:00 AM',
        dateLabel: `${targetDay.label}, ${targetDay.dateLabel}`,
        status,
        platforms: [selectedPlatform],
        format: context?.format ?? 'Post',
        objective: isManual ? 'Manual' : 'Draft',
        origin: isManual ? 'manual' : undefined,
        creativeIdea: '',
        captionPreview: '',
        tags: [],
        // No media exists yet for a freshly-created quick draft. Media presence
        // is derived downstream from real publishingAssets / mediaStatus, so this
        // must start at 0 rather than seeding a fake "has media" count.
        mediaCount: 0,
        seedTrendId: status === 'placeholder' ? trendTag : undefined,
        targetAccountId,
      };

      addDraft(targetDay.id, nextDraft);
      handleSelect(draftId, false);
      return draftId;
    },
    [activePlatforms, addDraft, calendarDays, defaultCreateDayId, handleSelect, platformAccountIds],
  );

  // "Create with AI" composer (direction + tagged creatives + trends → durable job).
  const [aiComposer, setAiComposer] = React.useState<{
    platform: OrganicPlatformKey;
    scheduledAt: string;
    seedTrendIds?: string[];
  } | null>(null);

  const handleGoDraft = React.useCallback(
    (context?: {
      dayId?: string;
      platform?: PlannerPlatformKey;
      trendId?: string;
      status?: 'draft' | 'scheduled' | 'placeholder';
      mode?: CreatePostMode;
      format?: CreatePostFormat;
    }) => {
      const mode = context?.mode ?? 'ai';
      // AI mode opens the composer and tasks a durable single-post agent; manual
      // mode seeds an editable draft from scratch.
      if (mode === 'ai') {
        const platform =
          (isSchedulablePlannerPlatform(context?.platform) && context?.platform) || 'instagram';
        const dayId = (context?.dayId ?? defaultCreateDayId).slice(0, 10);
        const scheduledAt = /^\d{4}-\d{2}-\d{2}$/.test(dayId)
          ? `${dayId}T12:00:00.000Z`
          : new Date().toISOString();
        setAiComposer({
          platform: platform as OrganicPlatformKey,
          scheduledAt,
          ...(context?.trendId && { seedTrendIds: [context.trendId] }),
        });
        return;
      }
      createQuickDraft({
        dayId: context?.dayId,
        platform: context?.platform,
        status: context?.status ?? 'draft',
        trendId: context?.trendId,
        mode,
        format: context?.format,
      });
    },
    [createQuickDraft, defaultCreateDayId],
  );

  const handleOneShotCreated = React.useCallback(
    (response: OneShotPostResponse) => {
      const created = mapOneShotPostResponseToCalendarDraft(response);
      if (!created) {
        void refetchCalendarDrafts();
        return;
      }

      addDraft(created.dayId, created.draft);
      handleSelect(created.draft.id, false);
    },
    [addDraft, handleSelect, refetchCalendarDrafts],
  );

  // One-click "Generate from this trend": open the composer pre-seeded with the
  // trend tagged, on the trend's best schedulable platform.
  const handleGenerateFromTrend = React.useCallback(
    (trend: Trend) => {
      const platform =
        trend.platforms.find((p) => activePlatforms.includes(p)) ?? activePlatforms[0];
      setTrendsDrawerOpen(false);
      handleGoDraft({ platform, trendId: trend.id });
    },
    [activePlatforms, handleGoDraft],
  );

  // Apply a dashboard deep link (/organic?composeTrendId=…) on mount (once):
  // open the composer seeded with that trend, mirroring the initialView pattern.
  const appliedComposeTrendRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialComposeTrendId || appliedComposeTrendRef.current) return;
    appliedComposeTrendRef.current = true;
    const trend = resolvedTrends.find((t) => t.id === initialComposeTrendId);
    if (trend) {
      handleGenerateFromTrend(trend);
      return;
    }
    // The composer submits seeded ids from state, so the handoff works even when
    // the trend row isn't in the planner's projection (its chip just won't render).
    handleGoDraft({
      platform: initialComposePlatform ?? undefined,
      trendId: initialComposeTrendId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { handleOpenInAiStudio, handleOpenDraftInAiStudio } = useAiStudioHandoff({
    brandProfileId,
    weekStartId,
    selectedDraft,
    updateDraftById,
    setSelectedDraftId,
    isCalendarHydrated,
  });

  const handleOpenDraftInStudio = React.useCallback(
    (draftId: string) => {
      let found: OrganicCalendarDraft | undefined;
      for (const day of calendarDays) {
        found = day.slots.find((d: OrganicCalendarDraft) => d.id === draftId);
        if (found) break;
      }
      if (!found) return;
      handleOpenDraftInAiStudio(found);
    },
    [calendarDays, handleOpenDraftInAiStudio],
  );

  const { approveAndSchedule } = useApproveScheduleDraft();

  const handleBulkApprove = React.useCallback(() => {
    // Only schedule drafts that meet the bare minimum (caption + media); leave the
    // rest as drafts so the readiness gate can't be bypassed in bulk. Persistence
    // must go through the backend approve→schedule chain — a local status flip
    // never reaches the DB row, so the scheduled-publish poller would never see it.
    const selected = selectedIds
      .map((id) => drafts.find((draft) => draft.id === id))
      .filter((draft): draft is OrganicCalendarDraft => !!draft);
    const ready = selected.filter((draft) => evaluateDraftReadiness(draft).ready);
    void (async () => {
      let approved = 0;
      for (const draft of ready) {
        // Silence the per-draft toast; one summary toast reports the whole batch.
        if (await approveAndSchedule(draft, { silent: true })) approved += 1;
      }
      const skipped = selected.length - approved;
      show({
        title: 'Bulk approve complete',
        description: `Approved ${approved} • skipped ${skipped}`,
        variant: approved > 0 ? 'success' : 'info',
      });
    })();
    clearAll();
  }, [selectedIds, drafts, approveAndSchedule, clearAll, show]);

  const handleBulkDelete = React.useCallback(() => {
    requestDraftDeletion(selectedIds, (ids) => {
      bulkDeleteDrafts(ids);
      clearAll();
    });
  }, [bulkDeleteDrafts, selectedIds, clearAll, requestDraftDeletion]);

  const handleBulkMove = React.useCallback(
    (dayId: string) => {
      // The day comes from BulkActionToolbar's date picker; the reschedule hook moves
      // the whole selection optimistically and persists each backend-backed draft.
      void rescheduleMany(selectedIds, dayId);
      clearAll();
    },
    [rescheduleMany, selectedIds, clearAll],
  );

  // Bulk "Generate media" — opt-in Step-3 realization for image/carousel/reel
  // drafts. Reel and image batches both flow through this single hook so the
  // GenerationsPopover ticker registers a backendJobId and server-side cancel works.
  const {
    generateDraftMedia,
    isGenerating: isGeneratingMedia,
    expandDrafts,
    stitchDraftReel,
    stitchingDraftIds,
  } = useGenerateDraftMedia();

  // Per-card stage CTAs: "Enrich" (Stage-2 blueprint sketch) on a text-only
  // card, "Generate final media" (Stage-3 realize, format-routed) on a
  // storyboard-ready card. Both need the persisted backend row.
  const handleEnrichDraft = React.useCallback(
    (draftId: string) => {
      const draft = drafts.find((d) => d.id === draftId);
      if (!brandProfileId || !draft?.backendDraftId) return;
      void expandDrafts(brandProfileId, [{ feId: draft.id, backendDraftId: draft.backendDraftId }]);
    },
    [brandProfileId, drafts, expandDrafts],
  );

  const handleRealizeDraft = React.useCallback(
    (draftId: string) => {
      const draft = drafts.find((d) => d.id === draftId);
      if (draft?.mediaSuggestion?.reel?.composition) {
        handleOpenDraftInAiStudio(draft);
        return;
      }
      const previewRevision = draft?.mediaSuggestion?.previewRevision;
      if (!brandProfileId || !draft?.backendDraftId || !previewRevision) return;
      void generateDraftMedia(brandProfileId, [
        {
          feId: draft.id,
          backendDraftId: draft.backendDraftId,
          format: draft.format ?? '',
          previewRevision,
        },
      ]);
    },
    [brandProfileId, drafts, generateDraftMedia, handleOpenDraftInAiStudio],
  );

  const handleStitchDraft = React.useCallback(
    (draftId: string) => {
      const draft = drafts.find((candidate) => candidate.id === draftId);
      const reel = draft?.mediaSuggestion?.reel;
      if (!brandProfileId || !draft?.backendDraftId || !reel?.composition) return;
      const sceneDuration =
        reel.scenes?.reduce(
          (total, scene) => total + (typeof scene.durationSec === 'number' ? scene.durationSec : 0),
          0,
        ) ?? 0;
      void stitchDraftReel(brandProfileId, {
        feId: draft.id,
        backendDraftId: draft.backendDraftId,
        durationSec:
          typeof reel.durationSec === 'number' && reel.durationSec > 0
            ? reel.durationSec
            : sceneDuration,
      });
    },
    [brandProfileId, drafts, stitchDraftReel],
  );

  // Selected reel drafts that carry a persisted storyboard and have not yet been
  // prepared as editable compositions — the eligible set for the gated batch.
  const reelTargets = React.useMemo(() => {
    const selected = new Set(selectedIds);
    return drafts
      .filter((d) => selected.has(d.id))
      .filter((d) => {
        const format = (d.format ?? '').toLowerCase();
        const reel = d.mediaSuggestion?.reel;
        const hasStoryboard = Array.isArray(reel?.scenes) && reel.scenes.length > 0;
        return (
          (format === 'reel' || format === 'video') &&
          hasStoryboard &&
          reel?.generated !== true &&
          !reel?.composition &&
          Boolean(d.backendDraftId)
        );
      })
      .filter((d) => Boolean(d.mediaSuggestion?.previewRevision))
      .map((d) => ({
        id: d.id,
        backendDraftId: d.backendDraftId as string,
        previewRevision: d.mediaSuggestion?.previewRevision as string,
      }));
  }, [drafts, selectedIds]);

  const handleGenerateReels = React.useCallback(() => {
    if (!brandProfileId || reelTargets.length === 0) return;
    // Cap the batch client-side (the backend also enforces this) so the user
    // gets clear feedback instead of an opaque 400.
    const capped = reelTargets.slice(0, DEFAULT_REEL_VIDEO_BATCH_MAX);
    if (typeof window !== 'undefined') {
      const approxClips = capped.length * 4;
      const overflowNote =
        reelTargets.length > capped.length
          ? ` Only the first ${capped.length} of ${reelTargets.length} selected will render (max ${DEFAULT_REEL_VIDEO_BATCH_MAX} per batch).`
          : '';
      const confirmed = window.confirm(
        `Prepare ${capped.length} reel composition${capped.length === 1 ? '' : 's'}? ` +
          `This renders ~${approxClips} AI video clips, then arranges them in AI Studio for editing.${overflowNote}`,
      );
      if (!confirmed) return;
    }
    void generateDraftMedia(
      brandProfileId,
      capped.map((t) => ({
        feId: t.id,
        backendDraftId: t.backendDraftId,
        format: 'reel',
        previewRevision: t.previewRevision,
      })),
    );
  }, [brandProfileId, reelTargets, generateDraftMedia]);

  const mediaGenerationTargets = React.useMemo(() => {
    const selected = new Set(selectedIds);
    return drafts
      .filter(
        (d) =>
          selected.has(d.id) &&
          Boolean(d.backendDraftId) &&
          Boolean(d.mediaSuggestion?.previewRevision),
      )
      .filter((d) => {
        // Only include drafts pending media generation (not already ready or user-supplied).
        const ms = d.mediaSuggestion?.mediaStatus;
        return !ms || ms === 'pending' || ms === 'generating';
      })
      .map((d) => ({
        feId: d.id,
        backendDraftId: d.backendDraftId as string,
        format: d.format ?? '',
        previewRevision: d.mediaSuggestion?.previewRevision as string,
      }));
  }, [drafts, selectedIds]);

  const handleBulkGenerateMedia = React.useCallback(() => {
    if (!brandProfileId || mediaGenerationTargets.length === 0) return;
    void generateDraftMedia(brandProfileId, mediaGenerationTargets);
  }, [brandProfileId, mediaGenerationTargets, generateDraftMedia]);

  // Bulk "Attach creative…" — open a library picker once, apply the selection to
  // all selected drafts. The picker's onAttach gives us a resolved PublishingAsset[]
  // that we spread onto every target draft.
  const [attachPickerOpen, setAttachPickerOpen] = React.useState(false);

  const attachTargetDraftIds = React.useMemo(() => {
    return selectedIds.filter((id) => drafts.some((d) => d.id === id && Boolean(d.backendDraftId)));
  }, [drafts, selectedIds]);

  const handlePickerAttach = React.useCallback(
    (publishingAssets: OrganicCalendarDraft['publishingAssets']) => {
      if (!publishingAssets?.length || attachTargetDraftIds.length === 0) return;
      // Derive a mediaSuggestion patch from the publishing assets so
      // assertPublishable + stageMediaForPublish both see consistent data.
      const primary = publishingAssets[0];
      const mediaPatch: OrganicCalendarDraft['mediaSuggestion'] = {
        mediaStatus: 'user_supplied',
        kind: primary?.kind ?? undefined,
        bucket: primary?.bucket ?? undefined,
        url: primary?.storagePath ?? undefined,
      };
      for (const draftId of attachTargetDraftIds) {
        updateDraftById(draftId, (draft) => ({
          ...draft,
          publishingAssets,
          mediaSuggestion: { ...draft.mediaSuggestion, ...mediaPatch },
        }));
      }
      setAttachPickerOpen(false);
    },
    [attachTargetDraftIds, updateDraftById],
  );

  const handleBulkAttachCreative = React.useCallback(() => {
    if (attachTargetDraftIds.length === 0 || !brandProfileId) return;
    setAttachPickerOpen(true);
  }, [attachTargetDraftIds, brandProfileId]);

  const isGenerating = gridStatus === 'running';
  const slotProgress = React.useMemo(() => {
    const completed = gridProgress.completed;
    const total = gridProgress.total;
    if (typeof completed !== 'number' || typeof total !== 'number' || total <= 0) {
      return null;
    }
    const failed = typeof gridProgress.failed === 'number' ? Math.max(0, gridProgress.failed) : 0;
    return {
      completed: Math.max(0, Math.min(completed, total)),
      total,
      failed,
    };
  }, [gridProgress.completed, gridProgress.failed, gridProgress.total]);
  // useSyncExternalStore-based, so it does not report `false` on the first client render and
  // then flip. The old useState + effect pair flipped on every desktop load, and the flip
  // used to remount the whole planner through the panel group's `key`.
  const isWidePlanner = useMediaQuery(WIDE_PLANNER_QUERY);
  const [previewPercent] = React.useState(() =>
    Math.min(42, Math.max(24, getLocalStorageJSON(PREVIEW_LAYOUT_KEY, 32))),
  );

  const scheduledCount = React.useMemo(
    () =>
      drafts.filter((draft) => draft.status === 'scheduled' || draft.status === 'published').length,
    [drafts],
  );
  const plannerStage = resolvePlannerStage({
    draftsCount: drafts.length,
    scheduledCount,
    isGenerating,
    hasSelection,
  });
  const plannerInsight = React.useMemo(
    () => derivePlannerInsight(visibleWeekDays),
    [visibleWeekDays],
  );

  // Hiding is reversible and the toast is where that promise is kept.
  const handleClearView = React.useCallback(() => {
    clearView();
    show({
      title: 'View cleared',
      description: 'Posts are hidden from this view. Nothing was deleted.',
      variant: 'info',
      action: { label: 'Undo', onClick: restoreView },
    });
  }, [clearView, restoreView, show]);

  const handlePreviewPercentChange = React.useCallback((percent: number) => {
    setLocalStorageJSON(PREVIEW_LAYOUT_KEY, percent);
  }, []);

  const previewTransition = React.useMemo(
    () => ({
      duration: 0.24,
      ease: [0.16, 1, 0.3, 1] as const,
    }),
    [],
  );

  return (
    <AiStudioHandoffProvider onOpen={brandProfileId ? handleOpenDraftInStudio : null}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: planner root is a keyboard-shortcut surface for the whole grid (delete/select), not a single control */}
      <div
        className="@container/organic relative h-full min-h-0 w-full overflow-hidden focus:outline-none"
        onKeyDown={handleKeyDown}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so grid-level key handlers fire without a child holding focus
        tabIndex={0}
      >
        <CalendarDndContext
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          dragOverlay={
            activeDragDraft ? (
              <div className="w-[220px] cursor-grabbing opacity-60">
                <CalendarDraftCard
                  draft={activeDragDraft}
                  isSelected={false}
                  isMultiSelected={false}
                  onSelect={NOOP_STRING}
                  onToggleSelection={NOOP_STRING}
                />
              </div>
            ) : null
          }
        >
          {/* `layout` is gone from every panel child. It measures with getBoundingClientRect
              on each commit and writes transforms; the group's ResizeObserver saw the size
              change, re-laid out, and `layout` measured again — a self-feeding loop that
              locked the page for 45s+ at 390x844, where the vertical preview claimed 48%. */}
          <PlannerLayout
            isWide={isWidePlanner}
            previewPercent={previewPercent}
            onPreviewPercentChange={handlePreviewPercentChange}
            onCollapsePreview={collapsePreview}
            preview={
              isPreviewOpen ? (
                <motion.aside
                  role="complementary"
                  aria-label="Draft preview"
                  tabIndex={-1}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Escape') clearAll();
                  }}
                  initial={{ opacity: 0, x: 28, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={previewTransition}
                  className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-card/80 p-2 ring-1 ring-border/45"
                >
                  <div className="mb-2 flex shrink-0 items-center justify-between pb-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Post Preview
                    </p>
                    <div className="flex items-center gap-1.5">
                      {previewDraft?.mediaSuggestion?.reel?.composition &&
                      previewDraft.mediaSuggestion.reel.generated !== true ? (
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          disabled={stitchingDraftIds.has(previewDraft.id)}
                          onClick={() => handleStitchDraft(previewDraft.id)}
                        >
                          {stitchingDraftIds.has(previewDraft.id)
                            ? 'Stitching…'
                            : 'Ready to render'}
                        </Button>
                      ) : null}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={!brandProfileId || !previewDraft}
                                  onClick={handleOpenInAiStudio}
                                  style={
                                    !brandProfileId || !previewDraft
                                      ? { pointerEvents: 'none' }
                                      : undefined
                                  }
                                >
                                  {previewDraft?.mediaSuggestion?.reel?.composition
                                    ? 'Edit in AI Studio'
                                    : 'Open in AI Studio'}
                                </Button>
                              </span>
                            }
                          />
                          {!brandProfileId ? (
                            <TooltipContent>Select a brand to use AI Studio</TooltipContent>
                          ) : null}
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Close preview"
                        onClick={clearAll}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* The preview's status reads from the same presentation map as the card's
                      pill — one status, one hue, one word, wherever it is shown. */}
                  {previewDraft ? (
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{previewDraft.platforms[0] ?? 'Unassigned'}</Badge>
                      <StatusBadge status={previewDraft.status} format={previewDraft.format} />
                      <Badge variant="outline">
                        {previewDraft.dateLabel || 'Unscheduled'} ·{' '}
                        {previewDraft.timeLabel || 'No time'}
                      </Badge>
                    </div>
                  ) : null}

                  <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border/45 bg-background/80">
                    {previewDraft ? (
                      <OrganicDraftPreview
                        draft={previewDraft}
                        brandName={brandName}
                        brandProfileId={brandProfileId}
                        onApprove={(draftId) => {
                          const target = drafts.find((draft) => draft.id === draftId);
                          if (target) void approveAndSchedule(target);
                        }}
                      />
                    ) : (
                      // Selection is set but the draft has not resolved from the
                      // current calendar set yet (a refetch/reconcile is in flight).
                      // Show a neutral loading state — the panel re-renders with
                      // content the moment the draft resolves, so no reload is needed.
                      <div
                        className="flex h-full flex-col gap-3 p-3"
                        role="status"
                        aria-busy="true"
                        aria-label="Loading post preview"
                      >
                        <div className="h-24 w-full animate-pulse rounded-md bg-muted/70" />
                        <div className="h-4 w-2/3 animate-pulse rounded bg-muted/70" />
                        <div className="h-4 w-1/2 animate-pulse rounded bg-muted/70" />
                        <div className="mt-auto h-9 w-full animate-pulse rounded-md bg-muted/70" />
                      </div>
                    )}
                  </div>
                </motion.aside>
              ) : null
            }
            workspace={
              <section className="relative flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                <PlannerWorkflowRail currentStage={plannerStage} insight={plannerInsight} />
                <div>
                  <CalendarToolbar
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                    selectedTrendCount={selectedTrendIds.length}
                    maxTrendSelections={maxTrendSelections}
                    isGenerating={isGenerating}
                    onOpenTrends={() => setTrendsDrawerOpen(true)}
                    onCreatePost={(options) =>
                      handleGoDraft({
                        dayId: options.dayId,
                        platform: options.platformKey,
                        status: options.status,
                        mode: options.mode,
                        format: options.format,
                      })
                    }
                    onClear={handleClearView}
                    draftsCount={drafts.length}
                    slotProgress={slotProgress}
                    gridProgress={gridProgress}
                    gridStatus={gridStatus}
                    gridError={gridError}
                    postedContentCount={postedContent.length}
                    isFetchingPostedContent={isFetchingPostedContent}
                    onFetchPostedContent={fetchExternalPosts}
                  />
                </div>

                {/* One local Suspense boundary and one keyed crossfade with NO exit.
                    `AnimatePresence mode="wait"` serialised a 150ms exit BEFORE the entering
                    child mounted, delaying the lazy chunk request and keeping the heavy
                    outgoing tree alive across the swap. */}
                <div data-tour-id="organic-list-content" className="min-h-0 flex-1 overflow-hidden">
                  <React.Suspense fallback={<PlannerViewSkeleton view={viewMode} />}>
                    <motion.div
                      key={`view-${viewMode}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      className="h-full"
                    >
                      {viewMode === 'week' ? (
                        /* Trends live in the toolbar's drawer (OrganicTrendsDrawer), so the
                           week grid takes the full vertical space instead of a 74/26 split. */
                        <div data-tour-id="organic-calendar" className="h-full overflow-hidden">
                          <TimeGridCanvas
                            days={visibleWeekDays}
                            platforms={plannerPlatforms}
                            postedContent={postedContent}
                            selectedDraftId={selectedId}
                            selectedDraftIds={selectedIds}
                            rangeTitle={weekTitle}
                            rangeSubtitle={weekSubtitle}
                            onPreviousWeek={handlePreviousWeek}
                            onToday={handleToday}
                            onNextWeek={handleNextWeek}
                            isLoadingPostedContent={isLoadingPostedContent}
                            postedContentError={postedContentError}
                            onRetryPostedContent={retryPostedContent}
                            onCreatePost={(context) =>
                              handleGoDraft({
                                dayId: context?.dayId,
                                platform: context?.platform,
                                status: context?.status,
                                mode: context?.mode,
                                format: context?.format,
                              })
                            }
                            onSelectDraft={(id) => handleSelect(id, false)}
                            onToggleSelection={(id) => handleSelect(id, true)}
                            onRegenerate={handleRegenerate}
                            onClearFailure={handleClearFailure}
                            onEnrich={handleEnrichDraft}
                            onRealize={handleRealizeDraft}
                            onStitch={handleStitchDraft}
                            onNativeDrop={handleNativeDrop}
                          />
                        </div>
                      ) : viewMode === 'month' ? (
                        <OrganicMonthlyCalendar
                          days={gridDays}
                          monthAnchorDate={monthAnchorDate}
                          platforms={plannerPlatforms}
                          postedContent={postedContent}
                          selectedDraftId={selectedId}
                          selectedDraftIds={selectedIds}
                          onSelectDraft={(id) => handleSelect(id, false)}
                          onToggleSelection={(id) => handleSelect(id, true)}
                          onCreatePost={({ dayId, platformKey, status, mode, format }) =>
                            handleGoDraft({
                              dayId,
                              platform: platformKey as PlannerPlatformKey | undefined,
                              status,
                              mode,
                              format,
                            })
                          }
                          onPreviousMonth={handlePreviousMonth}
                          onNextMonth={handleNextMonth}
                          onRegenerate={handleRegenerate}
                          onDeleteDraft={(id) => requestDraftDeletion([id], bulkDeleteDrafts)}
                        />
                      ) : (
                        <OrganicListView
                          days={listDays}
                          platforms={plannerPlatforms}
                          selectedDraftId={selectedId}
                          selectedDraftIds={selectedIds}
                          onSelectDraft={(id) => handleSelect(id, false)}
                          onToggleSelection={(id) => handleSelect(id, true)}
                          onRegenerate={handleRegenerate}
                          onCreatePost={({ dayId, platformKey, status, mode }) =>
                            handleGoDraft({
                              dayId,
                              platform: platformKey as PlannerPlatformKey | undefined,
                              status,
                              mode,
                            })
                          }
                          brandProfileId={brandProfileId}
                          backlogDrafts={backlogDrafts}
                          onAddBacklogDraft={addBacklogDraft}
                          onDeleteBacklogDraft={deleteBacklogDraft}
                          onPromoteBacklogDraft={promoteBacklogDraft}
                        />
                      )}
                    </motion.div>
                  </React.Suspense>
                </div>

                <OrganicTrendsDrawer
                  open={trendsDrawerOpen}
                  onOpenChange={setTrendsDrawerOpen}
                  trends={resolvedTrends}
                  selectedTrendIds={selectedTrendIds}
                  activePlatforms={activePlatforms}
                  maxSelections={maxTrendSelections}
                  onToggleTrend={(id) => toggleTrend(id, maxTrendSelections)}
                  onGenerateFromTrend={handleGenerateFromTrend}
                  onFetch={brandProfileId ? refreshTrends : undefined}
                  isFetching={isFetchingTrends}
                  insightsError={insightsError}
                  brandProfileId={brandProfileId}
                />

                {brandProfileId && aiComposer && (
                  <AiPostComposer
                    open
                    onOpenChange={(next) => {
                      if (!next) setAiComposer(null);
                    }}
                    brandProfileId={brandProfileId}
                    platform={aiComposer.platform}
                    scheduledAt={aiComposer.scheduledAt}
                    trends={resolvedTrends}
                    platformAccountIds={platformAccountIds}
                    initialTrendIds={aiComposer.seedTrendIds}
                    onCreated={handleOneShotCreated}
                  />
                )}
              </section>
            }
          />
        </CalendarDndContext>

        {/* The collapse control lives inside the preview panel, which unmounts when the
            panel collapses — so collapsing would otherwise remove the only way back. This
            trigger stays mounted for as long as a draft is selected. */}
        {hasSelection && isPreviewCollapsed ? (
          <button
            type="button"
            data-testid="planner-preview-expand"
            aria-label="Expand draft preview"
            onClick={expandPreview}
            className="bg-background hover:bg-accent absolute right-1 top-3 z-30 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        ) : null}

        <BulkActionToolbar
          selectedCount={selectedIds.length}
          onClear={clearAll}
          onDelete={handleBulkDelete}
          onMove={handleBulkMove}
          onApprove={handleBulkApprove}
          reelCount={reelTargets.length}
          onGenerateReels={brandProfileId ? handleGenerateReels : undefined}
          isGeneratingReels={isGeneratingMedia}
          onAttachCreative={
            brandProfileId && attachTargetDraftIds.length > 0 ? handleBulkAttachCreative : undefined
          }
          onGenerateMedia={
            brandProfileId && mediaGenerationTargets.length > 0
              ? handleBulkGenerateMedia
              : undefined
          }
          isGeneratingMedia={isGeneratingMedia}
        />
        {/* Bulk attach creative — one picker selection applied to all selected drafts. */}
        {brandProfileId && (
          <Dialog open={attachPickerOpen} onOpenChange={setAttachPickerOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  Attach creative to {attachTargetDraftIds.length} draft
                  {attachTargetDraftIds.length === 1 ? '' : 's'}
                </DialogTitle>
              </DialogHeader>
              <OrganicCreativesPicker
                brandProfileId={brandProfileId}
                draftId=""
                attached={[]}
                onAttach={handlePickerAttach}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AiStudioHandoffProvider>
  );
}

type PlannerLayoutProps = {
  isWide: boolean;
  workspace: React.ReactNode;
  /** `null` when nothing is selected — the layout then gives the grid the whole surface. */
  preview: React.ReactNode | null;
  previewPercent: number;
  onPreviewPercentChange: (percent: number) => void;
  onCollapsePreview: () => void;
};

/**
 * Two layouts, not one responsive one. Below `lg` there is no ResizablePanelGroup at all:
 * its ResizeObserver is what locked the page for 45s+ at 390x844, and a 390px-wide phone has
 * no room to drag a split anyway.
 */
function PlannerLayout({ isWide, ...props }: PlannerLayoutProps) {
  return isWide ? <PlannerSplitLayout {...props} /> : <PlannerStackedLayout {...props} />;
}

function PlannerSplitLayout({
  workspace,
  preview,
  previewPercent,
  onPreviewPercentChange,
  onCollapsePreview,
}: Omit<PlannerLayoutProps, 'isWide'>) {
  // No `key`: `orientation` and `defaultLayout` are props the group already re-lays-out on.
  // Keying it remounted both lazy views and the dnd context on every breakpoint cross.
  return (
    <ResizablePanelGroup
      id="organic-planner-layout"
      orientation="horizontal"
      defaultLayout={
        preview
          ? {
              'planner-workspace': 100 - previewPercent,
              'planner-preview': previewPercent,
            }
          : { 'planner-workspace': 100 }
      }
      onLayoutChanged={(layout, meta) => {
        const nextPreviewPercent = layout['planner-preview'];
        // Only a drag is a preference. A programmatic re-layout is not.
        if (meta.isUserInteraction && nextPreviewPercent > 0) {
          onPreviewPercentChange(nextPreviewPercent);
        }
      }}
      className="h-full min-h-0 w-full"
    >
      <ResizablePanel id="planner-workspace" minSize={preview ? 55 : 100}>
        {workspace}
      </ResizablePanel>
      {preview ? (
        <>
          <ResizableHandle withHandle className="mx-1 bg-transparent" />
          <ResizablePanel
            id="planner-preview"
            defaultSize={previewPercent}
            minSize="22rem"
            maxSize="36rem"
            collapsible
            collapsedSize={0}
          >
            <div className="relative flex h-full min-h-0">
              {preview}
              <ResizablePanelCollapseButton
                data-testid="planner-preview-collapse"
                label="Collapse draft preview"
                direction="right"
                onClick={onCollapsePreview}
              />
            </div>
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  );
}

/**
 * Inline rather than a Sheet on purpose: the planner's whole value is seeing the grid while
 * editing a post, and a sheet covers the grid.
 */
function PlannerStackedLayout({
  workspace,
  preview,
  onCollapsePreview,
}: Omit<PlannerLayoutProps, 'isWide' | 'previewPercent' | 'onPreviewPercentChange'>) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">{workspace}</div>
      {preview ? (
        <div className="relative mt-1 flex h-[48dvh] max-h-[48dvh] min-h-0 shrink-0 flex-col border-t border-border/50 pt-1">
          {preview}
          <ResizablePanelCollapseButton
            data-testid="planner-preview-collapse"
            label="Collapse draft preview"
            direction="down"
            onClick={onCollapsePreview}
          />
        </div>
      ) : null}
    </div>
  );
}
