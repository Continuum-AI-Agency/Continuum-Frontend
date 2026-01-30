import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { 
  OrganicCalendarDay, 
  OrganicCalendarDraft, 
  OrganicDraftStatus 
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

export type GridStatus = "idle" | "running" | "awaiting_approval" | "approved" | "complete" | "error";

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
  unscheduledDrafts: OrganicCalendarDraft[];
  ghosts: Record<string, number>;
  selectedDraftId: string | null;
  selectedDraftIds: string[];
  selectedTrendIds: string[];
  gridStatus: GridStatus;
  gridProgress: {
    percent: number;
    message?: string;
  };
  gridError: string | null;
  gridJobId: string | null;

  scheduledEvents: Record<string, ScheduledEvent[]>;
  viewMode: "day" | "week" | "month";
  
  setDays: (days: OrganicCalendarDay[]) => void;
  setUnscheduledDrafts: (drafts: OrganicCalendarDraft[]) => void;
  updateDraft: (draftId: string, updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft) => void;
  moveDraft: (draftId: string, targetDayId: string | "unscheduled") => void;
  bulkMoveDrafts: (draftIds: string[], targetDayId: string | "unscheduled") => void;
  addDraft: (dayId: string | "unscheduled", draft: OrganicCalendarDraft) => void;
  bulkDeleteDrafts: (draftIds: string[]) => void;
  setSelectedDraftId: (id: string | null) => void;
  toggleDraftSelection: (id: string) => void;
  clearDraftSelection: () => void;
  toggleTrend: (trendId: string, maxSelections?: number) => void;
  setGridStatus: (status: GridStatus) => void;
  setGridProgress: (progress: { percent: number; message?: string }) => void;
  setGridError: (error: string | null) => void;
  setGridJobId: (jobId: string | null) => void;
  setGhosts: (dayId: string, count: number) => void;
  clearGhosts: () => void;

  addScheduledEvent: (date: string, event: Omit<ScheduledEvent, "id">) => void;
  updateEventTime: (eventId: string, newTime: { start: string; end: string }) => void;
  moveEventToDay: (eventId: string, targetDate: string) => void;
  setViewMode: (mode: "day" | "week" | "month") => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      days: [],
      unscheduledDrafts: [],
      ghosts: {},
      selectedDraftId: null,
      selectedDraftIds: [],
      selectedTrendIds: [],
      gridStatus: "idle",
      gridProgress: { percent: 0 },
      gridError: null,
      gridJobId: null,
      scheduledEvents: {},
      viewMode: "week",

      setDays: (days) => set({ days }),
      setUnscheduledDrafts: (drafts) => set({ unscheduledDrafts: drafts }),
      
      updateDraft: (draftId, updater) =>
        set((state) => ({
          days: state.days.map((day) => ({
            ...day,
            slots: day.slots.map((slot) => (slot.id === draftId ? updater(slot) : slot)),
          })),
          unscheduledDrafts: state.unscheduledDrafts.map((slot) => (slot.id === draftId ? updater(slot) : slot)),
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

          let nextUnscheduled = state.unscheduledDrafts.filter((d) => {
            if (d.id === draftId) {
              movedDraft = d;
              return false;
            }
            return true;
          });

          if (!movedDraft) return { days: nextDays, unscheduledDrafts: nextUnscheduled };

          if (targetDayId === "unscheduled") {
            return {
              days: nextDays,
              unscheduledDrafts: [...nextUnscheduled, movedDraft],
            };
          }

          return {
            days: nextDays.map((day) => {
              if (day.id === targetDayId) {
                return { ...day, slots: [...day.slots, movedDraft!] };
              }
              return day;
            }),
            unscheduledDrafts: nextUnscheduled,
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

          const nextUnscheduled = state.unscheduledDrafts.filter((slot) => {
            if (draftIdSet.has(slot.id)) {
              movedDrafts.push(slot);
              return false;
            }
            return true;
          });

          if (movedDrafts.length === 0) return { days: nextDays, unscheduledDrafts: nextUnscheduled };

          if (targetDayId === "unscheduled") {
            return {
              days: nextDays,
              unscheduledDrafts: [...nextUnscheduled, ...movedDrafts],
            };
          }

          return {
            days: nextDays.map((day) => {
              if (day.id === targetDayId) {
                return { ...day, slots: [...day.slots, ...movedDrafts] };
              }
              return day;
            }),
            unscheduledDrafts: nextUnscheduled,
          };
        }),

      addDraft: (dayId, draft) =>
        set((state) => {
          if (dayId === "unscheduled") {
            const exists = state.unscheduledDrafts.findIndex((d) => d.id === draft.id);
            if (exists !== -1) {
              const next = [...state.unscheduledDrafts];
              next[exists] = draft;
              return { unscheduledDrafts: next };
            }
            return { unscheduledDrafts: [...state.unscheduledDrafts, draft] };
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
          return {
            days: state.days.map((day) => ({
              ...day,
              slots: day.slots.filter((slot) => !draftIdSet.has(slot.id)),
            })),
            unscheduledDrafts: state.unscheduledDrafts.filter((slot) => !draftIdSet.has(slot.id)),
          };
        }),

      setSelectedDraftId: (id) => set({ selectedDraftId: id }),
      
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

      setGridStatus: (status) => set({ gridStatus: status }),
      setGridProgress: (progress) => set({ gridProgress: progress }),
      setGridError: (error) => set({ gridError: error }),
      setGridJobId: (jobId) => set({ gridJobId: jobId }),
      
      setGhosts: (dayId, count) => 
        set((state) => ({
          ghosts: { ...state.ghosts, [dayId]: count }
        })),
        
      clearGhosts: () => set({ ghosts: {} }),

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
        scheduledEvents: state.scheduledEvents,
        viewMode: state.viewMode,
      }),
    }
  )
);
