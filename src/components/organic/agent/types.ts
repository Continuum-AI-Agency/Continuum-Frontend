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

export type PlanItemStatus = "pending" | "executing" | "completed" | "failed" | "cancelled"

export type PlanItem = {
  itemId: string
  kind: "create_post" | "create_draft" | "edit_draft" | "publish_draft"
  platform: "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube"
  scheduledAt: string
  format: "reel" | "post" | "carousel" | "story" | null
  trendId: string | null
  trendTitle: string | null
  angle: string
  objective: "follow" | "save" | "click" | "comment" | "dm" | "share"
  audienceSegment: string
  rationale: string
  guidancePrompt: string | null
  draftId: string | null
  jobId: string | null
  dependsOn: string[]
  status: PlanItemStatus
}

export type PlanEvidence = {
  kind: "trend" | "metric" | "competitor" | "past_draft" | "brand_doc"
  refId: string | null
  summary: string
}

export type UiPlanCard = {
  planId: string
  sessionId: string
  brandId: string
  weekStart: string
  title: string
  summary: string
  items: PlanItem[]
  evidence: PlanEvidence[]
  estimatedDurationSeconds: number
  status: "proposed"
  createdAt: string
}

export type PlanApprovalDecision =
  | { decision: "approve"; planId: string }
  | { decision: "edit"; planId: string; edits: PlanItem[] }
  | { decision: "reject"; planId: string; reason?: string }

export type UiCard =
  | { type: "trend_chart"; data: UiTrendChart }
  | { type: "plan_card"; data: UiPlanCard }

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
    metadata?: AgentMentionMetadata & { planApproval?: PlanApprovalDecision }
  }>
  references?: AgentMentionReference[]
  weekStart?: string
  timezone?: string
  platformAccountIds?: Record<string, string>
}
