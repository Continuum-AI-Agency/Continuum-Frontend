import type {
  AeoSnapshotCard,
  AgentAttachment,
  AgentDelegatedFrameData,
  BulkContentPlan,
  MediaSearchResultsFrame,
  OrganicPostCardData,
  OrganicTrendChartData,
  PipelineStage,
  PlanItem,
  ProposedPlan,
  UiFetchedPost,
} from '@continuum/contracts';
import { pipelineStageEnum } from '@continuum/contracts';
import type { AgentMentionMetadata, AgentMentionReference } from '@/lib/agent-references';
import type { CalendarPlacement } from '@/lib/organic/calendar-generation';

// Canonical agent plan types live in @continuum/contracts; re-export so existing
// `from "./types"` import sites (PlanCard, ConceptPlan, ...) stay unchanged and
// the Frontend can never drift from the Backend plan shape.
export type {
  BulkContentPlan,
  PipelineStage,
  PlanEvidence,
  PlanItem,
  PlanItemStatus,
  PlanStatus,
} from '@continuum/contracts';

export type AgentJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ToolCallEvent = {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  // Derived from the tool envelope status on the Backend. ok:false marks a tool
  // that failed without throwing (returned an `error` envelope); `reason` is the
  // failure root cause so the tool chip can show why instead of a false success.
  ok?: boolean;
  reason?: string;
};

// Render shapes are owned by the contract (organicTrendChartDataSchema /
// organicPostCardDataSchema) — alias them so the Frontend can never drift from
// what the Backend emits.
export type UiTrendChart = OrganicTrendChartData;

export type UiPostCard = OrganicPostCardData;

export type UiAeoSnapshotCard = AeoSnapshotCard;

// PlanItem, PlanItemStatus, PlanEvidence, PlanStatus are re-exported from
// @continuum/contracts above. UiPlanCard is the canonical proposed-plan shape.
export type UiPlanCard = ProposedPlan;

export type PlanApprovalDecision =
  // clientKey collapses re-clicks to ONE job: it is the stable per-card identity
  // `${planId}:${itemId}`, threaded into the POST body so the Backend dedups a
  // double-dispatched item instead of over-creating jobs. `itemIds` is the group
  // approve: the kept cards in one action, enqueued in parallel on the Backend.
  | { decision: 'approve'; planId: string; itemId?: string; itemIds?: string[]; clientKey?: string }
  | { decision: 'edit'; planId: string; edits: PlanItem[] }
  | { decision: 'reject'; planId: string; reason?: string };

export type { UiFetchedPost } from '@continuum/contracts';

// Agent-proposed brand skill awaiting the user's confirm/edit/save (ui.skill_proposal).
export type SkillProposalCardData = {
  proposalId: string;
  brandId: string;
  name: string;
  kind: 'creative_direction';
  surface: 'copy' | 'visual' | 'both';
  description: string | null;
  directives: string;
  tags: string[];
};

export type UiCard =
  | { type: 'trend_chart'; data: UiTrendChart }
  | { type: 'plan_card'; data: UiPlanCard }
  | { type: 'bulk_plan_card'; data: BulkContentPlan }
  | { type: 'post_list'; data: UiFetchedPost[]; label?: string }
  | { type: 'skill_proposal'; data: SkillProposalCardData }
  | { type: 'aeo_snapshot'; data: UiAeoSnapshotCard }
  | { type: 'agent_delegated'; data: AgentDelegatedFrameData };

export type BulkRunStatus = 'running' | 'completed' | 'failed';

/**
 * Aggregate state for a background bulk generation run, derived by the
 * BulkRunPanel from the v2 run-event envelopes it polls. Keyed by runId
 * (deterministic `run_<planId>`).
 */
export type BulkRunState = {
  runId: string;
  planId: string;
  brandId: string;
  total: number;
  completed: number;
  failed: number;
  byPlatform: Record<string, number>;
  byFormat: Record<string, number>;
  status: BulkRunStatus;
};

export type AgentJobState = {
  jobId: string;
  brandId: string;
  platform?: string;
  scheduledAt?: string;
  trendId?: string | null;
  status: AgentJobStatus;
  stage?: string;
  agentName?: string;
  message?: string;
  // Live progress percent mirrored from the pipeline card so the JobGrid bar
  // reflects real advancement instead of an indeterminate pulse.
  pct?: number;
  error?: { code?: string; message: string };
  draftId?: string;
  placement?: CalendarPlacement;
  uiPostCard?: UiPostCard;
  // Signed 512px storyboard URLs from draft.blueprint_ready, keyed to this job's
  // draft so the completed job card can show a thumbnail. Never base64.
  previewImages?: string[];
  // AI SDK tool-call id of the agent tool that dispatched this job (e.g.
  // generatePosts), so the chat can group this job's card under the tool call.
  toolCallId?: string | null;
};

// Canonical ordering comes straight from the contract enum — no FE duplicate.
export const PIPELINE_STAGES: readonly PipelineStage[] = pipelineStageEnum.options;

export type PipelineStageNodeStatus = 'pending' | 'active' | 'done' | 'failed';

export type PipelineStageNode = {
  stage: PipelineStage;
  status: PipelineStageNodeStatus;
  agentName?: string;
};

export type PipelinePreview = {
  caption: string | null;
  imageUrl: string | null;
  images?: string[] | null;
  format: string | null;
};

export type PipelineQuality = {
  passed: boolean;
  overallScore: number;
  brandFitScore?: number;
  platformFitScore?: number;
  noveltyScore?: number;
  complianceScore?: number;
  summary?: string;
};

export type PipelineCardStatus = 'running' | 'completed' | 'failed' | 'cancelled';

// Three-step checkpoint state surfaced on pipeline cards and the
// GenerationsPopover rows. Derived from `ui.pipeline_card.data.checkpoint` and
// from the `draft.text_ready` frame.
export type CheckpointState = {
  textReady?: boolean;
  blueprintReady?: boolean;
  mediaStatus?: 'pending' | 'generating' | 'ready' | 'user_supplied' | 'skipped';
  awaitingMediaChoice?: boolean;
  previewRevision?: string;
};

export type PipelineCardState = {
  jobId: string;
  brandId?: string;
  planId?: string | null;
  planItemId?: string | null;
  // AI SDK tool-call id of the dispatching agent tool; when a tool.call node
  // with this id exists in the transcript, the card renders inline under it.
  toolCallId?: string | null;
  platform?: string;
  stages: PipelineStageNode[];
  currentStage?: PipelineStage;
  pct?: number;
  status: PipelineCardStatus;
  preview?: PipelinePreview;
  quality?: PipelineQuality | null;
  draftId?: string | null;
  error?: { code?: string; message: string };
  checkpoint?: CheckpointState;
};

export type ToolApproval = {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: AgentMentionMetadata;
  toolCalls?: ToolCallEvent[];
  uiCards?: UiCard[];
  mediaSearchResults?: MediaSearchResultsFrame[];
  // Set when a turn failed; the partial `content` (if any) is preserved so the
  // user keeps what streamed, and a styled error row + Retry can render below it.
  error?: string;
};

export type AgentChatInput = {
  brandId: string;
  sessionId: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: AgentMentionMetadata & { planApproval?: PlanApprovalDecision };
  }>;
  references?: AgentMentionReference[];
  approvals?: Array<{ id: string; approved: boolean; reason?: string }>;
  weekStart?: string;
  timezone?: string;
  platformAccountIds?: Record<string, string>;
  // Composer attachments, already uploaded and signed. The backend folds them into the same image
  // path as @-mentioned library media.
  images?: AgentAttachment[];
};
