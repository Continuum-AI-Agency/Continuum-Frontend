"use client";

import { useCallback, useMemo, useRef } from "react";
import { Button, Text } from "@radix-ui/themes";
import { FileDownIcon } from "lucide-react";
import type { CheckpointReportV2, ExecutionObjective } from "@/lib/jaina/schemas";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/utils";
import { downloadJainaReportV2Pdf } from "../reportExport";
import { BlockRenderer } from "../blocks/BlockRenderer";
import { MediaMapProvider } from "../blocks/mediaText";

const OBJECTIVE_STATUS_STYLE: Record<ExecutionObjective["status"], string> = {
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  blocked: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  deferred: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  partial: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  pending: "bg-muted text-muted-foreground",
};

// Supplementary report context (reasoning, objectives, sources). These ride along
// in every persisted report but were previously dropped at the schema; surfacing
// them keeps a thin/degraded report from looking empty.
function ReportSupplementaryDetails({ report }: { report: CheckpointReportV2 }) {
  const objectives = report.execution_objectives;
  const sources = report.cached_sources;
  const reasoning = report.reasoning_trace.trim();

  if (objectives.length === 0 && sources.length === 0 && reasoning.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 border-t border-border/40 pt-3">
      {objectives.length > 0 ? (
        <details className="group rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
            Execution objectives ({objectives.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {objectives.map((objective) => (
              <li key={objective.id} className="flex items-start gap-2 text-xs">
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-2xs font-medium capitalize",
                    OBJECTIVE_STATUS_STYLE[objective.status],
                  )}
                >
                  {objective.status.replace("_", " ")}
                </span>
                <span className="min-w-0 flex-1 leading-snug text-muted-foreground">
                  {objective.title}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {reasoning.length > 0 ? (
        <details className="group rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
            Analysis
          </summary>
          <SafeMarkdown
            content={reasoning}
            className="mt-2 text-xs leading-relaxed text-muted-foreground/80"
            mode="static"
          />
        </details>
      ) : null}

      {sources.length > 0 ? (
        <div className="text-xs text-muted-foreground/70">
          <span className="font-medium">Sources:</span> {sources.join(", ")}
        </div>
      ) : null}
    </div>
  );
}

type JainaReportV2Props = {
  report: CheckpointReportV2;
  isStreaming: boolean;
  onSuggestionClick?: (query: string) => void;
};

export function JainaReportV2({
  report,
  isStreaming,
  onSuggestionClick,
}: JainaReportV2Props) {
  const { show } = useToast();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const sortedBlocks = useMemo(
    () => [...report.blocks].sort((a, b) => a.priority - b.priority),
    [report.blocks],
  );

  const hasMedia = report._meta.has_media && Object.keys(report.media_map).length > 0;
  // Export the LIVE rendered report (real Recharts charts) as a theme-matched
  // PDF — the front-end is the single source of rendering truth.
  const handlePdfExport = useCallback(async () => {
    try {
      await downloadJainaReportV2Pdf({ exportNode: reportRef.current });
    } catch {
      show({
        title: "Export failed",
        description: "Unable to generate the report PDF right now.",
        variant: "error",
      });
    }
  }, [show]);

  const content = (
    <section className="mt-4 space-y-4">
      <div ref={reportRef} className="space-y-4">
        {report.executive_summary ? (
          <SafeMarkdown
            content={report.executive_summary}
            className="text-sm leading-relaxed text-muted-foreground"
            mode={isStreaming ? "streaming" : "static"}
          />
        ) : null}

        {sortedBlocks.map((block) => (
          <BlockRenderer
            key={block.block_id}
            block={block}
            isStreaming={isStreaming}
          />
        ))}

        {!isStreaming ? <ReportSupplementaryDetails report={report} /> : null}
      </div>

      {report.follow_up_questions.length > 0 ? (
        <div className="space-y-2 pt-2">
          <Suggestions className="pb-1">
            {report.follow_up_questions.map((question, index) => (
              <Suggestion
                key={`${question}-${index}`}
                suggestion={question}
                onClick={onSuggestionClick}
              />
            ))}
          </Suggestions>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <Text size="1" className="text-muted-foreground">
          Export a PDF of this report exactly as shown.
        </Text>
        <Button
          type="button"
          size="1"
          variant="surface"
          color="gray"
          onClick={handlePdfExport}
          disabled={isStreaming}
          aria-label="Export report as PDF"
        >
          <FileDownIcon className="size-3.5" />
          Export PDF
        </Button>
      </footer>
    </section>
  );

  if (!hasMedia) return content;

  return (
    <MediaMapProvider mediaMap={report.media_map}>
      {content}
    </MediaMapProvider>
  );
}
