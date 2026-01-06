import type { OrganicCalendarDay, OrganicCalendarDraft } from "./types"

export function moveDraftToDay(
  days: OrganicCalendarDay[],
  draftId: string,
  targetDayId: string
): OrganicCalendarDay[] {
  let movedDraft: OrganicCalendarDraft | null = null

  const cleared = days.map((day) => {
    const remaining = day.slots.filter((draft) => {
      if (draft.id === draftId) {
        movedDraft = draft
        return false
      }
      return true
    })

    return day.id === targetDayId ? day : { ...day, slots: remaining }
  })

  if (!movedDraft) return days

  return cleared.map((day) => {
    if (day.id !== targetDayId) return day

    const updatedDraft: OrganicCalendarDraft = {
      ...movedDraft!,
      dateLabel: `${day.label}, ${day.dateLabel}`,
    }

    return {
      ...day,
      slots: [...day.slots.filter((draft) => draft.id !== draftId), updatedDraft],
    }
  })
}
