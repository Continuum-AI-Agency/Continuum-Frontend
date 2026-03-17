import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { 
  OrganicCalendarDay, 
  OrganicCalendarDraft, 
  StreamEvent,
  EventHistory
} from "@/components/organic/primitives/types";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";

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
  | "idle"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "complete"
  | "complete_with_errors"
  | "error";

export interface ScheduledEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string;
  draftId?: string;
}

interface CalendarState {
  days: OrganicCalendarDay[];
  ghosts: Record<string, number>;
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  selectedTrendIds: string[];
  persistedWeekStartId: string | null;
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

  scheduledEvents: Record<string, ScheduledEvent[]>;
  viewMode: "day" | "week" | "month";
  eventHistory: EventHistory;
  
  setDays: (days: OrganicCalendarDay[]) => void;
  updateDraft: (draftId: string, updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft) => void;
  moveDraft: (draftId: string, targetDayId: string) => void;
  bulkMoveDrafts: (draftIds: string[], targetDayId: string) => void;
  addDraft: (dayId: string, draft: OrganicCalendarDraft) => void;
  bulkDeleteDrafts: (draftIds: string[]) => void;
  setSelectedDraftId: (id: string | null) => void;
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
  setGhosts: (dayId: string, count: number) => void;
  addEvent: (event: StreamEvent) => void;
  clearEventHistory: () => void;
  clearGhosts: () => void;
  clearCalendar: () => void;

  addScheduledEvent: (date: string, event: Omit<ScheduledEvent, "id">) => void;
  updateEventTime: (eventId: string, newTime: { start: string; end: string }) => void;
  moveEventToDay: (eventId: string, targetDate: string) => void;
  setViewMode: (mode: "day" | "week" | "month") => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      days: [],
      ghosts: {},
      selectedDraftId: null,
      selectedDraftIds: [],
      selectedTrendIds: [],
      persistedWeekStartId: null,
      gridStatus: "idle",
      gridProgress: { percent: 0 },
      gridError: null,
      gridJobId: null,
      scheduledEvents: {},
      viewMode: "week",
      eventHistory: [],

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
          return {
            days: state.days.map((day) => ({
              ...day,
              slots: day.slots.filter((slot) => !draftIdSet.has(slot.id)),
            })),
          };
        }),

      setSelectedDraftId: (id) => set({ selectedDraftId: id }),
      setSelectedDraftIds: (ids) => set({ selectedDraftIds: ids }),
      setPersistedWeekStartId: (weekStartId) => set({ persistedWeekStartId: weekStartId }),
      
      toggleDraftSelection: (id) => set((state) => {
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
          eventHistory:
            status === "running" ? [] : state.eventHistory,
        })),
      setGridProgress: (progress) => set({ gridProgress: progress }),
      setGridError: (error) => set({ gridError: error }),
      setGridJobId: (jobId) => set({ gridJobId: jobId }),
      addEvent: (event) =>
        set((state) => ({
          eventHistory: [...state.eventHistory, event].slice(-50),
        })),
      clearEventHistory: () => set({ eventHistory: [] }),
      
      setGhosts: (dayId, count) => 
        set((state) => ({
          ghosts: { ...state.ghosts, [dayId]: count }
        })),
        
      clearGhosts: () => set({ ghosts: {} }),
      
      clearCalendar: () =>
        set((state) => ({
          days: state.days.map((day) => ({ ...day, slots: [] })),
          selectedDraftId: null,
          selectedDraftIds: [],
          gridStatus: "idle",
          gridProgress: { percent: 0 },
          gridError: null,
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
              [eventToMove] = newEvents[date].splice(index, 1);
              if (newEvents[date].length === 0) delete newEvents[date];
              break;
            }
          }

          if (!eventToMove) return state;

          const targetEvents = newEvents[targetDate] || [];
          newEvents[targetDate] = [...targetEvents, { ...eventToMove, date: targetDate }];

          return { scheduledEvents: newEvents };
        }),

      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: "organic-calendar-storage",
      partialize: (state) => ({ 
        selectedTrendIds: state.selectedTrendIds,
        selectedDraftId: state.selectedDraftId,
        selectedDraftIds: state.selectedDraftIds,
        days: state.days,
        persistedWeekStartId: state.persistedWeekStartId,
        scheduledEvents: state.scheduledEvents,
        viewMode: state.viewMode,
      }),
    }
  )
);
