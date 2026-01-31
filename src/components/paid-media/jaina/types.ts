import type { ToolCallEventData, ToolResultEventData, ProgressEventData, SoTReport } from "@/lib/jaina/schemas";

export type JainaProgressEntry = {
  stage: string;
  at: string;
  detail?: string;
  data: ProgressEventData;
};

export type JainaChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status?: "streaming" | "done" | "error";
  title?: string;
  reasoning?: JainaProgressEntry[];
  toolCalls?: ToolCallEventData[];
  toolResults?: ToolResultEventData[];
  report?: SoTReport;
};
