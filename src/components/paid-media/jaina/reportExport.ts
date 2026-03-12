import type { FrontendCheckpointReport } from "@/lib/jaina/schemas";

export type PdfTable = {
  headers: string[];
  rows: string[][];
};

type JainaPdfDocument = InstanceType<typeof import("jspdf").jsPDF>;

type DownloadJainaReportPdfOptions = {
  report: FrontendCheckpointReport;
  fallbackTables: PdfTable[];
  exportNode?: HTMLElement | null;
  backgroundColor?: string;
};

export function createJainaReportFilename(now: Date = new Date()): string {
  const safeDate = Number.isNaN(now.getTime()) ? new Date() : now;
  const day = safeDate.toISOString().split("T")[0];
  return `jaina-report-${day}.pdf`;
}

export function formatMetricValueForPdf(
  metric: FrontendCheckpointReport["performance_snapshot"][number]
): string {
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

export function renderReportPdf(
  doc: JainaPdfDocument,
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

export async function downloadJainaReportPdf({
  report,
  fallbackTables,
  exportNode,
  backgroundColor = "#0b0b0b",
}: DownloadJainaReportPdfOptions): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  if (exportNode) {
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(exportNode, {
        scale: 2,
        useCORS: true,
        backgroundColor,
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
      doc.save(createJainaReportFilename());
      return;
    } catch {
      // Fall back to deterministic text/pdf rendering if canvas export fails.
    }
  }

  renderReportPdf(doc, report, fallbackTables);
  doc.save(createJainaReportFilename());
}
