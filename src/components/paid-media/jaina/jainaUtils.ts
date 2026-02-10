import type { ReportPayload } from "@/lib/jaina/schemas";
import type { JainaChatMessage } from "./types";

const reportSignalKeys = [
  "render_as",
  "renderAs",
  "render_mode",
  "render_as_report",
  "renderAsReport",
  "output_format",
  "report_view",
];

const isReportSignalValue = (value: unknown) => {
  if (value === true) return true;
  if (typeof value === "string") {
    return value.toLowerCase() === "report";
  }
  return false;
};

const hasReportSignal = (record: Record<string, unknown>) =>
  reportSignalKeys.some((key) => isReportSignalValue(record[key]));

export const resolveReportSignal = (
  progress: JainaChatMessage["reasoning"] = [],
  deltas: Array<{ delta: Record<string, unknown> }> = []
) => {
  for (const entry of deltas) {
    if (hasReportSignal(entry.delta)) return true;
  }
  for (const entry of progress) {
    const data = (entry?.data ?? {}) as Record<string, unknown>;
    if (hasReportSignal(data)) return true;
  }
  return false;
};

export const getFinalThought = (
  progress: JainaChatMessage["reasoning"] = []
) => {
  for (let i = progress.length - 1; i >= 0; i -= 1) {
    const entry = progress[i];
    if (entry?.stage === "thinking" && typeof entry.detail === "string") {
      const trimmed = entry.detail.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
};

export const getReportSummary = (report: ReportPayload | null) => {
  if (!report) return "";
  if ("type" in report && report.type === "direct_answer") {
    return report.content;
  }
  return report.executive_summary ?? (report as { summary?: string }).summary ?? "";
};

export const formatStageLabel = (stage: string) => {
  if (stage === "router" || stage === "routing") {
    return "Consulting the Council";
  }
  if (stage === "thinking") {
    return "Thinking";
  }
  return stage.replace(/_/g, " ");
};

export const formatToolLabel = (toolName: string) =>
  toolName === "router"
    ? "Consulting the Council"
    : toolName.replace(/_/g, " ");
