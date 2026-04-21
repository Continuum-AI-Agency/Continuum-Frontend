import type { CalendarPlacement } from "@/lib/organic/calendar-generation"

export type AgentJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled"

export type ToolCallEvent = {
  toolCallId: string
  toolName: string
  args: unknown
  result?: unknown
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
}

export type ConversationMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  toolCalls?: ToolCallEvent[]
}

export type AgentChatInput = {
  brandId: string
  sessionId: string
  messages: Array<{ role: "user" | "assistant"; content: string }>
  weekStart?: string
  timezone?: string
  platformAccountIds?: Record<string, string>
}
