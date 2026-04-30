import { NextResponse } from "next/server"
import { z } from "zod"

import { normalizeInstagramOrganicMetricsResponse } from "@/lib/organic-metrics/normalize"
import {
  calendarPostAccountsByPlatformSchema,
  calendarPostsResponseSchema,
  formatCalendarDayId,
  formatPostedTimeLabel,
  normalizeCalendarPlatform,
  type CalendarPostAccountsByPlatform,
} from "@/lib/organic/calendar-posts"
import type { OrganicCalendarPostedContent } from "@/components/organic/primitives/types"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type { OrganicPost } from "@/lib/schemas/organicMetrics"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const calendarPostsRequestSchema = z.object({
  brandId: z.string().uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountsByPlatform: calendarPostAccountsByPlatformSchema,
  includeExternal: z.boolean().optional(),
  forceRefreshExternal: z.boolean().optional(),
})

type PublishedPostRow = {
  brand_id: string
  caption: string | null
  content_snapshot: unknown
  created_at: string
  draft_id: string | null
  ig_user_id: string
  instagram_post_id: string
  media_urls: unknown
  permalink: string | null
  post_type: string
  published_at: string
}

type TikTokVideo = {
  id: string
  create_time?: number
  cover_image_url?: string
  share_url?: string
  video_description?: string
}

type TikTokEdgeResponse = {
  videos?: TikTokVideo[]
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function readMediaUrl(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim()
  if (!Array.isArray(value)) return null
  const first = value.find((item): item is string => typeof item === "string" && item.trim().length > 0)
  return first?.trim() ?? null
}

function toTimestampRange(start: string, end: string) {
  return {
    startIso: `${start}T00:00:00.000Z`,
    endIso: `${end}T23:59:59.999Z`,
  }
}

function mapTimestampToPostFields(timestamp: string) {
  const parsed = new Date(timestamp)
  const dayId = Number.isNaN(parsed.getTime())
    ? timestamp.slice(0, 10)
    : formatCalendarDayId(parsed)
  return {
    dayId,
    timeLabel: formatPostedTimeLabel(timestamp),
  }
}

function mapPublishedPost(row: PublishedPostRow): OrganicCalendarPostedContent {
  const snapshot = asRecord(row.content_snapshot)
  const timestamp = row.published_at || row.created_at
  const caption = row.caption ?? readString(snapshot.caption) ?? undefined
  const title = readString(snapshot.title) ?? caption?.slice(0, 72) ?? "Published post"
  const mediaUrl = readMediaUrl(row.media_urls) ?? readMediaUrl(snapshot.mediaUrls)
  const { dayId, timeLabel } = mapTimestampToPostFields(timestamp)

  return {
    id: `published:${row.instagram_post_id}`,
    source: "published_posts",
    platform: "instagram",
    externalPostId: row.instagram_post_id,
    timestamp,
    dayId,
    timeLabel,
    title,
    caption,
    permalink: row.permalink ?? undefined,
    mediaType: row.post_type,
    mediaUrl,
    thumbnailUrl: mediaUrl,
  }
}

function mapAnalyticsPost(args: {
  post: OrganicPost
  platform: OrganicPlatformKey
  integrationAccountId: string
}): OrganicCalendarPostedContent | null {
  const { post, platform, integrationAccountId } = args
  if (!post.timestamp) return null

  const { dayId, timeLabel } = mapTimestampToPostFields(post.timestamp)
  const caption = post.caption ?? post.title

  return {
    id: `external:${platform}:${post.id}`,
    source: "external",
    platform,
    integrationAccountId,
    externalPostId: post.id,
    timestamp: post.timestamp,
    dayId,
    timeLabel,
    title: post.title ?? caption?.slice(0, 72) ?? "Published post",
    caption,
    permalink: post.permalink,
    mediaType: post.mediaType ?? post.mediaProductType,
    mediaUrl: post.mediaUrl ?? null,
    thumbnailUrl: post.thumbnailUrl ?? post.mediaUrl ?? null,
  }
}

function mapTikTokVideo(video: TikTokVideo, integrationAccountId: string): OrganicCalendarPostedContent | null {
  if (!video.id || !video.create_time) return null
  const timestamp = new Date(video.create_time * 1000).toISOString()
  const { dayId, timeLabel } = mapTimestampToPostFields(timestamp)
  const caption = video.video_description

  return {
    id: `external:tiktok:${video.id}`,
    source: "external",
    platform: "tiktok",
    integrationAccountId,
    externalPostId: video.id,
    timestamp,
    dayId,
    timeLabel,
    title: caption?.slice(0, 72) || "TikTok post",
    caption,
    permalink: video.share_url,
    mediaType: "VIDEO",
    mediaUrl: video.cover_image_url ?? null,
    thumbnailUrl: video.cover_image_url ?? null,
  }
}

function dedupePosts(posts: OrganicCalendarPostedContent[]): OrganicCalendarPostedContent[] {
  const byKey = new Map<string, OrganicCalendarPostedContent>()
  for (const post of posts) {
    const key = post.permalink
      ? `${post.platform}:url:${post.permalink}`
      : `${post.platform}:id:${post.externalPostId ?? post.id}`
    const existing = byKey.get(key)
    if (!existing || existing.source === "external") {
      byKey.set(key, post)
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

async function fetchExternalPosts(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  brandId: string
  start: string
  end: string
  accountsByPlatform: CalendarPostAccountsByPlatform
  forceRefresh: boolean
}): Promise<OrganicCalendarPostedContent[]> {
  const posts: OrganicCalendarPostedContent[] = []
  const { supabase, brandId, start, end, accountsByPlatform, forceRefresh } = params

  for (const platform of ["instagram", "facebook"] as const) {
    for (const account of accountsByPlatform[platform]) {
      const { data, error } = await supabase.functions.invoke("fetch-organic-analytics", {
        body: {
          brandId,
          integrationAccountId: account.integrationAccountId,
          platform,
          range: { preset: "custom", custom: { from: start, to: end } },
          scope: "posts",
          forceRefresh,
        },
      })
      if (error) continue

      const normalized = normalizeInstagramOrganicMetricsResponse(data)
      posts.push(
        ...(normalized.posts ?? [])
          .map((post) =>
            mapAnalyticsPost({
              post,
              platform: normalizeCalendarPlatform(platform),
              integrationAccountId: account.integrationAccountId,
            })
          )
          .filter((post): post is OrganicCalendarPostedContent => post !== null)
      )
    }
  }

  for (const account of accountsByPlatform.tiktok) {
    const { data, error } = await supabase.functions.invoke("fetch-tiktok-data", {
      body: {
        brandId,
        integrationAccountId: account.integrationAccountId,
        scope: "all",
        forceRefresh,
      },
    })
    if (error) continue

    const videos = ((data as TikTokEdgeResponse | null)?.videos ?? [])
      .map((video) => mapTikTokVideo(video, account.integrationAccountId))
      .filter((post): post is OrganicCalendarPostedContent => post !== null)
      .filter((post) => post.dayId >= start && post.dayId <= end)
    posts.push(...videos)
  }

  return posts
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = calendarPostsRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { startIso, endIso } = toTimestampRange(parsed.data.start, parsed.data.end)
  const organicSchema = supabase.schema("organic" as never) as unknown as {
    from: (table: "organic_published_posts") => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          or: (filters: string) => {
            order: (column: string, options: { ascending: boolean }) => Promise<{ data: PublishedPostRow[] | null; error: { message: string } | null }>
          }
        }
      }
    }
  }

  const { data, error } = await organicSchema
    .from("organic_published_posts")
    .select("brand_id, caption, content_snapshot, created_at, draft_id, ig_user_id, instagram_post_id, media_urls, permalink, post_type, published_at")
    .eq("brand_id", parsed.data.brandId)
    .or(`and(published_at.gte.${startIso},published_at.lte.${endIso}),and(published_at.is.null,created_at.gte.${startIso},created_at.lte.${endIso})`)
    .order("published_at", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const databasePosts = (data ?? []).map(mapPublishedPost)
  const shouldFetchExternal = databasePosts.length === 0 || parsed.data.includeExternal === true
  const externalPosts = shouldFetchExternal
    ? await fetchExternalPosts({
        supabase,
        brandId: parsed.data.brandId,
        start: parsed.data.start,
        end: parsed.data.end,
        accountsByPlatform: parsed.data.accountsByPlatform,
        forceRefresh: parsed.data.forceRefreshExternal ?? false,
      })
    : []

  const response = calendarPostsResponseSchema.parse({
    posts: dedupePosts([...databasePosts, ...externalPosts]),
    databaseCount: databasePosts.length,
    externalFetched: shouldFetchExternal,
  })

  return NextResponse.json(response)
}
