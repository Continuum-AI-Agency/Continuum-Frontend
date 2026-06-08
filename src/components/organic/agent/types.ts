import type { CalendarPlacement } from "@/lib/organic/calendar-generation"
import type { AgentMentionMetadata, AgentMentionReference } from "@/lib/agent-references"
import { pipelineStageEnum } from "@continuum/contracts"
import type {
  BulkContentPlan,
  MediaSearchResultsFrame,
  PipelineStage,
  PlanItem,
  ProposedPlan,
  UiFetchedPost,
} from "@continuum/contracts"

export type { BulkContentPlan, PipelineStage } from "@continuum/contracts"
// Canonical agent plan types live in @continuum/contracts; re-export so existing
// `from "./types"` import sites (PlanCard, ConceptPlan, ...) stay unchanged and
// the Frontend can never drift from the Backend plan shape.
export type { PlanItem, PlanItemStatus, PlanEvidence, PlanStatus } from "@continuum/contracts"

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

// PlanItem, PlanItemStatus, PlanEvidence, PlanStatus are re-exported from
// @continuum/contracts above. UiPlanCard is the canonical proposed-plan shape.
export type UiPlanCard = ProposedPlan

export type PlanApprovalDecision =
  | { decision: "approve"; planId: string; itemId?: string }
  | { decision: "edit"; planId: string; edits: PlanItem[] }
  | { decision: "reject"; planId: string; reason?: string }

export type { UiFetchedPost } from "@continuum/contracts"

// Agent-proposed brand skill awaiting the user's confirm/edit/save (ui.skill_proposal).
export type SkillProposalCardData = {
  proposalId: string
  brandId: string
  name: string
  kind: "creative_direction" | "analytic"
  description: string | null
  directives: string
  tags: string[]
}

export type UiCard =
  | { type: "trend_chart"; data: UiTrendChart }
  | { type: "plan_card"; data: UiPlanCard }
  | { type: "bulk_plan_card"; data: BulkContentPlan }
  | { type: "post_list"; data: UiFetchedPost[]; label?: string }
  | { type: "skill_proposal"; data: SkillProposalCardData }

export type BulkRunStatus = "running" | "completed" | "failed"

/**
 * Aggregate state for a background bulk generation run, derived by the
 * BulkRunPanel from the v2 run-event envelopes it polls. Keyed by runId
 * (deterministic `run_<planId>`).
 */
export type BulkRunState = {
  runId: string
  planId: string
  brandId: string
  total: number
  completed: number
  failed: number
  byPlatform: Record<string, number>
  byFormat: Record<string, number>
  status: BulkRunStatus
}

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

// Canonical ordering comes straight from the contract enum — no FE duplicate.
export const PIPELINE_STAGES: readonly PipelineStage[] = pipelineStageEnum.options

export type PipelineStageNodeStatus = "pending" | "active" | "done" | "failed"

export type PipelineStageNode = {
  stage: PipelineStage
  status: PipelineStageNodeStatus
  agentName?: string
}

export type PipelinePreview = {
  caption: string | null
  imageUrl: string | null
  images?: string[] | null
  format: string | null
}

export type PipelineQuality = {
  passed: boolean
  overallScore: number
  brandFitScore?: number
  platformFitScore?: number
  noveltyScore?: number
  complianceScore?: number
  summary?: string
}

export type PipelineCardStatus = "running" | "completed" | "failed" | "cancelled"

export type PipelineCardState = {
  jobId: string
  brandId?: string
  planId?: string | null
  planItemId?: string | null
  platform?: string
  stages: PipelineStageNode[]
  currentStage?: PipelineStage
  pct?: number
  status: PipelineCardStatus
  preview?: PipelinePreview
  quality?: PipelineQuality | null
  draftId?: string | null
  error?: { code?: string; message: string }
}

export type ToolApproval = {
  approvalId: string
  toolCallId: string
  toolName: string
  input: unknown
}

export type ConversationMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  metadata?: AgentMentionMetadata
  toolCalls?: ToolCallEvent[]
  uiCards?: UiCard[]
  mediaSearchResults?: MediaSearchResultsFrame[]
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
  approvals?: Array<{ id: string; approved: boolean; reason?: string }>
  weekStart?: string
  timezone?: string
  platformAccountIds?: Record<string, string>
}
