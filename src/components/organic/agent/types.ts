import type { CalendarPlacement } from "@/lib/organic/calendar-generation"
import type { AgentMentionMetadata, AgentMentionReference } from "@/lib/agent-references"

export type AgentJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled"

export type ToolCallEvent = {
  toolCallId: string
  toolName: string
  args: unknown
  result?: unknown
}

export type UiTrendChart = {
  chartType: "bar"
  title: string
  windows: number[]
  series: Array<{
    label: "Trends" | "Events" | "Questions"
    data: Array<{ window: number; value: number }>
  }>
  topSignals: Array<{
    id: string
    title: string
    type: "trend" | "event" | "question"
    confidence: number | null
    platform: string | null
    windowDays: number
  }>
}

export type UiPostCard = {
  draftId: string
  jobId: string
  brandId: string
  platform: string
  scheduledAt: string
  caption: string | null
  hashtags: string[]
  imageUrl: string | null
  format: string | null
  topic: string | null
  quality: { score: number; passed: boolean } | null
  trendId: string | null
}

export type UiCard = { type: "trend_chart"; data: UiTrendChart }

export type AgentJobState = {
  jobId: string
  brandId: string
  platform?: string
  scheduledAt?: string
  trendId?: string | null
  status: AgentJobStatus
  stage?: string
  agentName?: string
  message?: string
  error?: { code?: string; message: string }
  draftId?: string
  placement?: CalendarPlacement
  uiPostCard?: UiPostCard
}

export type ConversationMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  metadata?: AgentMentionMetadata
  toolCalls?: ToolCallEvent[]
  uiCards?: UiCard[]
}

export type AgentChatInput = {
  brandId: string
  sessionId: string
  messages: Array<{
    id: string
    role: "user" | "assistant"
    content: string
    metadata?: AgentMentionMetadata
  }>
  references?: AgentMentionReference[]
  weekStart?: string
  timezone?: string
  platformAccountIds?: Record<string, string>
}
