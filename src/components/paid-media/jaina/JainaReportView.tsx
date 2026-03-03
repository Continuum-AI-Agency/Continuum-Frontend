"use client";

import React from "react";
import { Badge, Callout, Flex, Heading } from "@radix-ui/themes";
import { DownloadIcon, MailIcon } from "lucide-react";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { type FrontendCheckpointReport, hasReportContent } from "@/lib/jaina/schemas";
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
  const fallbackTables = React.useMemo(
    () => (report ? buildJitSnapshotFallbackTables(report) : []),
    [report]
  );
  const topLevelCharts = React.useMemo(
    () => (report ? report.graphs.filter((chart) => isJainaChartInput(chart)) : []),
    [report]
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

  const handleDownloadPDF = async () => {
    if (!report) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const exportNode = reportExportRef.current;

      if (exportNode) {
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(exportNode, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#0b0b0b",
          logging: false,
        });

        const margin = 24;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const usableWidth = pageWidth - margin * 2;
        const usableHeight = pageHeight - margin * 2;
        const imageHeight = (canvas.height * usableWidth) / canvas.width;
        const imageData = canvas.toDataURL("image/png");

        let renderedHeight = 0;
        while (renderedHeight < imageHeight) {
          if (renderedHeight > 0) {
            doc.addPage();
          }
          const yOffset = margin - renderedHeight;
          doc.addImage(
            imageData,
            "PNG",
            margin,
            yOffset,
            usableWidth,
            imageHeight,
            undefined,
            "FAST"
          );
          renderedHeight += usableHeight;
        }
      } else {
        renderReportPdf(doc, report, fallbackTables);
      }

      doc.save(`jaina-report-${new Date().toISOString().split("T")[0]}.pdf`);
    } catch {
      try {
        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        renderReportPdf(doc, report, fallbackTables);
        doc.save(`jaina-report-${new Date().toISOString().split("T")[0]}.pdf`);
      } catch {
        show({
          title: "Export failed",
          description: "Unable to generate PDF report right now.",
          variant: "error",
        });
      }
    }
  };

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
            <JainaReportNav idPrefix={resolvedIdPrefix} report={report} />
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

              {report.performance_snapshot.length > 0 && (
                <div id={sectionId("performance-snapshot")} className="scroll-mt-20">
                  <JainaReportMetrics metrics={report.performance_snapshot} />
                </div>
              )}

              {report.sections.length > 0 && (
                <div id={sectionId("strategic-insights")} className="scroll-mt-20">
                  <JainaReportSections 
                    sections={report.sections} 
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

              {report.strategic_recommendations.length > 0 && (
                <div id={sectionId("recommendations")} className="scroll-mt-20">
                  <JainaReportRecommendations 
                    recommendations={report.strategic_recommendations} 
                    isStreaming={status === "streaming"}
                  />
                </div>
              )}

              {report.follow_up_questions.length > 0 && (
                <div
                  id={sectionId("follow-up-questions")}
                  className="space-y-4 pt-6 border-t border-white/5 scroll-mt-20"
                >
                  <Heading size="4" className="text-primary/80">
                    Continue Exploration
                  </Heading>
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

type PdfTable = {
  headers: string[];
  rows: string[][];
};

function formatMetricValueForPdf(
  metric: FrontendCheckpointReport["performance_snapshot"][number]
) {
  if (!metric || typeof metric !== "object") return "";
  const typedMetric = metric as {
    value?: unknown;
    format?: string;
    prefix?: string;
    suffix?: string;
  };
  const value = typedMetric.value;
  if (typeof value !== "number") return String(value);
  if (typedMetric.format === "currency" || typedMetric.prefix === "$") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (typedMetric.format === "percentage" || typedMetric.suffix === "%") {
    return `${value}%`;
  }
  const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${typedMetric.prefix || ""}${formatted}${typedMetric.suffix || ""}`;
}

function renderReportPdf(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  report: FrontendCheckpointReport,
  fallbackTables: PdfTable[]
) {
  const marginX = 40;
  const marginY = 44;
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
  const maxY = doc.internal.pageSize.getHeight() - marginY;
  let y = marginY;

  const ensureSpace = (requiredHeight = 16) => {
    if (y + requiredHeight > maxY) {
      doc.addPage();
      y = marginY;
    }
  };

  const addHeading = (text: string, size = 14) => {
    ensureSpace(size + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.text(text, marginX, y);
    y += size + 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
  };

  const addParagraph = (text?: string | null) => {
    if (!text) return;
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(15);
      doc.text(line, marginX, y);
      y += 15;
    }
    y += 4;
  };

  const addBullet = (text: string) => {
    const lines = doc.splitTextToSize(`• ${text}`, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(14);
      doc.text(line, marginX, y);
      y += 14;
    }
  };

  const addTable = (title: string, table: PdfTable) => {
    if (!table.headers.length || !table.rows.length) return;
    addHeading(title, 12);
    addParagraph(table.headers.join(" | "));
    for (const row of table.rows) {
      addParagraph(row.join(" | "));
    }
  };

  addHeading("Performance Analysis Report", 16);
  addParagraph(`Generated: ${new Date().toLocaleString()}`);
  addParagraph(`Language: ${report.language || "EN"}`);

  addHeading("Executive Summary");
  addParagraph(report.executive_summary || "No summary provided.");

  if (report.performance_snapshot.length > 0) {
    addHeading("Performance Snapshot");
    for (const metric of report.performance_snapshot) {
      const metricRecord = metric as {
        metric?: string;
        change?: string | number | null;
        context?: string;
        sub_label?: string;
      };
      const metricLabel = metricRecord.metric || "Metric";
      const metricValue = formatMetricValueForPdf(metric);
      const change =
        metricRecord.change === undefined || metricRecord.change === null
          ? ""
          : ` (Δ ${metricRecord.change})`;
      const context =
        metricRecord.context || metricRecord.sub_label
          ? ` — ${metricRecord.context || metricRecord.sub_label}`
          : "";
      addBullet(`${metricLabel}: ${metricValue}${change}${context}`);
    }
    y += 4;
  }

  if (report.sections.length > 0) {
    addHeading("Strategic Insights");
    for (const section of report.sections) {
      addHeading(`${section.heading} (${section.scope})`, 12);
      addParagraph(section.summary);
      for (const insight of section.highlights) {
        const title = insight.title ? `${insight.title}: ` : "";
        const impact = insight.impact ? ` [${insight.impact}]` : "";
        addBullet(`${title}${insight.text}${impact}`);
      }
      for (let index = 0; index < section.tables.length; index += 1) {
        const table = section.tables[index] as Partial<PdfTable>;
        if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)) {
          continue;
        }
        addTable(`${section.heading} Table ${index + 1}`, {
          headers: table.headers.map((header) => String(header)),
          rows: table.rows.map((row) =>
            Array.isArray(row) ? row.map((cell) => String(cell)) : []
          ),
        });
      }
    }
  }

  if (fallbackTables.length > 0) {
    addHeading("Detailed Data");
    for (let index = 0; index < fallbackTables.length; index += 1) {
      addTable(`Data Table ${index + 1}`, fallbackTables[index]);
    }
  }

  if (report.strategic_recommendations.length > 0) {
    addHeading("Priority Recommendations");
    for (const recommendation of report.strategic_recommendations) {
      const title = recommendation.title || "Recommendation";
      const details = recommendation.rationale || "";
      const tags = [
        recommendation.priority ? `Priority: ${recommendation.priority}` : "",
        recommendation.expected_impact
          ? `Impact: ${recommendation.expected_impact}`
          : "",
      ]
        .filter(Boolean)
        .join(" | ");
      addBullet(title);
      addParagraph(details);
      if (tags) addParagraph(tags);
    }
  }
}
