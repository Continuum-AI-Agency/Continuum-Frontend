import type {
  ToolCallEventData,
  ToolResultEventData,
  ProgressEventData,
  ReportPayload,
  PlanStep,
  ArtifactDeltaEventData,
  ReportAssembly,
  JainaObjective,
  CheckpointReportV2,
} from "@/lib/jaina/schemas";
import type { PlanStatus } from "@/components/ai-elements/plan";
import type { AgentMentionMetadata } from "@/lib/agent-references";

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
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status?: "streaming" | "done" | "error";
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
  metadata?: AgentMentionMetadata;
};
