import type { OrganicCalendarDay, OrganicCalendarDraft } from "./types"

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

export function startOfWeek(date: Date): Date {
  const next = new Date(date)
  const dayOfWeek = next.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  next.setDate(next.getDate() + diffToMonday)
  next.setHours(0, 0, 0, 0)
  return next
}

export function formatDayId(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart)
  end.setDate(weekStart.getDate() + 6)
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
  return `${formatter.format(weekStart)} – ${formatter.format(end)}`
}

export function buildWeekDays(weekStart: Date): OrganicCalendarDay[] {
  const days: OrganicCalendarDay[] = []
  const base = startOfWeek(weekStart)

  for (let i = 0; i < 7; i++) {
    const current = new Date(base)
    current.setDate(base.getDate() + i)

    const id = formatDayId(current)
    const monthName = current.toLocaleString("en-US", { month: "short" })
    const dateLabel = `${monthName} ${current.getDate()}`

    days.push({
      id,
      label: WEEKDAY_LABELS[i],
      dateLabel,
      suggestedTimes: ["9:00 AM", "1:00 PM", "5:00 PM"],
      slots: [],
    })
  }

  return days
}

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

export function parseTimeLabelToHour(timeLabel: string): number | null {
  const match = timeLabel.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
  if (!match) return null;
  
  let hour = parseInt(match[1], 10);
  const ampm = match[3].toUpperCase();
  
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  
  return hour;
}

export function parseTimeLabelToParts(
  timeLabel: string
): { hour: number; minute: number } | null {
  const match = timeLabel.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i)
  if (!match) return null

  let hour = parseInt(match[1], 10)
  const minute = parseInt(match[2] ?? "0", 10)
  const ampm = match[3].toUpperCase()

  if (ampm === "PM" && hour < 12) hour += 12
  if (ampm === "AM" && hour === 12) hour = 0

  return { hour, minute }
}

export function buildScheduledAt(dayId: string, timeLabel: string): string | null {
  const [yearRaw, monthRaw, dayRaw] = dayId.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  const timeParts = parseTimeLabelToParts(timeLabel) ?? { hour: 9, minute: 0 }
  const date = new Date(year, month - 1, day, timeParts.hour, timeParts.minute, 0, 0)
  return date.toISOString()
}

export function resolveTimeLabel(
  timeOfDay: string | null | undefined,
  fallbackTimes: string[]
): string {
  if (!timeOfDay) return fallbackTimes[0] ?? "9:00 AM"
  const mapping: Record<string, string> = {
    morning: "9:00 AM",
    afternoon: "1:00 PM",
    evening: "6:00 PM",
  }
  return mapping[timeOfDay] ?? fallbackTimes[0] ?? "9:00 AM"
}

export function formatTimeLabel(isoTime: string) {
  const [h, m] = isoTime.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`
}

export function formatTimeLabelFromIso(isoString: string): string | null {
  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) return null
  const hours = parsed.getHours()
  const minutes = parsed.getMinutes()
  return formatTimeLabel(`${hours}:${minutes.toString().padStart(2, "0")}`)
}
