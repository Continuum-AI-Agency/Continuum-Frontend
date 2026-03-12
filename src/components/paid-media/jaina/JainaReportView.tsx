"use client";

import React from "react";
import { Badge, Callout, Flex, Heading } from "@radix-ui/themes";
import { DownloadIcon, MailIcon } from "lucide-react";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import {
  deriveLegacyFieldsFromBlocks,
  type FrontendCheckpointReport,
  hasReportContent,
} from "@/lib/jaina/schemas";
import { type JainaStreamStatus } from "@/lib/jaina/stream";
import { JainaReportNav } from "./components/JainaReportNav";
import { JainaReportMetrics } from "./components/JainaReportMetrics";
import { JainaReportCharts, isJainaChartInput } from "./components/JainaReportCharts";
import { JainaReportSections } from "./components/JainaReportSections";
import { JainaReportRecommendations } from "./components/JainaReportRecommendations";
import { JainaReportTables } from "./components/JainaReportTables";
import { Artifact, ArtifactActions, ArtifactContent, ArtifactHeader, ArtifactTitle, ArtifactAction } from "@/components/ai-elements/artifact";
import { useToast } from "@/components/ui/ToastProvider";
import { Card, Box, Text } from "@radix-ui/themes";
import { Sources, SourcesContent, SourcesTrigger, Source } from "@/components/ai-elements/sources";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { buildJitSnapshotFallbackTables } from "./reportTableUtils";
import { downloadJainaReportPdf } from "./reportExport";
import { cn } from "@/lib/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

type JainaReportViewProps = {
  report: FrontendCheckpointReport | null;
  status: JainaStreamStatus;
  error?: string;
  onSuggestionClick?: (query: string) => void;
  idPrefix?: string;
};

const MIN_REPORT_HEIGHT_PX = 320;

export function clampReportHeight(nextHeight: number, maxHeight: number): number {
  if (!Number.isFinite(nextHeight)) return MIN_REPORT_HEIGHT_PX;
  return Math.min(Math.max(nextHeight, MIN_REPORT_HEIGHT_PX), Math.max(maxHeight, MIN_REPORT_HEIGHT_PX));
}

export function JainaReportView({
  report,
  status,
  error,
  onSuggestionClick,
  idPrefix,
}: JainaReportViewProps) {
  const { show } = useToast();
  const reportExportRef = React.useRef<HTMLDivElement | null>(null);
  const reportFrameRef = React.useRef<HTMLDivElement | null>(null);
  const [maxAutoHeightPx, setMaxAutoHeightPx] = React.useState<number>(900);
  const [showSidebarNav, setShowSidebarNav] = React.useState<boolean>(false);

  const resolvedIdPrefix = React.useMemo(
    () => (idPrefix && idPrefix.trim() ? idPrefix : "jaina-report"),
    [idPrefix]
  );
  const sectionId = React.useCallback(
    (suffix: string) => `${resolvedIdPrefix}-${suffix}`,
    [resolvedIdPrefix]
  );
  const blockDerivedFields = React.useMemo(
    () => (report ? deriveLegacyFieldsFromBlocks(report.blocks) : null),
    [report]
  );
  const displayPerformanceSnapshot = React.useMemo(
    () =>
      report
        ? blockDerivedFields && blockDerivedFields.performance_snapshot.length > 0
          ? blockDerivedFields.performance_snapshot
          : report.performance_snapshot
        : [],
    [blockDerivedFields, report]
  );
  const displaySections = React.useMemo(
    () =>
      report
        ? blockDerivedFields && blockDerivedFields.sections.length > 0
          ? blockDerivedFields.sections
          : report.sections
        : [],
    [blockDerivedFields, report]
  );
  const displayRecommendations = React.useMemo(
    () =>
      report
        ? blockDerivedFields && blockDerivedFields.strategic_recommendations.length > 0
          ? blockDerivedFields.strategic_recommendations
          : report.strategic_recommendations
        : [],
    [blockDerivedFields, report]
  );
  const displayFollowUpQuestions = React.useMemo(
    () =>
      report
        ? blockDerivedFields && blockDerivedFields.follow_up_questions.length > 0
          ? blockDerivedFields.follow_up_questions
          : report.follow_up_questions
        : [],
    [blockDerivedFields, report]
  );
  const displayGraphs = React.useMemo(
    () =>
      report
        ? blockDerivedFields && blockDerivedFields.graphs.length > 0
          ? blockDerivedFields.graphs
          : report.graphs
        : [],
    [blockDerivedFields, report]
  );
  const displayCachedSources = React.useMemo(() => {
    if (!report) return [];
    const combined = [
      ...report.cached_sources,
      ...(blockDerivedFields?.cached_sources ?? []),
    ];
    return Array.from(new Set(combined.filter((source) => source.trim().length > 0)));
  }, [blockDerivedFields?.cached_sources, report]);
  const reportForDisplay = React.useMemo(() => {
    if (!report) return null;
    return {
      ...report,
      performance_snapshot: displayPerformanceSnapshot,
      sections: displaySections,
      strategic_recommendations: displayRecommendations,
      follow_up_questions: displayFollowUpQuestions,
      graphs: displayGraphs,
      cached_sources: displayCachedSources,
    };
  }, [
    displayCachedSources,
    displayFollowUpQuestions,
    displayGraphs,
    displayPerformanceSnapshot,
    displayRecommendations,
    displaySections,
    report,
  ]);
  const fallbackTables = React.useMemo(
    () => (reportForDisplay ? buildJitSnapshotFallbackTables(reportForDisplay) : []),
    [reportForDisplay]
  );
  const topLevelCharts = React.useMemo(
    () => displayGraphs.filter((chart) => isJainaChartInput(chart)),
    [displayGraphs]
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const frame = reportFrameRef.current;
    if (!frame) return;

    const computeAvailableHeight = () => {
      const rect = frame.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const reservedBottom = 20;
      const available = Math.floor(viewportHeight - rect.top - reservedBottom);
      const nextMax = Math.max(MIN_REPORT_HEIGHT_PX, available);
      setMaxAutoHeightPx((prev) => (prev === nextMax ? prev : nextMax));
    };

    computeAvailableHeight();
    window.addEventListener("resize", computeAvailableHeight);

    const conversationViewport = frame.closest(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement | null;
    conversationViewport?.addEventListener("scroll", computeAvailableHeight, {
      passive: true,
    });

    return () => {
      window.removeEventListener("resize", computeAvailableHeight);
      conversationViewport?.removeEventListener("scroll", computeAvailableHeight);
    };
  }, []);

  React.useEffect(() => {
    const frame = reportFrameRef.current;
    if (!frame) return;

    const updateLayoutMode = () => {
      const width = frame.clientWidth;
      setShowSidebarNav(width >= 980);
    };

    updateLayoutMode();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateLayoutMode);
      return () => window.removeEventListener("resize", updateLayoutMode);
    }

    const observer = new ResizeObserver(() => updateLayoutMode());
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

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

  const handleDownloadPDF = React.useCallback(async () => {
    if (!reportForDisplay) return;
    try {
      await downloadJainaReportPdf({
        report: reportForDisplay,
        fallbackTables,
        exportNode: reportExportRef.current,
      });
    } catch {
      show({
        title: "Export failed",
        description: "Unable to generate PDF report right now.",
        variant: "error",
      });
    }
  }, [fallbackTables, reportForDisplay, show]);

  const handleSendEmail = () => {
    show({
      title: "Coming Soon",
      description: "Email reports are currently in development.",
      variant: "info",
    });
  };

  const reportFrameHeightPx = Math.max(
    MIN_REPORT_HEIGHT_PX,
    Math.min(maxAutoHeightPx, 760)
  );
  const minReportPanelPercent = Math.min(
    95,
    Math.max(35, (MIN_REPORT_HEIGHT_PX / reportFrameHeightPx) * 100)
  );

  return (
    <div
      ref={reportFrameRef}
      className="w-full min-h-0 min-w-0 overflow-hidden"
      style={{
        height: `${reportFrameHeightPx}px`,
        maxHeight: `${maxAutoHeightPx}px`,
      }}
    >
      <ResizablePanelGroup orientation="vertical" className="h-full w-full min-h-0">
      <ResizablePanel
        defaultSize="84%"
        minSize={`${Math.round(minReportPanelPercent)}%`}
      >
      <Artifact className="h-full max-h-full min-w-0 border-white/10 bg-black/20 backdrop-blur-xl shadow-2xl flex flex-col">
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
            icon={MailIcon}
            onClick={handleSendEmail}
          />
          <ArtifactAction
            tooltip="Download PDF"
            icon={DownloadIcon}
            onClick={handleDownloadPDF}
          />
        </ArtifactActions>
      </ArtifactHeader>

      <ArtifactContent className="p-0 flex-1 min-h-0 min-w-0 overflow-hidden relative">
        <Flex gap="0" align="start" className="relative h-full min-h-0 min-w-0">
          {showSidebarNav ? (
          <div className="border-r border-white/5 p-4 sticky top-0 shrink-0 w-64 max-h-full min-h-0 overflow-y-auto">
            <JainaReportNav idPrefix={resolvedIdPrefix} report={reportForDisplay} />
          </div>
          ) : null}

          <Flex
            direction="column"
            gap="6"
            className={cn(
              "flex-1 min-h-0 min-w-0 overflow-y-auto no-scrollbar h-full",
              showSidebarNav ? "p-6" : "p-4 sm:p-6"
            )}
          >
            <div ref={reportExportRef} className="space-y-6">
              <div id={sectionId("executive-summary")} className="space-y-4 scroll-mt-20">
                <Flex align="center" justify="between">
                  <Heading size="5" className="text-primary">
                    Executive Summary
                  </Heading>
                  <Badge
                    color="blue"
                    variant="soft"
                    className="uppercase tracking-tighter text-[10px]"
                  >
                    {report.language || "EN"}
                  </Badge>
                </Flex>

                <div className="prose prose-invert max-w-none">
                  <SafeMarkdown
                    content={report.executive_summary || "No summary provided."}
                    className="text-[15px] leading-relaxed text-secondary"
                    mode={status === "streaming" ? "streaming" : "static"}
                  />
                </div>
              </div>

              {displayPerformanceSnapshot.length > 0 && (
                <div id={sectionId("performance-snapshot")} className="scroll-mt-20">
                  <JainaReportMetrics metrics={displayPerformanceSnapshot} />
                </div>
              )}

              {displaySections.length > 0 && (
                <div id={sectionId("strategic-insights")} className="scroll-mt-20">
                  <JainaReportSections 
                    sections={displaySections}
                    isStreaming={status === "streaming"} 
                  />
                </div>
              )}

              {topLevelCharts.length > 0 && (
                <div id={sectionId("key-trends")} className="scroll-mt-20">
                  <JainaReportCharts charts={topLevelCharts} />
                </div>
              )}

              {fallbackTables.length > 0 && (
                <div id={sectionId("data-tables")} className="scroll-mt-20">
                  <JainaReportTables tables={fallbackTables} />
                </div>
              )}

              {displayRecommendations.length > 0 && (
                <div id={sectionId("recommendations")} className="scroll-mt-20">
                  <JainaReportRecommendations 
                    recommendations={displayRecommendations}
                    isStreaming={status === "streaming"}
                  />
                </div>
              )}

              {displayFollowUpQuestions.length > 0 && (
                <div
                  id={sectionId("follow-up-questions")}
                  className="space-y-4 pt-6 border-t border-white/5 scroll-mt-20"
                >
                  <Heading size="4" className="text-primary/80">
                    Continue Exploration
                  </Heading>
                  <Suggestions>
                    {displayFollowUpQuestions.map((question, index) => (
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

              {displayCachedSources.length > 0 && (
                <div id="cached-sources" className="pt-6 border-t border-white/5 scroll-mt-20">
                  <Sources>
                    <SourcesTrigger count={displayCachedSources.length} />
                    <SourcesContent>
                      {displayCachedSources.map((source) => (
                        <Source key={source} title={source} href="#" />
                      ))}
                    </SourcesContent>
                  </Sources>
                </div>
              )}
            </div>
          </Flex>
        </Flex>
      </ArtifactContent>
      </Artifact>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        className="bg-white/10 hover:bg-primary/40 transition-colors h-1 cursor-row-resize [&>div]:h-1.5 [&>div]:w-8 [&>div]:rounded-full"
      />
      <ResizablePanel
        defaultSize="16%"
        minSize="0%"
        collapsible
        collapsedSize="0%"
        className="min-h-0"
      >
        <div className="h-full w-full bg-transparent" />
      </ResizablePanel>
      </ResizablePanelGroup>
    </div>
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
            : status === "starting"
              ? "Initializing Jaina analyst..."
              : "Submit a question to generate a report."}
        </Text>
      </Box>
    </Card>
  );
}
