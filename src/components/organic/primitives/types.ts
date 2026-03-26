import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type { CalendarGenerationEvent } from "@/lib/organic/calendar-generation"

export type { CalendarGenerationEvent }

export type OrganicPlatformTag = OrganicPlatformKey

export type OrganicDraftStatus =
  | "draft"
  | "scheduled"
  | "streaming"
  | "failed"
  | "placeholder"

export type OrganicCalendarDraft = {
  id: string
  title: string
  summary: string
  timeLabel: string
  dateLabel: string
  status: OrganicDraftStatus
  platforms: OrganicPlatformTag[]
  format: string
  objective: string
  slideCount?: number
  progress?: number
  captionPreview: string
  tags: string[]
  creativeDirectionPrompt?: string
  thumbnailPrompt?: string
  location?: string
  mediaCount: number
  seedTrendId?: string
  targetAccountId?: string
  adjusted?: boolean
  titleTopic?: string
  target?: string
  tone?: string
  cta?: string
  creativeIdea?: string
  generationError?: string
  generationAttempts?: number
  mediaSuggestion?: {
    provider?: string | null
    model?: string | null
    kind?: string | null
    prompt?: string | null
    width?: number | null
    height?: number | null
    assetUrl?: string | null
    alt?: string | null
    assetBase64?: string | null
    assets?: Array<{
      role?: string | null
      order?: number | null
      provider?: string | null
      model?: string | null
      prompt?: string | null
      width?: number | null
      height?: number | null
      assetBase64?: string | null
      mimeType?: string | null
      error?: string | null
      generationContext?: {
        sourceAgent?: string | null
        finalPrompt?: string | null
        request?: {
          provider?: string | null
          model?: string | null
          imageSize?: string | null
        } | null
        placement?: {
          placementId?: string | null
          dayId?: string | null
          scheduledAt?: string | null
        } | null
        strategist?: {
          objective?: string | null
          funnel?: string | null
          funnelStage?: string | null
          targetAudience?: string | null
          tone?: string | null
          angle?: string | null
          postType?: string | null
          postSize?: string | null
        } | null
        creativeDirection?: {
          title?: string | null
          conceptTitle?: string | null
          direction?: string | null
          creativeDirection?: string | null
          hook?: string | null
          storyHook?: string | null
          trendIntegration?: string | null
          modes?: string[] | null
          visualMode?: string | null
          audioMode?: string | null
          notes?: string | null
          productionNotes?: string[] | null
        } | null
        trend?: {
          trendId?: string | null
          seedSource?: "trend" | "question" | "event" | "manual" | null
        } | null
      } | null
    }> | null
    generationContext?: {
      sourceAgent?: string | null
      finalPrompt?: string | null
      request?: {
        provider?: string | null
        model?: string | null
        imageSize?: string | null
      } | null
      placement?: {
        placementId?: string | null
        dayId?: string | null
        scheduledAt?: string | null
      } | null
      strategist?: {
        objective?: string | null
        funnel?: string | null
        funnelStage?: string | null
        targetAudience?: string | null
        tone?: string | null
        angle?: string | null
        postType?: string | null
        postSize?: string | null
      } | null
      creativeDirection?: {
        title?: string | null
        conceptTitle?: string | null
        direction?: string | null
        creativeDirection?: string | null
        hook?: string | null
        storyHook?: string | null
        trendIntegration?: string | null
        modes?: string[] | null
        visualMode?: string | null
        audioMode?: string | null
        notes?: string | null
        productionNotes?: string[] | null
      } | null
      trend?: {
        trendId?: string | null
        seedSource?: "trend" | "question" | "event" | "manual" | null
      } | null
    } | null
  }
  publishingAssets?: Array<{
    role: string
    kind: "image" | "video"
    slideIndex?: number
    storagePath: string
    storageUrl: string
    mimeType?: string
    width?: number
    height?: number
    generationContext?: unknown
  }>
  assetHints?: Array<{
    role: string
    suggestion: string
  }>
  hashtags?: {
    high?: string[]
    medium?: string[]
    low?: string[]
  }
}

export type OrganicCalendarDay = {
  id: string
  label: string
  dateLabel: string
  suggestedTimes: string[]
  slots: OrganicCalendarDraft[]
}

export type OrganicCreationStepStatus = "complete" | "active" | "upcoming"

export type OrganicCreationStep = {
  id: string
  title: string
  detail: string
  status: OrganicCreationStepStatus
}

export type OrganicTrend = {
  id: string
  title: string
  summary: string
  momentum: "rising" | "stable" | "cooling"
  tags: string[]
  platforms: OrganicPlatformTag[]
}

export type OrganicTrendGroup = {
  id: string
  title: string
  trends: OrganicTrend[]
}

export type OrganicTrendType = {
  id: string
  label: string
  groups: OrganicTrendGroup[]
}

export type OrganicDraftCreateRequest = {
  brandProfileId: string
  userId: string
  instagramAccountId: string
  dayId?: string
  trendIds?: string[]
  competitorContentUrl?: string
  prompt?: string
}

export type OrganicActivityItem = {
  id: string
  actor: string
  summary: string
  timeLabel: string
  highlight?: string
}

export type OrganicEditorSlide = {
  id: string
  label: string
  gradient: string
}

export type OrganicSeedDragPayload = {
  type: "trend" | "question" | "event"
  trendId: string
  title?: string
}

export type StreamEvent = {
  id: string
  type: CalendarGenerationEvent["type"]
  timestamp: string
  data: CalendarGenerationEvent
}

export type EventHistory = StreamEvent[]
