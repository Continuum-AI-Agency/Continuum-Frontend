import type {
  AgentDelegatedFrameData,
  JainaToolApprovalRequiredPayload,
  JainaToolApprovalResolvedPayload,
} from '@continuum/contracts';
import type { PlanStatus } from '@/components/ai-elements/plan';
import type { AgentMentionMetadata } from '@/lib/agent-references';
import type {
  ArtifactDeltaEventData,
  CheckpointReportV2,
  JainaObjective,
  PlanStep,
  ProgressEventData,
  ReportAssembly,
  ReportPayload,
  ToolCallEventData,
  ToolResultEventData,
} from '@/lib/jaina/schemas';
import type { JainaScaffoldState } from '@/lib/jaina/stream';

export type JainaProgressEntry = {
  stage: string;
  at: string;
  detail?: string;
  data: ProgressEventData;
};

export type JainaPlan = {
  id: string;
  title: string;
  description: string;
  status: PlanStatus;
  steps: PlanStep[];
};

export type JainaChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  status?: 'streaming' | 'done' | 'error';
  title?: string;
  finalThought?: string;
  renderAsReport?: boolean;
  reasoning?: JainaProgressEntry[];
  toolCalls?: ToolCallEventData[];
  toolResults?: ToolResultEventData[];
  report?: ReportPayload;
  reportV2?: CheckpointReportV2;
  reportAssembly?: ReportAssembly;
  reportAssemblyHtml?: string;
  plan?: JainaPlan;
  artifacts?: ArtifactDeltaEventData;
  pendingClarification?: {
    id?: string;
    question: string;
  };
  objectives?: JainaObjective[];
  /** Cross-agent calls made during this turn, latest state per callId. */
  delegations?: AgentDelegatedFrameData[];
  /**
   * The scaffold this turn proposed, kept so the card does not blink out when the
   * stream state resets at the end of the turn. `progressByNode` is deliberately NOT
   * carried: it is a transient overlay on database truth, and persisting a 200-key
   * map into every assistant message would inflate the conversation for nothing.
   */
  scaffold?: JainaScaffoldState;
  pendingToolApprovals?: JainaToolApprovalRequiredPayload[];
  resolvedApprovals?: Record<string, JainaToolApprovalResolvedPayload>;
  metadata?: AgentMentionMetadata;
};
