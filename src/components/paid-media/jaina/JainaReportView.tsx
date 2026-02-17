"use client";

import React from "react";
import { Badge, Callout, Flex, Heading } from "@radix-ui/themes";
import { DownloadIcon, EnvelopeClosedIcon } from "@radix-ui/react-icons";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import type { SoTReport } from "@/lib/jaina/schemas";
import type { JainaStreamStatus } from "@/lib/jaina/stream";
import { JainaReportNav } from "./components/JainaReportNav";
import { JainaReportMetrics } from "./components/JainaReportMetrics";
import { JainaReportCharts } from "./components/JainaReportCharts";
import { JainaReportSections } from "./components/JainaReportSections";
import { JainaReportRecommendations } from "./components/JainaReportRecommendations";
import { JainaReportTables } from "./components/JainaReportTables";
import { Artifact, ArtifactActions, ArtifactContent, ArtifactHeader, ArtifactTitle, ArtifactAction } from "@/components/ai-elements/artifact";
import { useToast } from "@/components/ui/ToastProvider";
import { Card, Box, Text } from "@radix-ui/themes";
import { Sources, SourcesContent, SourcesTrigger, Source } from "@/components/ai-elements/sources";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { hasReportContent } from "@/lib/jaina/schemas";
import { buildJitSnapshotFallbackTables } from "./reportTableUtils";

type JainaReportViewProps = {
  report: SoTReport | null;
  status: JainaStreamStatus;
  error?: string;
  onSuggestionClick?: (query: string) => void;
  idPrefix?: string;
};

export function JainaReportView({
  report,
  status,
  error,
  onSuggestionClick,
  idPrefix,
}: JainaReportViewProps) {
  const { show } = useToast();

  if (status === "error") {
    return (
      <Callout.Root color="red" variant="surface">
        <Callout.Text>{error ?? "Unable to render report."}</Callout.Text>
      </Callout.Root>
    );
  }

  if (!report || !hasReportContent(report)) {
    return <EmptyReport status={status} />;
  }

  const resolvedIdPrefix = React.useMemo(
    () => (idPrefix && idPrefix.trim() ? idPrefix : "jaina-report"),
    [idPrefix]
  );
  const sectionId = React.useCallback(
    (suffix: string) => `${resolvedIdPrefix}-${suffix}`,
    [resolvedIdPrefix]
  );
  const fallbackTables = buildJitSnapshotFallbackTables(report);
  const hasSectionGraphs = report.sections.some(
    (section) => Array.isArray(section.graphs) && section.graphs.length > 0
  );

  const handleDownloadJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jaina-report-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendEmail = () => {
    show({
      title: "Coming Soon",
      description: "Email reports are currently in development.",
      variant: "info",
    });
  };

  return (
    <Artifact className="border-white/10 bg-black/20 backdrop-blur-xl shadow-2xl h-[calc(100vh-120px)] flex flex-col">
      <ArtifactHeader className="bg-white/5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-2 rounded-full bg-purple-500 animate-pulse" />
          <ArtifactTitle className="text-primary font-bold tracking-tight uppercase text-xs">
            Performance Analysis Report
          </ArtifactTitle>
        </div>
        <ArtifactActions>
          <ArtifactAction
            tooltip="Send to Email"
            icon={EnvelopeClosedIcon as any}
            onClick={handleSendEmail}
          />
          <ArtifactAction
            tooltip="Download JSON"
            icon={DownloadIcon as any}
            onClick={handleDownloadJSON}
          />
        </ArtifactActions>
      </ArtifactHeader>

      <ArtifactContent className="p-0 flex-1 min-h-0 relative">
        <Flex gap="0" align="start" className="relative h-full">
          <div className="hidden lg:block border-r border-white/5 p-4 sticky top-0 shrink-0 w-64 h-full overflow-y-auto">
            <JainaReportNav idPrefix={resolvedIdPrefix} />
          </div>

          <Flex direction="column" gap="6" className="flex-1 p-6 overflow-y-auto no-scrollbar h-full">
            <div id={sectionId("executive-summary")} className="space-y-4 scroll-mt-20">
              <Flex align="center" justify="between">
                <Heading size="5" className="text-primary">Executive Summary</Heading>
                <Badge color="blue" variant="soft" className="uppercase tracking-tighter text-[10px]">
                  {report.language || "EN"}
                </Badge>
              </Flex>

              {report.reasoning_trace && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <Text size="2" color="gray" className="uppercase tracking-wider mb-2">Analysis Context</Text>
                  <Text size="2" className="text-white/80 leading-relaxed">
                    {report.reasoning_trace}
                  </Text>
                </div>
              )}

              <div className="prose prose-invert max-w-none">
                <SafeMarkdown
                  content={report.executive_summary || "No summary provided."}
                  className="text-[15px] leading-relaxed text-secondary"
                  mode="static"
                />
              </div>
            </div>

            {report.performance_snapshot.length > 0 && (
              <div id={sectionId("performance-snapshot")} className="scroll-mt-20">
                <JainaReportMetrics metrics={report.performance_snapshot} />
              </div>
            )}

            {report.sections.length > 0 && (
              <div id={sectionId("strategic-insights")} className="scroll-mt-20">
                <JainaReportSections sections={report.sections} />
              </div>
            )}

            {report.graphs.length > 0 && !hasSectionGraphs && (
              <div id={sectionId("key-trends")} className="scroll-mt-20">
                <JainaReportCharts charts={report.graphs} />
              </div>
            )}

            {fallbackTables.length > 0 && (
              <div id={sectionId("data-tables")} className="scroll-mt-20">
                <JainaReportTables tables={fallbackTables} />
              </div>
            )}

            {report.strategic_recommendations.length > 0 && (
              <div id={sectionId("recommendations")} className="scroll-mt-20">
                <JainaReportRecommendations recommendations={report.strategic_recommendations} />
              </div>
            )}

            {report.follow_up_questions.length > 0 && (
              <div id={sectionId("follow-up-questions")} className="space-y-4 pt-6 border-t border-white/5 scroll-mt-20">
                <Heading size="4" className="text-primary/80">Continue Exploration</Heading>
                <Suggestions>
                  {report.follow_up_questions.map((question, index) => (
                    <Suggestion
                      key={`${question}-${index}`}
                      suggestion={question}
                      onClick={onSuggestionClick}
                      className="bg-white/5 hover:bg-white/10 border-white/10 text-secondary whitespace-normal h-auto text-left py-2"
                    />
                  ))}
                </Suggestions>
              </div>
            )}

            {report.cached_sources.length > 0 && (
              <div id="cached-sources" className="pt-6 border-t border-white/5 scroll-mt-20">
                <Sources>
                  <SourcesTrigger count={report.cached_sources.length} />
                  <SourcesContent>
                    {report.cached_sources.map((source) => (
                      <Source key={source} title={source} href="#" />
                    ))}
                  </SourcesContent>
                </Sources>
              </div>
            )}
          </Flex>
        </Flex>
      </ArtifactContent>
    </Artifact>
  );
}

function EmptyReport({ status }: { status: JainaStreamStatus }) {
  return (
    <Card className="border border-subtle bg-surface">
      <Box p="4" className="space-y-2">
        <Heading size="4">Report Output</Heading>
        <Text color="gray">
          {status === "streaming"
            ? "Streaming data… this panel will populate as soon as the report is ready."
            : "Submit a question to generate a report."}
        </Text>
      </Box>
    </Card>
  );
}
