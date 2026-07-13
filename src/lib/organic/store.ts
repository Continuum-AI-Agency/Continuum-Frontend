import type { PublishPlatform } from '@continuum/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { makeCalendarDay } from '@/components/organic/primitives/calendar-utils';
import type {
  EventHistory,
  OrganicCalendarDay,
  OrganicCalendarDraft,
  StreamEvent,
} from '@/components/organic/primitives/types';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import * as storeRegistry from '@/lib/storage/storeRegistry';

export type CalendarDateRange = { from: string; to: string };

/** One of the brand's connected accounts on a platform, as offered by the planner's switcher. */
export type PlannerAccountOption = { id: string; label: string };

export type GridSlot = {
  slotId: string;
  schedule: {
    dayId: string;
    dayOfWeek: string;
    timeOfDay?: string | null;
    postIndex: number;
  };
  platform: {
    name: string;
    accountId: string;
  };
  strategy: {
    objective?: string | null;
    target?: string | null;
    tone?: string | null;
    cta?: string | null;
  };
  contentPlan: {
    titleTopic?: string | null;
    type?: string | null;
    format?: string | null;
    numSlides?: number | null;
  };
  tags?: {
    trendIds?: string[] | null;
  } | null;
};

export type WeeklyGrid = {
  meta: {
    weekStart: string;
    timezone: string;
    language: string;
    intent?: string | null;
    platformAccountIds: Partial<Record<OrganicPlatformKey, string>>;
    prompt?: string | null;
    generatedAt?: string | null;
  };
  slots: GridSlot[];
};

export type GridStatus =
  | 'idle'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'complete'
  | 'complete_with_errors'
  | 'error';

export interface ScheduledEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string;
  draftId?: string;
}

export type GenerationStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

// Three-step checkpoint state for the run-progress surfaces. Ephemeral.
export type GenerationCheckpoint = {
  textReady?: boolean;
  blueprintReady?: boolean;
  mediaStatus?: 'pending' | 'generating' | 'ready' | 'user_supplied' | 'skipped';
  awaitingMediaChoice?: boolean;
};

// Live registry of in-flight/finished post generations, projected from the agent
// panel reducer + the bulk run stream so the shell-wide GenerationsPopover can show
// status/progress/preview from any organic tab. Ephemeral — never persisted.
export type GenerationEntry = {
  // Stable UI registry key (e.g. the synthetic `realize:<feId>` for realize streams).
  jobId: string;
  // Real organic.post_generation_jobs uuid when one backs this entry (set from the
  // realize/reel started frame). The cancel button uses THIS, not `jobId`.
  backendJobId?: string | null;
  planItemId?: string | null;
  platform?: string | null;
  scheduledAt?: string | null;
  status: GenerationStatus;
  stage?: string | null;
  pct?: number | null;
  previewUrl?: string | null;
  quality?: number | null;
  draftId?: string | null;
  error?: string | null;
  checkpoint?: GenerationCheckpoint | null;
  updatedAt: number;
};

export type GenerationEntryInput = Partial<GenerationEntry> & { jobId: string };

interface CalendarState {
  days: OrganicCalendarDay[];
  ghosts: Record<string, number>;
  selectedDraftId: string | null;
  // The day the user last clicked. Context-free create actions (the toolbar "+",
  // the right-click "New post") target it instead of guessing at the first loaded
  // day. Deliberately absent from PersistedCalendarState: a focus ring restored
  // onto an off-screen day would silently misdirect the next "+".
  focusedDayId: string | null;
  selectedDraftIds: string[];
  selectedTrendIds: string[];
  persistedWeekStartId: string | null;
  // The account each platform publishes to, and every account the brand could publish to.
  // `accountIds` used to be the brand's alphabetically-first account per platform with no way
  // to change it — which is how posts went to the wrong profile. The switcher writes here.
  accountContext: {
    accountIds: Partial<Record<PublishPlatform, string>>;
    accountOptions: Partial<Record<PublishPlatform, PlannerAccountOption[]>>;
    brandId: string | null;
  };
  gridStatus: GridStatus;
  gridProgress: {
    percent: number;
    message?: string;
    completed?: number;
    total?: number;
    failed?: number;
    stage?: string;
  };
  gridError: string | null;
  gridJobId: string | null;
  placementProgress: Record<
    string,
    {
      percent: number;
      stage?: string;
      agentName?: string;
      message?: string;
    }
  >;
  generations: Record<string, GenerationEntry>;

  scheduledEvents: Record<string, ScheduledEvent[]>;
  viewMode: 'week' | 'month' | 'list';
  // Custom timeframe filter for the LIST view (null = show all loaded drafts).
  // A pure view filter over the fully-loaded draft set — never refetches.
  dateRange: CalendarDateRange | null;
  // Calendar lens: show/hide drafts that belong to a bulk content plan ("planned").
  showPlanned: boolean;
  // Cross-subtree signal: agent-side completion (bulk run done, single draft ready)
  // bumps this so the calendar workspace re-fetches persisted drafts from the backend.
  calendarRefetchNonce: number;
  // Backend ids of drafts the user explicitly deleted, awaiting a server-side
  // delete by the persistence layer. Without this an agent-/teammate-created draft
  // would only vanish locally and reappear on the next refetch ("undeletable").
  pendingServerDeletes: string[];
  eventHistory: EventHistory;
  backlogDrafts: OrganicCalendarDraft[];

  setDays: (days: OrganicCalendarDay[]) => void;
  updateDraft: (
    draftId: string,
    updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
  ) => void;
  moveDraft: (draftId: string, targetDayId: string) => void;
  bulkMoveDrafts: (draftIds: string[], targetDayId: string) => void;
  addDraft: (dayId: string, draft: OrganicCalendarDraft) => void;
  bulkDeleteDrafts: (draftIds: string[]) => void;
  // Drop ids from pendingServerDeletes once the persistence layer has deleted them
  // server-side (or confirmed there was nothing to delete).
  clearPendingServerDeletes: (backendIds: string[]) => void;
  setSelectedDraftId: (id: string | null) => void;
  setFocusedDayId: (id: string | null) => void;
  setSelectedDraftIds: (ids: string[]) => void;
  toggleDraftSelection: (id: string) => void;
  clearDraftSelection: () => void;
  setPersistedWeekStartId: (weekStartId: string | null) => void;
  toggleTrend: (trendId: string, maxSelections?: number) => void;
  setGridStatus: (status: GridStatus) => void;
  setGridProgress: (progress: {
    percent: number;
    message?: string;
    completed?: number;
    total?: number;
    failed?: number;
    stage?: string;
  }) => void;
  setGridError: (error: string | null) => void;
  setGridJobId: (jobId: string | null) => void;
  upsertGeneration: (entry: GenerationEntryInput) => void;
  removeGeneration: (jobId: string) => void;
  clearGenerations: () => void;
  // Evict finished generations after a short grace window, and drop entries that
  // are nominally "running" but have stopped reporting (a worker that died after a
  // lease loss never emits a terminal frame). Keeps the "N generations / N running"
  // counter from drifting upward forever and showing a phantom stuck run.
  pruneGenerations: () => void;
  setPlacementProgress: (
    placementId: string,
    progress: {
      percent: number;
      stage?: string;
      agentName?: string;
      message?: string;
    },
  ) => void;
  clearPlacementProgress: () => void;
  setGhosts: (dayId: string, count: number) => void;
  addEvent: (event: StreamEvent) => void;
  clearEventHistory: () => void;
  clearGhosts: () => void;
  clearCalendar: () => void;
  resetForBrandSwitch: () => void;

  addScheduledEvent: (date: string, event: Omit<ScheduledEvent, 'id'>) => void;
  updateEventTime: (eventId: string, newTime: { start: string; end: string }) => void;
  moveEventToDay: (eventId: string, targetDate: string) => void;
  setViewMode: (mode: 'week' | 'month' | 'list') => void;
  setDateRange: (range: CalendarDateRange | null) => void;
  setShowPlanned: (value: boolean) => void;
  requestCalendarRefetch: () => void;

  addBacklogDraft: (draft: OrganicCalendarDraft) => void;
  updateBacklogDraft: (
    draftId: string,
    updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
  ) => void;
  deleteBacklogDraft: (draftId: string) => void;
  promoteBacklogDraft: (draftId: string, dayId: string, timeLabel: string) => void;
  duplicateDraft: (sourceDraftId: string, targetDayId?: string, newTimeLabel?: string) => void;
  setAccountContext: (ctx: {
    accountIds: Partial<Record<PublishPlatform, string>>;
    accountOptions?: Partial<Record<PublishPlatform, PlannerAccountOption[]>>;
    brandId: string | null;
  }) => void;
  /** Point one platform at a different one of the brand's accounts. */
  selectAccount: (platform: PublishPlatform, accountId: string) => void;
}

type PersistedCalendarState = Pick<
  CalendarState,
  'selectedTrendIds' | 'persistedWeekStartId' | 'viewMode' | 'dateRange' | 'days' | 'backlogDrafts'
>;

// Bump when the persisted shape changes in a breaking way.
const CALENDAR_STORE_VERSION = 5;

// Drop every base64 blob before the draft is persisted to sessionStorage: the
// primary asset, each carousel slide, and the hyperframe cover. Media is re-signed
// from durable storage paths on load, so base64 must never bloat persisted state.
export function stripDraftBlobs(draft: OrganicCalendarDraft): OrganicCalendarDraft {
  const media = draft.mediaSuggestion;
  if (!media) return draft;
  return {
    ...draft,
    mediaSuggestion: {
      ...media,
      assetBase64: null,
      assets: media.assets?.map((asset) => ({ ...asset, assetBase64: null })),
      hyperframe: media.hyperframe ? { ...media.hyperframe, coverBase64: null } : media.hyperframe,
    },
  };
}

function sanitizePersistedCalendarState(
  state: Partial<CalendarState> | undefined,
): PersistedCalendarState {
  const selectedTrendIds = Array.isArray(state?.selectedTrendIds)
    ? state.selectedTrendIds.filter((id): id is string => typeof id === 'string').slice(0, 5)
    : [];

  const persistedWeekStartId =
    typeof state?.persistedWeekStartId === 'string' && state.persistedWeekStartId.trim().length > 0
      ? state.persistedWeekStartId
      : null;

  const viewMode: 'week' | 'month' | 'list' =
    state?.viewMode === 'week' || state?.viewMode === 'month' || state?.viewMode === 'list'
      ? state.viewMode
      : 'month';

  const candidateRange = state?.dateRange;
  const dateRange: CalendarDateRange | null =
    candidateRange &&
    typeof candidateRange === 'object' &&
    typeof candidateRange.from === 'string' &&
    typeof candidateRange.to === 'string'
      ? { from: candidateRange.from, to: candidateRange.to }
      : null;

  // Strip large binary blobs (assetBase64) to keep sessionStorage lean.
  const days: OrganicCalendarDay[] = Array.isArray(state?.days)
    ? state.days.map((day) => ({ ...day, slots: day.slots.map(stripDraftBlobs) }))
    : [];

  const backlogDrafts: OrganicCalendarDraft[] = Array.isArray(state?.backlogDrafts)
    ? state.backlogDrafts.map(stripDraftBlobs)
    : [];

  return { selectedTrendIds, persistedWeekStartId, viewMode, dateRange, days, backlogDrafts };
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      days: [],
      ghosts: {},
      selectedDraftId: null,
      focusedDayId: null,
      selectedDraftIds: [],
      selectedTrendIds: [],
      persistedWeekStartId: null,
      accountContext: { accountIds: {}, accountOptions: {}, brandId: null },
      gridStatus: 'idle',
      gridProgress: { percent: 0 },
      gridError: null,
      gridJobId: null,
      placementProgress: {},
      generations: {},
      scheduledEvents: {},
      viewMode: 'month',
      dateRange: null,
      showPlanned: true,
      calendarRefetchNonce: 0,
      pendingServerDeletes: [],
      eventHistory: [],
      backlogDrafts: [],

      setDays: (days) => set({ days }),

      updateDraft: (draftId, updater) =>
        set((state) => ({
          days: state.days.map((day) => ({
            ...day,
            slots: day.slots.map((slot) => (slot.id === draftId ? updater(slot) : slot)),
          })),
        })),

      moveDraft: (draftId, targetDayId) =>
        set((state) => {
          let movedDraft: OrganicCalendarDraft | undefined;

          const nextDays = state.days.map((day) => {
            const draftIndex = day.slots.findIndex((s) => s.id === draftId);
            if (draftIndex !== -1) {
              const slots = [...day.slots];
              [movedDraft] = slots.splice(draftIndex, 1);
              return { ...day, slots };
            }
            return day;
          });

          if (!movedDraft) return { days: nextDays };

          // The drop target may be a synthesized day not yet in the loaded set
          // (the week grid renders 7 days regardless of what's loaded). Materialize
          // it so the dragged draft isn't lost.
          if (!nextDays.some((day) => day.id === targetDayId)) {
            return {
              days: [...nextDays, { ...makeCalendarDay(targetDayId), slots: [movedDraft] }],
            };
          }

          return {
            days: nextDays.map((day) => {
              if (day.id === targetDayId) {
                return { ...day, slots: [...day.slots, movedDraft!] };
              }
              return day;
            }),
          };
        }),

      bulkMoveDrafts: (draftIds, targetDayId) =>
        set((state) => {
          const movedDrafts: OrganicCalendarDraft[] = [];
          const draftIdSet = new Set(draftIds);

          const nextDays = state.days.map((day) => {
            const remainingSlots = day.slots.filter((slot) => {
              if (draftIdSet.has(slot.id)) {
                movedDrafts.push(slot);
                return false;
              }
              return true;
            });
            return { ...day, slots: remainingSlots };
          });

          if (movedDrafts.length === 0) return { days: nextDays };

          return {
            days: nextDays.map((day) => {
              if (day.id === targetDayId) {
                return { ...day, slots: [...day.slots, ...movedDrafts] };
              }
              return day;
            }),
          };
        }),

      addDraft: (dayId, draft) =>
        set((state) => {
          // The target day may not be loaded (e.g. a "+" on a month-grid cell
          // outside the loaded set). Materialize it so the draft has a home rather
          // than being silently dropped by a day-id miss.
          if (!state.days.some((day) => day.id === dayId)) {
            return { days: [...state.days, { ...makeCalendarDay(dayId), slots: [draft] }] };
          }
          return {
            days: state.days.map((day) => {
              if (day.id !== dayId) return day;
              const exists = day.slots.findIndex((s) => s.id === draft.id);
              if (exists !== -1) {
                const slots = [...day.slots];
                slots[exists] = draft;
                return { ...day, slots };
              }
              return { ...day, slots: [...day.slots, draft] };
            }),
          };
        }),

      bulkDeleteDrafts: (draftIds) =>
        set((state) => {
          const draftIdSet = new Set(draftIds);
          // Collect the backend ids of the drafts being removed so the persistence
          // layer can delete the server rows too (RLS allows any brand member).
          const backendIdsToDelete: string[] = [];
          for (const day of state.days) {
            for (const slot of day.slots) {
              if (draftIdSet.has(slot.id) && slot.backendDraftId) {
                backendIdsToDelete.push(slot.backendDraftId);
              }
            }
          }
          return {
            days: state.days.map((day) => ({
              ...day,
              slots: day.slots.filter((slot) => !draftIdSet.has(slot.id)),
            })),
            pendingServerDeletes: backendIdsToDelete.length
              ? [...state.pendingServerDeletes, ...backendIdsToDelete]
              : state.pendingServerDeletes,
          };
        }),
      clearPendingServerDeletes: (backendIds) =>
        set((state) => {
          if (backendIds.length === 0) return {} as Partial<CalendarState>;
          const remove = new Set(backendIds);
          return {
            pendingServerDeletes: state.pendingServerDeletes.filter((id) => !remove.has(id)),
          };
        }),

      setSelectedDraftId: (id) => set({ selectedDraftId: id }),

      setFocusedDayId: (id) => set({ focusedDayId: id }),
      setSelectedDraftIds: (ids) => set({ selectedDraftIds: ids }),
      setPersistedWeekStartId: (weekStartId) => set({ persistedWeekStartId: weekStartId }),

      toggleDraftSelection: (id) =>
        set((state) => {
          const next = new Set(state.selectedDraftIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { selectedDraftIds: Array.from(next) };
        }),

      clearDraftSelection: () => set({ selectedDraftIds: [] }),

      toggleTrend: (trendId, maxSelections = 5) =>
        set((state) => {
          const next = new Set(state.selectedTrendIds);
          if (next.has(trendId)) {
            next.delete(trendId);
          } else if (next.size < maxSelections) {
            next.add(trendId);
          }
          return { selectedTrendIds: Array.from(next) };
        }),

      setGridStatus: (status) =>
        set((state) => ({
          gridStatus: status,
          eventHistory: status === 'running' ? [] : state.eventHistory,
        })),
      setGridProgress: (progress) => set({ gridProgress: progress }),
      setGridError: (error) => set({ gridError: error }),
      setGridJobId: (jobId) => set({ gridJobId: jobId }),
      setPlacementProgress: (placementId, progress) =>
        set((state) => ({
          placementProgress: { ...state.placementProgress, [placementId]: progress },
        })),
      clearPlacementProgress: () => set({ placementProgress: {} }),
      upsertGeneration: (entry) =>
        set((state) => {
          const prev = state.generations[entry.jobId];
          return {
            generations: {
              ...state.generations,
              [entry.jobId]: {
                ...prev,
                ...entry,
                status: entry.status ?? prev?.status ?? 'queued',
                updatedAt: Date.now(),
              },
            },
          };
        }),
      removeGeneration: (jobId) =>
        set((state) => {
          if (!state.generations[jobId]) return {} as Partial<CalendarState>;
          const next = { ...state.generations };
          delete next[jobId];
          return { generations: next };
        }),
      clearGenerations: () => set({ generations: {} }),
      pruneGenerations: () =>
        set((state) => {
          const now = Date.now();
          const TERMINAL_TTL_MS = 20_000; // keep a finished card ~20s for "View draft"
          const STALE_ACTIVE_MS = 180_000; // a run silent for 3min is dead, not running
          const next: Record<string, GenerationEntry> = {};
          let changed = false;
          for (const [key, entry] of Object.entries(state.generations)) {
            const terminal =
              entry.status === 'completed' ||
              entry.status === 'failed' ||
              entry.status === 'cancelled';
            const age = now - entry.updatedAt;
            if (terminal && age > TERMINAL_TTL_MS) {
              changed = true;
              continue;
            }
            if (!terminal && age > STALE_ACTIVE_MS) {
              changed = true;
              continue;
            }
            next[key] = entry;
          }
          return changed ? { generations: next } : ({} as Partial<CalendarState>);
        }),
      addEvent: (event) =>
        set((state) => ({
          eventHistory: [...state.eventHistory, event].slice(-20),
        })),
      clearEventHistory: () => set({ eventHistory: [] }),

      setGhosts: (dayId, count) =>
        set((state) => ({
          ghosts: { ...state.ghosts, [dayId]: count },
        })),

      clearGhosts: () => set({ ghosts: {} }),

      clearCalendar: () =>
        set((state) => ({
          days: state.days.map((day) => ({ ...day, slots: [] })),
          selectedDraftId: null,
          selectedDraftIds: [],
          gridStatus: 'idle',
          gridProgress: { percent: 0 },
          gridError: null,
          placementProgress: {},
          eventHistory: [],
        })),

      addScheduledEvent: (date, event) =>
        set((state) => {
          const newId = crypto.randomUUID();
          const currentEvents = state.scheduledEvents[date] || [];
          return {
            scheduledEvents: {
              ...state.scheduledEvents,
              [date]: [...currentEvents, { ...event, id: newId }],
            },
          };
        }),

      updateEventTime: (eventId, newTime) =>
        set((state) => {
          const newEvents = { ...state.scheduledEvents };
          for (const date in newEvents) {
            const index = newEvents[date].findIndex((e) => e.id === eventId);
            if (index !== -1) {
              newEvents[date] = [...newEvents[date]];
              newEvents[date][index] = {
                ...newEvents[date][index],
                startTime: newTime.start,
                endTime: newTime.end,
              };
              return { scheduledEvents: newEvents };
            }
          }
          return state;
        }),

      moveEventToDay: (eventId, targetDate) =>
        set((state) => {
          let eventToMove: ScheduledEvent | undefined;
          const newEvents = { ...state.scheduledEvents };

          for (const date in newEvents) {
            const index = newEvents[date].findIndex((e) => e.id === eventId);
            if (index !== -1) {
              const cloned = [...newEvents[date]];
              [eventToMove] = cloned.splice(index, 1);
              if (cloned.length === 0) {
                delete newEvents[date];
              } else {
                newEvents[date] = cloned;
              }
              break;
            }
          }

          if (!eventToMove) return state;

          const targetEvents = newEvents[targetDate] || [];
          newEvents[targetDate] = [...targetEvents, { ...eventToMove, date: targetDate }];

          return { scheduledEvents: newEvents };
        }),

      setViewMode: (mode) => set({ viewMode: mode }),
      setDateRange: (range) => set({ dateRange: range }),
      setShowPlanned: (value) => set({ showPlanned: value }),
      requestCalendarRefetch: () =>
        set((state) => ({ calendarRefetchNonce: state.calendarRefetchNonce + 1 })),

      addBacklogDraft: (draft) =>
        set((state) => ({
          backlogDrafts: [...state.backlogDrafts.filter((d) => d.id !== draft.id), draft],
        })),

      updateBacklogDraft: (draftId, updater) =>
        set((state) => ({
          backlogDrafts: state.backlogDrafts.map((d) => (d.id === draftId ? updater(d) : d)),
        })),

      deleteBacklogDraft: (draftId) =>
        set((state) => ({
          backlogDrafts: state.backlogDrafts.filter((d) => d.id !== draftId),
        })),

      promoteBacklogDraft: (draftId, dayId, timeLabel) =>
        set((state) => {
          const draft = state.backlogDrafts.find((d) => d.id === draftId);
          if (!draft) return {};
          const promoted: OrganicCalendarDraft = { ...draft, timeLabel, status: 'draft' };
          const day = state.days.find((d) => d.id === dayId);
          const dateLabel = day ? `${day.label}, ${day.dateLabel}` : draft.dateLabel;
          return {
            backlogDrafts: state.backlogDrafts.filter((d) => d.id !== draftId),
            days: state.days.map((d) => {
              if (d.id !== dayId) return d;
              return { ...d, slots: [...d.slots, { ...promoted, dateLabel }] };
            }),
          };
        }),

      duplicateDraft: (sourceDraftId, targetDayId, newTimeLabel) =>
        set((state) => {
          let sourceDraft: OrganicCalendarDraft | undefined;
          let sourceDayId: string | undefined;
          for (const day of state.days) {
            const found = day.slots.find((s) => s.id === sourceDraftId);
            if (found) {
              sourceDraft = found;
              sourceDayId = day.id;
              break;
            }
          }
          if (!sourceDraft) return {};

          const resolvedTargetDayId = targetDayId ?? sourceDayId;
          if (!resolvedTargetDayId) return {};

          const targetDay = state.days.find((d) => d.id === resolvedTargetDayId);
          const clonedId = `draft-${crypto.randomUUID()}`;
          const cloned: OrganicCalendarDraft = {
            ...sourceDraft,
            id: clonedId,
            // A duplicate is a NEW logical post the user now owns: fresh canonical
            // identity (override the spread source's) + manual origin so the autosave
            // persists it as its own row instead of colliding with the source.
            clientKey: clonedId,
            origin: 'manual',
            title: sourceDraft.title.endsWith(' (copy)')
              ? sourceDraft.title
              : `${sourceDraft.title} (copy)`,
            status: 'draft',
            timeLabel: newTimeLabel ?? sourceDraft.timeLabel,
            dateLabel: targetDay
              ? `${targetDay.label}, ${targetDay.dateLabel}`
              : sourceDraft.dateLabel,
            seedTrendId: undefined,
            targetAccountId: undefined,
            generationError: undefined,
            generationAttempts: undefined,
            instagram_post_id: undefined,
            backendDraftId: undefined,
            publishingAssets: undefined,
            progress: undefined,
            generationStage: undefined,
          };

          return {
            days: state.days.map((day) => {
              if (day.id === resolvedTargetDayId) {
                return { ...day, slots: [...day.slots, cloned] };
              }
              return day;
            }),
          };
        }),

      setAccountContext: (ctx) =>
        set({
          accountContext: {
            accountIds: ctx.accountIds,
            accountOptions: ctx.accountOptions ?? {},
            brandId: ctx.brandId,
          },
        }),

      selectAccount: (platform, accountId) =>
        set((state) => ({
          accountContext: {
            ...state.accountContext,
            accountIds: { ...state.accountContext.accountIds, [platform]: accountId },
          },
        })),

      resetForBrandSwitch: () =>
        set({
          days: [],
          ghosts: {},
          selectedDraftId: null,
          focusedDayId: null,
          selectedDraftIds: [],
          selectedTrendIds: [],
          persistedWeekStartId: null,
          accountContext: { accountIds: {}, accountOptions: {}, brandId: null },
          gridStatus: 'idle',
          gridProgress: { percent: 0 },
          gridError: null,
          gridJobId: null,
          scheduledEvents: {},
          eventHistory: [],
          backlogDrafts: [],
        }),
    }),
    {
      name: 'organic-calendar-storage',
      version: CALENDAR_STORE_VERSION,
      // sessionStorage: tab-scoped, survives hard navigation within a session,
      // does not bleed across tabs. Falls back to localStorage in SSR contexts.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.sessionStorage : localStorage,
      ),
      partialize: (state) => sanitizePersistedCalendarState(state),
      // v4 -> v5 introduces the month-default redesign + dateRange filter. Reset
      // viewMode to "month" on migration so existing sessions land on the new
      // primary view; ongoing persists keep whatever the user chooses thereafter.
      migrate: (persistedState) => ({
        ...sanitizePersistedCalendarState(persistedState as Partial<CalendarState>),
        viewMode: 'month' as const,
      }),
    },
  ),
);

// Register a teardown so brand switching wipes the calendar's persisted state.
// The store's storage key is not brand-scoped (would require Zustand re-mount);
// instead we reset in-memory state and clear the sessionStorage entry on switch.
if (typeof window !== 'undefined') {
  storeRegistry.register({
    name: 'organic-calendar',
    teardown: () => {
      try {
        useCalendarStore.getState().resetForBrandSwitch();
        window.sessionStorage.removeItem('organic-calendar-storage');
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[organic-calendar] teardown failed', error);
        }
      }
    },
  });
}
