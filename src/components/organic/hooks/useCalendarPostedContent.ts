"use client"

import * as React from "react"

import {
  calendarPostsResponseSchema,
  getVisibleMonthRange,
  getWeekRange,
  type CalendarPostAccountsByPlatform,
} from "@/lib/organic/calendar-posts"
import { getLocalStorageJSON, setLocalStorageJSON } from "@/lib/storage"
import type { OrganicCalendarPostedContent } from "@/components/organic/primitives/types"

type UseCalendarPostedContentParams = {
  brandProfileId?: string
  viewMode: "week" | "month" | "list"
  weekStart: Date
  monthAnchorDate: Date
  accountsByPlatform: CalendarPostAccountsByPlatform
}

type CalendarPostsCache = {
  cachedAt: number
  posts: OrganicCalendarPostedContent[]
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000

function stableAccountKey(accountsByPlatform: CalendarPostAccountsByPlatform): string {
  return (["instagram", "facebook", "tiktok"] as const)
    .flatMap((platform) =>
      accountsByPlatform[platform].map((account) => `${platform}:${account.integrationAccountId}`)
    )
    .sort()
    .join("|")
}

function buildCacheKey(args: {
  brandProfileId: string
  start: string
  end: string
  accountsByPlatform: CalendarPostAccountsByPlatform
}) {
  return [
    "continuum:organic-calendar:posted-content",
    args.brandProfileId,
    args.start,
    args.end,
    stableAccountKey(args.accountsByPlatform),
  ].join(":")
}

function readFreshCache(key: string): OrganicCalendarPostedContent[] | null {
  const cached = getLocalStorageJSON<CalendarPostsCache | null>(key, null)
  if (!cached) return null
  if (Date.now() - cached.cachedAt > CACHE_TTL_MS) return null
  return cached.posts
}

export function useCalendarPostedContent({
  brandProfileId,
  viewMode,
  weekStart,
  monthAnchorDate,
  accountsByPlatform,
}: UseCalendarPostedContentParams) {
  const [posts, setPosts] = React.useState<OrganicCalendarPostedContent[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [isFetchingExternal, setIsFetchingExternal] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const range = React.useMemo(
    () => (viewMode === "month" ? getVisibleMonthRange(monthAnchorDate) : getWeekRange(weekStart)),
    [monthAnchorDate, viewMode, weekStart]
  )

  const cacheKey = React.useMemo(() => {
    if (!brandProfileId) return null
    return buildCacheKey({
      brandProfileId,
      start: range.start,
      end: range.end,
      accountsByPlatform,
    })
  }, [accountsByPlatform, brandProfileId, range.end, range.start])

  const fetchPosts = React.useCallback(
    async (options?: { includeExternal?: boolean; forceRefreshExternal?: boolean }) => {
      if (!brandProfileId || !cacheKey) return

      if (options?.includeExternal) {
        setIsFetchingExternal(true)
      } else {
        setIsLoading(true)
      }
      setError(null)

      try {
        const response = await fetch("/api/organic/calendar-posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId: brandProfileId,
            start: range.start,
            end: range.end,
            accountsByPlatform,
            includeExternal: options?.includeExternal ?? false,
            forceRefreshExternal: options?.forceRefreshExternal ?? false,
          }),
        })

        if (!response.ok) {
          throw new Error("Unable to load posted content.")
        }

        const parsed = calendarPostsResponseSchema.parse(await response.json())
        setPosts(parsed.posts)
        setLocalStorageJSON<CalendarPostsCache>(cacheKey, {
          cachedAt: Date.now(),
          posts: parsed.posts,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load posted content.")
      } finally {
        setIsLoading(false)
        setIsFetchingExternal(false)
      }
    },
    [accountsByPlatform, brandProfileId, cacheKey, range.end, range.start]
  )

  React.useEffect(() => {
    if (!cacheKey || !brandProfileId) {
      setPosts([])
      return
    }

    const cached = readFreshCache(cacheKey)
    if (cached) {
      setPosts(cached)
    } else {
      setPosts([])
    }

    void fetchPosts()
  }, [brandProfileId, cacheKey, fetchPosts])

  const fetchExternalPosts = React.useCallback(() => {
    void fetchPosts({ includeExternal: true, forceRefreshExternal: true })
  }, [fetchPosts])

  return {
    posts,
    range,
    isLoading,
    isFetchingExternal,
    error,
    fetchExternalPosts,
  }
}
