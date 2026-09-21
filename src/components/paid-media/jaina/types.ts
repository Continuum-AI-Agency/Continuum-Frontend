import type {
  AgentDelegatedFrameData,
  JainaOptimizerCard,
  JainaPaidCreativeRenderPayload,
  JainaToolApprovalRequiredPayload,
  JainaToolApprovalResolvedPayload,
  JainaToolOutputDeniedPayload,
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
  ResponseReportArtifactJobStartedEventData,
  ToolCallEventData,
  ToolResultEventData,
} from '@/lib/jaina/schemas';
import type { JainaScaffoldState } from '@/lib/jaina/scaffoldTypes';

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
  runId?: string;
  deliverySource?: 'live_render' | 'hydration_replay';
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
  paidCreativeRenders?: JainaPaidCreativeRenderPayload[];
  /**
   * Optimizer cards this turn CITED — ids only. The figures are resolved from the stored read
   * the citation names at render time, never carried here, so a persisted transcript cannot
   * quietly become a snapshot of numbers nobody can trace.
   */
  optimizerCitations?: JainaOptimizerCard[];
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
  /** Gated tools that did NOT run. Lives on the message so a reload still shows the refusal. */
  deniedToolOutputs?: JainaToolOutputDeniedPayload[];
  /** The report-export job this turn kicked off; the surface polls it to offer the file. */
  reportArtifactJob?: ResponseReportArtifactJobStartedEventData;
  /**
   * The checkpoint summary and where it came from. Decides the error/fallback prose a reader
   * sees, which is why it survives the `state.delta` array this migration drops.
   */
  checkpointSummary?: {
    summary: string;
    source: 'synthesis' | 'tool_fallback' | 'default_unavailable';
  };
  metadata?: AgentMentionMetadata;
};
