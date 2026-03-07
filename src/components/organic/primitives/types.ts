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
    provider?: string
    model?: string
    kind?: string
    prompt?: string
    width?: number
    height?: number
    assetUrl?: string
    alt?: string
  }
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
