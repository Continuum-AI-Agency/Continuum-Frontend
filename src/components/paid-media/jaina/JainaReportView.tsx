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
  const reportExportRef = React.useRef<HTMLDivElement | null>(null);

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
            tooltip="Download PDF"
            icon={DownloadIcon as any}
            onClick={handleDownloadPDF}
          />
        </ArtifactActions>
      </ArtifactHeader>

      <ArtifactContent className="p-0 flex-1 min-h-0 relative">
        <Flex gap="0" align="start" className="relative h-full">
          <div className="hidden lg:block border-r border-white/5 p-4 sticky top-0 shrink-0 w-64 h-full overflow-y-auto">
            <JainaReportNav idPrefix={resolvedIdPrefix} />
          </div>

          <Flex
            direction="column"
            gap="6"
            className="flex-1 p-6 overflow-y-auto no-scrollbar h-full"
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

                {report.reasoning_trace && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <Text size="2" color="gray" className="uppercase tracking-wider mb-2">
                      Analysis Context
                    </Text>
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

type PdfTable = SoTReport["sections"][number]["tables"][number];

function formatMetricValueForPdf(metric: SoTReport["performance_snapshot"][number]) {
  const value = metric.value;
  if (typeof value !== "number") return String(value);
  if (metric.format === "currency" || metric.prefix === "$") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (metric.format === "percentage" || metric.suffix === "%") {
    return `${value}%`;
  }
  const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${metric.prefix || ""}${formatted}${metric.suffix || ""}`;
}

function renderReportPdf(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  report: SoTReport,
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

  if (report.reasoning_trace) {
    addHeading("Analysis Context");
    addParagraph(report.reasoning_trace);
  }

  if (report.performance_snapshot.length > 0) {
    addHeading("Performance Snapshot");
    for (const metric of report.performance_snapshot) {
      const metricLabel = metric.metric || "Metric";
      const metricValue = formatMetricValueForPdf(metric);
      const change =
        metric.change === undefined || metric.change === null ? "" : ` (Δ ${metric.change})`;
      const context =
        metric.context || metric.sub_label ? ` — ${metric.context || metric.sub_label}` : "";
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
        addTable(`${section.heading} Table ${index + 1}`, section.tables[index]);
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
      const title = recommendation.action || recommendation.title || "Recommendation";
      const details = recommendation.description || recommendation.reasoning || recommendation.rationale || "";
      const tags = [
        recommendation.type ? `Type: ${recommendation.type}` : "",
        recommendation.priority ? `Priority: ${recommendation.priority}` : "",
        recommendation.impact || recommendation.expected_impact
          ? `Impact: ${recommendation.impact || recommendation.expected_impact}`
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
