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
  
  setDays: (days: OrganicCalendarDay[]) => void;
  setUnscheduledDrafts: (drafts: OrganicCalendarDraft[]) => void;
  updateDraft: (draftId: string, updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft) => void;
  moveDraft: (draftId: string, targetDayId: string | "unscheduled") => void;
  addDraft: (dayId: string | "unscheduled", draft: OrganicCalendarDraft) => void;
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

      addDraft: (dayId, draft) =>
        set((state) => {
          if (dayId === "unscheduled") {
            return { unscheduledDrafts: [...state.unscheduledDrafts, draft] };
          }
          return {
            days: state.days.map((day) =>
              day.id === dayId ? { ...day, slots: [...day.slots, draft] } : day
            ),
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
    }),
    {
      name: "organic-calendar-storage",
      partialize: (state) => ({ 
        selectedTrendIds: state.selectedTrendIds,
      }),
    }
  )
);
