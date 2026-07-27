import type { AgentDelegatedFrameData } from '@continuum/contracts';
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
  metadata?: AgentMentionMetadata;
};
