import { z } from "zod"

import { isOrganicPlatformKey } from "@/lib/organic/platforms"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type { OrganicCalendarPostedContent } from "@/components/organic/primitives/types"

export const calendarPostAccountSchema = z.object({
  integrationAccountId: z.string().min(1),
  name: z.string().optional(),
  externalAccountId: z.string().nullable().optional(),
})

export const calendarPostAccountsByPlatformSchema = z.object({
  instagram: z.array(calendarPostAccountSchema).default([]),
  facebook: z.array(calendarPostAccountSchema).default([]),
  tiktok: z.array(calendarPostAccountSchema).default([]),
  youtube: z.array(calendarPostAccountSchema).default([]),
  linkedin: z.array(calendarPostAccountSchema).default([]),
})

export type CalendarPostAccount = z.infer<typeof calendarPostAccountSchema>
export type CalendarPostAccountsByPlatform = z.infer<typeof calendarPostAccountsByPlatformSchema>

export const calendarPostedContentSchema = z.object({
  id: z.string(),
  source: z.enum(["published_posts", "external"]),
  platform: z.custom<OrganicPlatformKey>(
    (value): value is OrganicPlatformKey => typeof value === "string" && isOrganicPlatformKey(value)
  ),
  integrationAccountId: z.string().optional(),
  externalPostId: z.string().optional(),
  timestamp: z.string(),
  dayId: z.string(),
  timeLabel: z.string(),
  title: z.string(),
  caption: z.string().optional(),
  permalink: z.string().optional(),
  mediaType: z.string().optional(),
  mediaUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
}) satisfies z.ZodType<OrganicCalendarPostedContent>

export const calendarPostsResponseSchema = z.object({
  posts: z.array(calendarPostedContentSchema),
  databaseCount: z.number(),
  externalFetched: z.boolean(),
})

export type CalendarPostsResponse = z.infer<typeof calendarPostsResponseSchema>

export function formatCalendarDayId(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function getVisibleMonthRange(anchorDate: Date): { start: string; end: string } {
  const month = anchorDate.getMonth()
  const year = anchorDate.getFullYear()
  const firstDay = new Date(year, month, 1)
  const gridStart = new Date(firstDay)
  gridStart.setDate(1 - firstDay.getDay())

  const lastDay = new Date(year, month + 1, 0)
  const gridEnd = new Date(lastDay)
  gridEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay()))

  return {
    start: formatCalendarDayId(gridStart),
    end: formatCalendarDayId(gridEnd),
  }
}

export function getWeekRange(weekStart: Date): { start: string; end: string } {
  const end = new Date(weekStart)
  end.setDate(weekStart.getDate() + 6)
  return {
    start: formatCalendarDayId(weekStart),
    end: formatCalendarDayId(end),
  }
}

export function formatPostedTimeLabel(timestamp: string): string {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return ""
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed)
}

export function normalizeCalendarPlatform(value: unknown): OrganicPlatformKey {
  return typeof value === "string" && isOrganicPlatformKey(value) ? value : "instagram"
}
