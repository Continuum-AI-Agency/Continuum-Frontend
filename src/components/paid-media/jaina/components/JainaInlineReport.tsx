"use client";

import * as React from "react";
import { Badge, Heading, Text } from "@radix-ui/themes";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import {
  type FrontendCheckpointReport,
  hasReportContent,
} from "@/lib/jaina/schemas";
import { buildJitSnapshotFallbackTables } from "../reportTableUtils";
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

  if (!report || !hasReportContent(report)) return null;

  return (
    <section className="mt-6 space-y-6 border-t border-border/60 pt-6">
      <header className="flex items-center justify-between gap-3">
        <Heading size="4" className="tracking-tight">
          {report.report_title || "Checkpoint Analysis"}
        </Heading>
        <Badge variant="soft" color="indigo" className="uppercase text-[10px] tracking-wide">
          {report.language || "EN"}
        </Badge>
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
