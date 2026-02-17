import type { ToolCallEventData, ToolResultEventData, ProgressEventData, ReportPayload, PlanStep, ArtifactDeltaEventData } from "@/lib/jaina/schemas";
import type { PlanStatus } from "@/components/ai-elements/plan";

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
  plan?: JainaPlan;
  artifacts?: ArtifactDeltaEventData;
};
