"use client";

import * as React from "react";
import { Badge, Button, Heading, Text } from "@radix-ui/themes";
import { DownloadIcon } from "lucide-react";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import { useToast } from "@/components/ui/ToastProvider";
import {
  type FrontendCheckpointReport,
  hasReportContent,
} from "@/lib/jaina/schemas";
import { buildJitSnapshotFallbackTables } from "../reportTableUtils";
import { downloadJainaReportPdf } from "../reportExport";
import { JainaReportCharts, isJainaChartInput } from "./JainaReportCharts";
import { JainaReportMetrics } from "./JainaReportMetrics";
import { JainaReportRecommendations } from "./JainaReportRecommendations";
import { JainaReportSections } from "./JainaReportSections";
import { JainaReportTables } from "./JainaReportTables";

type JainaInlineReportProps = {
  report: FrontendCheckpointReport | null;
  isStreaming: boolean;
  onSuggestionClick?: (query: string) => void;
};

export function JainaInlineReport({
  report,
  isStreaming,
  onSuggestionClick,
}: JainaInlineReportProps) {
  const { show } = useToast();
  const fallbackTables = React.useMemo(
    () => (report ? buildJitSnapshotFallbackTables(report) : []),
    [report]
  );

  const topLevelCharts = React.useMemo(
    () => (report ? report.graphs.filter((chart) => isJainaChartInput(chart)) : []),
    [report]
  );

  const effectiveRecommendations = React.useMemo(() => {
    if (!report) return [];
    if (report.strategic_recommendations.length > 0) {
      return report.strategic_recommendations;
    }
    return report.sections.flatMap((section) => section.actions);
  }, [report]);

  const handleDownload = React.useCallback(async () => {
    if (!report) return;
    try {
      await downloadJainaReportPdf({
        report,
        fallbackTables,
      });
    } catch {
      show({
        title: "Export failed",
        description: "Unable to generate PDF report right now.",
        variant: "error",
      });
    }
  }, [fallbackTables, report, show]);

  if (!report || !hasReportContent(report)) return null;

  const blockLabel = (category: string): string => {
    if (category === "summary_breakdown") return "Summary";
    if (category === "insight_recommendation") return "Insight";
    if (category === "data") return "Data";
    if (category === "graph") return "Graph";
    return category;
  };

  return (
    <section className="mt-6 space-y-6 border-t border-border/60 pt-6">
      <header className="flex items-center justify-between gap-3">
        <Heading size="4" className="tracking-tight">
          {report.report_title || "Checkpoint Analysis"}
        </Heading>
        <div className="flex items-center gap-2">
          <Badge variant="soft" color="indigo" className="uppercase text-[10px] tracking-wide">
            {report.language || "EN"}
          </Badge>
          <Button
            type="button"
            size="1"
            variant="soft"
            color="gray"
            onClick={() => void handleDownload()}
            disabled={isStreaming}
            aria-label="Download report as PDF"
          >
            <DownloadIcon className="size-3.5" />
            Download
          </Button>
        </div>
      </header>

      {report.executive_summary ? (
        <div className="space-y-2">
          <Text size="2" weight="medium" className="text-foreground/85">
            Executive Summary
          </Text>
          <SafeMarkdown
            content={report.executive_summary}
            className="text-[14px] leading-6 text-muted-foreground"
            mode={isStreaming ? "streaming" : "static"}
          />
        </div>
      ) : null}

      {report.blocks.length > 0 ? (
        <div className="space-y-2">
          <Text size="2" weight="medium" className="text-foreground/85">
            Checkpoint Blocks
          </Text>
          <div className="space-y-2">
            {report.blocks.map((block) => (
              <div
                key={block.block_id}
                className="rounded-lg border border-border/60 bg-background/60 px-3 py-2"
              >
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {blockLabel(block.category)}
                  </Badge>
                  <Badge variant="soft" color="gray" className="text-[10px]">
                    {block.scope}
                  </Badge>
                </div>
                <Text size="2" weight="medium" className="block">
                  {block.title}
                </Text>
                <Text size="1" className="text-muted-foreground">
                  {block.summary}
                </Text>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <JainaReportMetrics metrics={report.performance_snapshot} />
      <JainaReportSections sections={report.sections} isStreaming={isStreaming} />
      <JainaReportCharts charts={topLevelCharts} />
      <JainaReportTables tables={fallbackTables} />
      <JainaReportRecommendations
        recommendations={effectiveRecommendations}
        isStreaming={isStreaming}
      />

      {report.follow_up_questions.length > 0 ? (
        <div className="space-y-2 pt-2">
          <Text size="2" weight="medium" className="text-foreground/85">
            Follow-up
          </Text>
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
    </section>
  );
}
