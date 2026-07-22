import type { FrontendCheckpointReport } from '@/lib/jaina/schemas';

export type PdfTable = {
  headers: string[];
  rows: string[][];
};

type JainaPdfDocument = InstanceType<typeof import('jspdf').jsPDF>;

type DownloadJainaReportPdfOptions = {
  report: FrontendCheckpointReport;
  fallbackTables: PdfTable[];
  exportNode?: HTMLElement | null;
  backgroundColor?: string;
};

export function createJainaReportFilename(now: Date = new Date()): string {
  const safeDate = Number.isNaN(now.getTime()) ? new Date() : now;
  const day = safeDate.toISOString().split('T')[0];
  return `jaina-report-${day}.pdf`;
}

export function createJainaReportHtmlFilename(now: Date = new Date()): string {
  const safeDate = Number.isNaN(now.getTime()) ? new Date() : now;
  const day = safeDate.toISOString().split('T')[0];
  return `jaina-report-${day}.html`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function serializeJsonForScript(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function renderParagraph(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return `<p>${escapeHtml(text)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br />')}</p>`;
}

function renderKeyValueList(entries: Array<[string, unknown]>): string {
  const rows = entries
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .map(
      ([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('');
  return rows ? `<dl class="kv">${rows}</dl>` : '';
}

function renderHtmlTable(title: string, table: PdfTable): string {
  if (!table.headers.length || !table.rows.length) return '';
  const head = table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const body = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  return `
    <section class="card">
      <h2>${escapeHtml(title)}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderChartFigure({
  title,
  type,
  payload,
}: {
  title: unknown;
  type: unknown;
  payload: unknown;
}): string {
  const titleText = String(title || 'Chart');
  const typeText = String(type || 'chart');
  return `
    <div class="chart-visual" data-jaina-chart data-chart-type="${escapeHtml(typeText)}">
      <div class="chart-stage" role="img" aria-label="${escapeHtml(`${titleText} chart`)}"></div>
      <p class="chart-fallback">Chart data embedded. Enable JavaScript to render the visual trend.</p>
      <script type="application/json" class="chart-payload">${serializeJsonForScript(payload)}</script>
    </div>
  `;
}

function renderReportShell({
  title,
  language,
  body,
}: {
  title: string;
  language?: string;
  body: string;
}): string {
  const generatedAt = new Date().toLocaleString();
  return `<!doctype html>
<html lang="${escapeHtml(language || 'en')}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f8f7ff;
      --surface: #ffffff;
      --surface-soft: #f1efff;
      --text: #171429;
      --muted: #605d78;
      --border: #dedaf5;
      --accent: #5a48f9;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #070b16;
        --surface: #0d1424;
        --surface-soft: #151d30;
        --text: #eef0f8;
        --muted: #a9aec2;
        --border: #26304a;
        --accent: #8b7dff;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
    header.report-header { margin-bottom: 20px; }
    h1 { margin: 0 0 6px; font-size: 28px; line-height: 1.1; letter-spacing: -0.03em; }
    h2 { margin: 0 0 12px; font-size: 16px; letter-spacing: -0.01em; }
    h3 { margin: 0 0 8px; font-size: 13px; }
    p { margin: 0 0 10px; color: var(--muted); }
    .meta { color: var(--muted); font-size: 12px; }
    .card {
      margin: 12px 0;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--surface);
      padding: 16px;
    }
    .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .metric { border: 1px solid var(--border); border-radius: 12px; background: var(--surface-soft); padding: 12px; }
    .metric .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .metric .value { margin-top: 4px; font-size: 20px; font-weight: 700; }
    .pill { display: inline-block; margin: 0 6px 6px 0; border: 1px solid var(--border); border-radius: 999px; padding: 3px 8px; color: var(--muted); font-size: 11px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid var(--border); padding: 8px; text-align: left; vertical-align: top; }
    th { color: var(--muted); background: var(--surface-soft); font-weight: 700; }
    ul { margin: 8px 0 0 18px; padding: 0; color: var(--muted); }
    li { margin: 5px 0; }
    .kv { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 0; }
    .kv div { border: 1px solid var(--border); border-radius: 10px; padding: 9px; background: var(--surface-soft); }
    dt { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    dd { margin: 4px 0 0; font-weight: 650; }
    .chart-visual {
      margin: 12px 0;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: linear-gradient(180deg, var(--surface-soft), var(--surface));
      padding: 10px;
    }
    .chart-stage svg { display: block; width: 100%; height: auto; min-height: 220px; }
    .chart-fallback { margin: 8px 0 0; font-size: 12px; }
    .chart-empty { min-height: 180px; display: grid; place-items: center; color: var(--muted); }
    .chart-spec pre {
      overflow-x: auto;
      max-height: 240px;
      border-radius: 10px;
      background: var(--surface-soft);
      padding: 10px;
      color: var(--muted);
      font-size: 11px;
    }
  </style>
</head>
<body>
  <main>
    <header class="report-header">
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">Generated ${escapeHtml(generatedAt)}${language ? ` · ${escapeHtml(language)}` : ''}</div>
    </header>
    ${body}
  </main>
  <script>
    (function () {
      var colors = ["#5a48f9", "#0ea5e9", "#f97316", "#16a34a", "#e11d48", "#8b5cf6"];

      function asNumber(value) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value !== "string") return null;
        var parsed = Number(value.replace(/[$,%x,]/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
      }

      function labelFor(value, index) {
        if (value === null || value === undefined || value === "") return String(index + 1);
        return String(value);
      }

      function pickNumeric(row, preferredKey) {
        if (!row || typeof row !== "object") return null;
        if (preferredKey && asNumber(row[preferredKey]) !== null) return asNumber(row[preferredKey]);
        var preferred = ["spend", "value", "y", "roas", "ctr", "cpc", "cpm", "conversions"];
        for (var i = 0; i < preferred.length; i += 1) {
          if (asNumber(row[preferred[i]]) !== null) return asNumber(row[preferred[i]]);
        }
        for (var key in row) {
          if (Object.prototype.hasOwnProperty.call(row, key) && asNumber(row[key]) !== null) return asNumber(row[key]);
        }
        return null;
      }

      function normalizeFromRows(rows, categoryKey, valueKey, name) {
        if (!Array.isArray(rows)) return [];
        var points = rows
          .map(function (row, index) {
            var y = pickNumeric(row, valueKey);
            if (y === null) return null;
            var x = row && typeof row === "object" ? row[categoryKey] || row.date || row.label || row.name || row.campaign || row.title : null;
            return { x: labelFor(x, index), y: y };
          })
          .filter(Boolean);
        return points.length > 0 ? [{ label: name || valueKey || "Value", points: points }] : [];
      }

      function normalizePayload(payload) {
        var chart = payload && payload.chart ? payload.chart : payload;
        if (!chart || typeof chart !== "object") return [];
        var categoryKey = payload.category_key || chart.category_key || "date";
        var valueKey = payload.value_key || chart.value_key || "value";
        var labels = Array.isArray(chart.labels) ? chart.labels : [];
        var datasets = Array.isArray(chart.datasets) ? chart.datasets : [];
        if (datasets.length > 0) {
          return datasets
            .map(function (dataset, datasetIndex) {
              var values = Array.isArray(dataset.data) ? dataset.data : [];
              var points = values
                .map(function (value, index) {
                  var y = asNumber(value);
                  return y === null ? null : { x: labelFor(labels[index], index), y: y };
                })
                .filter(Boolean);
              return { label: dataset.label || "Series " + (datasetIndex + 1), points: points };
            })
            .filter(function (series) { return series.points.length > 0; });
        }
        if (Array.isArray(chart.series)) {
          return chart.series
            .map(function (series, seriesIndex) {
              var values = Array.isArray(series.data) ? series.data : Array.isArray(series.values) ? series.values : [];
              var points = values
                .map(function (value, index) {
                  if (value && typeof value === "object") {
                    var yFromRow = pickNumeric(value, valueKey);
                    return yFromRow === null ? null : { x: labelFor(value[categoryKey] || value.x || value.date || value.label, index), y: yFromRow };
                  }
                  var y = asNumber(value);
                  return y === null ? null : { x: labelFor(labels[index], index), y: y };
                })
                .filter(Boolean);
              return { label: series.label || series.name || "Series " + (seriesIndex + 1), points: points };
            })
            .filter(function (series) { return series.points.length > 0; });
        }
        if (Array.isArray(chart.data)) {
          return normalizeFromRows(chart.data, categoryKey, valueKey, chart.value_label || valueKey || "Value");
        }
        if (Array.isArray(payload.data)) {
          return normalizeFromRows(payload.data, categoryKey, valueKey, payload.value_label || valueKey || "Value");
        }
        return [];
      }

      function renderChart(container, payload) {
        var chartType = String(container.getAttribute("data-chart-type") || payload.chart_type || payload.type || "line").toLowerCase();
        var series = normalizePayload(payload);
        var stage = container.querySelector(".chart-stage");
        var fallback = container.querySelector(".chart-fallback");
        if (!stage) return;
        if (series.length === 0) {
          stage.innerHTML = '<div class="chart-empty">No numeric chart data available.</div>';
          return;
        }

        var width = 860;
        var height = 280;
        var padLeft = 52;
        var padRight = 22;
        var padTop = 20;
        var padBottom = 42;
        var allPoints = series.reduce(function (points, item) { return points.concat(item.points); }, []);
        var min = Math.min.apply(null, allPoints.map(function (point) { return point.y; }));
        var max = Math.max.apply(null, allPoints.map(function (point) { return point.y; }));
        if (min === max) {
          min = min - Math.max(1, Math.abs(min) * 0.15);
          max = max + Math.max(1, Math.abs(max) * 0.15);
        }
        var chartWidth = width - padLeft - padRight;
        var chartHeight = height - padTop - padBottom;
        var longestSeries = series.reduce(function (longest, item) { return item.points.length > longest.points.length ? item : longest; }, series[0]);

        function xFor(index, count) {
          if (count <= 1) return padLeft + chartWidth / 2;
          return padLeft + (index / (count - 1)) * chartWidth;
        }

        function yFor(value) {
          return padTop + chartHeight - ((value - min) / (max - min)) * chartHeight;
        }

        function escapeSvg(value) {
          return String(value).replace(/[&<>"']/g, function (char) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
          });
        }

        var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true">';
        svg += '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="16" fill="transparent"></rect>';
        for (var tick = 0; tick <= 3; tick += 1) {
          var yTick = padTop + (tick / 3) * chartHeight;
          var value = max - (tick / 3) * (max - min);
          svg += '<line x1="' + padLeft + '" x2="' + (width - padRight) + '" y1="' + yTick + '" y2="' + yTick + '" stroke="currentColor" opacity="0.1"></line>';
          svg += '<text x="10" y="' + (yTick + 4) + '" fill="currentColor" opacity="0.56" font-size="11">' + escapeSvg(value.toLocaleString(undefined, { maximumFractionDigits: 2 })) + '</text>';
        }

        series.forEach(function (item, seriesIndex) {
          var color = colors[seriesIndex % colors.length];
          if (chartType.indexOf("bar") >= 0) {
            var barWidth = Math.max(6, chartWidth / Math.max(item.points.length, 1) / (series.length + 1));
            item.points.forEach(function (point, index) {
              var x = xFor(index, item.points.length) - barWidth / 2 + seriesIndex * Math.min(barWidth, 10);
              var y = yFor(point.y);
              svg += '<rect x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + (padTop + chartHeight - y) + '" rx="4" fill="' + color + '" opacity="0.82"></rect>';
            });
            return;
          }
          var path = item.points
            .map(function (point, index) {
              var command = index === 0 ? "M" : "L";
              return command + xFor(index, item.points.length).toFixed(2) + " " + yFor(point.y).toFixed(2);
            })
            .join(" ");
          if (chartType.indexOf("area") >= 0) {
            var areaPath = path + " L" + xFor(item.points.length - 1, item.points.length).toFixed(2) + " " + (padTop + chartHeight) + " L" + xFor(0, item.points.length).toFixed(2) + " " + (padTop + chartHeight) + " Z";
            svg += '<path d="' + areaPath + '" fill="' + color + '" opacity="0.14"></path>';
          }
          svg += '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>';
          item.points.forEach(function (point, index) {
            svg += '<circle cx="' + xFor(index, item.points.length) + '" cy="' + yFor(point.y) + '" r="3.2" fill="' + color + '"></circle>';
          });
        });

        var labelIndexes = [0, Math.floor((longestSeries.points.length - 1) / 2), longestSeries.points.length - 1]
          .filter(function (value, index, self) { return value >= 0 && self.indexOf(value) === index; });
        labelIndexes.forEach(function (index) {
          var point = longestSeries.points[index];
          svg += '<text x="' + xFor(index, longestSeries.points.length) + '" y="' + (height - 16) + '" fill="currentColor" opacity="0.56" font-size="11" text-anchor="middle">' + escapeSvg(point.x) + '</text>';
        });
        series.forEach(function (item, index) {
          var x = padLeft + index * 148;
          var y = 16;
          svg += '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + colors[index % colors.length] + '"></circle>';
          svg += '<text x="' + (x + 10) + '" y="' + (y + 4) + '" fill="currentColor" opacity="0.74" font-size="11">' + escapeSvg(item.label) + '</text>';
        });
        svg += '</svg>';
        stage.innerHTML = svg;
        if (fallback) fallback.hidden = true;
      }

      document.querySelectorAll("[data-jaina-chart]").forEach(function (container) {
        var payloadNode = container.querySelector(".chart-payload");
        if (!payloadNode) return;
        try {
          renderChart(container, JSON.parse(payloadNode.textContent || "{}"));
        } catch (error) {
          var stage = container.querySelector(".chart-stage");
          if (stage) stage.innerHTML = '<div class="chart-empty">Chart could not be rendered.</div>';
        }
      });
    })();
  </script>
</body>
</html>`;
}

export function formatMetricValueForPdf(
  metric: FrontendCheckpointReport['performance_snapshot'][number],
): string {
  if (!metric || typeof metric !== 'object') return '';
  const typedMetric = metric as {
    value?: unknown;
    format?: string;
    prefix?: string;
    suffix?: string;
  };
  const value = typedMetric.value;
  if (typeof value !== 'number') return String(value);
  if (typedMetric.format === 'currency' || typedMetric.prefix === '$') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (typedMetric.format === 'percentage' || typedMetric.suffix === '%') {
    return `${value}%`;
  }
  const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${typedMetric.prefix || ''}${formatted}${typedMetric.suffix || ''}`;
}

export function renderReportPdf(
  doc: JainaPdfDocument,
  report: FrontendCheckpointReport,
  fallbackTables: PdfTable[],
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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.text(text, marginX, y);
    y += size + 8;
    doc.setFont('helvetica', 'normal');
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
    addParagraph(table.headers.join(' | '));
    for (const row of table.rows) {
      addParagraph(row.join(' | '));
    }
  };

  addHeading('Performance Analysis Report', 16);
  addParagraph(`Generated: ${new Date().toLocaleString()}`);
  addParagraph(`Language: ${report.language || 'EN'}`);

  addHeading('Executive Summary');
  addParagraph(report.executive_summary || 'No summary provided.');

  if (report.performance_snapshot.length > 0) {
    addHeading('Performance Snapshot');
    for (const metric of report.performance_snapshot) {
      const metricRecord = metric as {
        metric?: string;
        change?: string | number | null;
        context?: string;
        sub_label?: string;
      };
      const metricLabel = metricRecord.metric || 'Metric';
      const metricValue = formatMetricValueForPdf(metric);
      const change =
        metricRecord.change === undefined || metricRecord.change === null
          ? ''
          : ` (Δ ${metricRecord.change})`;
      const context =
        metricRecord.context || metricRecord.sub_label
          ? ` — ${metricRecord.context || metricRecord.sub_label}`
          : '';
      addBullet(`${metricLabel}: ${metricValue}${change}${context}`);
    }
    y += 4;
  }

  if (report.sections.length > 0) {
    addHeading('Strategic Insights');
    for (const section of report.sections) {
      addHeading(`${section.heading} (${section.scope})`, 12);
      addParagraph(section.summary);
      for (const insight of section.highlights) {
        const title = insight.title ? `${insight.title}: ` : '';
        const impact = insight.impact ? ` [${insight.impact}]` : '';
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
            Array.isArray(row) ? row.map((cell) => String(cell)) : [],
          ),
        });
      }
    }
  }

  if (fallbackTables.length > 0) {
    addHeading('Detailed Data');
    for (let index = 0; index < fallbackTables.length; index += 1) {
      addTable(`Data Table ${index + 1}`, fallbackTables[index]);
    }
  }

  if (report.strategic_recommendations.length > 0) {
    addHeading('Priority Recommendations');
    for (const recommendation of report.strategic_recommendations) {
      const title = recommendation.title || 'Recommendation';
      const details = recommendation.rationale || '';
      const tags = [
        recommendation.priority ? `Priority: ${recommendation.priority}` : '',
        recommendation.expected_impact ? `Impact: ${recommendation.expected_impact}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      addBullet(title);
      addParagraph(details);
      if (tags) addParagraph(tags);
    }
  }
}

// Walk up from the report node to the nearest non-transparent background so the
// captured PDF matches the on-screen theme (light or dark) instead of a guess.
function resolveExportBackground(node: HTMLElement | null): string {
  if (!node || typeof window === 'undefined') return '#ffffff';
  let element: HTMLElement | null = node;
  while (element) {
    const background = window.getComputedStyle(element).backgroundColor;
    if (background && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)') {
      return background;
    }
    element = element.parentElement;
  }
  return '#ffffff';
}

// Capture a LIVE rendered report node (the real React/Recharts output) into a
// multi-page PDF. The front-end owns rendering; this only snapshots it — there
// is no second charting implementation to drift from what the user sees.
async function captureNodeToPdf(
  exportNode: HTMLElement,
  options: { backgroundColor: string; fileName: string },
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const html2canvas = (await import('html2canvas')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const canvas = await html2canvas(exportNode, {
    scale: 2,
    useCORS: true,
    backgroundColor: options.backgroundColor,
    logging: false,
  });

  const margin = 24;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const imageHeight = (canvas.height * usableWidth) / canvas.width;
  const imageData = canvas.toDataURL('image/png');

  let renderedHeight = 0;
  while (renderedHeight < imageHeight) {
    if (renderedHeight > 0) doc.addPage();
    doc.addImage(
      imageData,
      'PNG',
      margin,
      margin - renderedHeight,
      usableWidth,
      imageHeight,
      undefined,
      'FAST',
    );
    renderedHeight += usableHeight;
  }
  doc.save(options.fileName);
}

export async function downloadJainaReportPdf({
  report,
  fallbackTables,
  exportNode,
  backgroundColor = '#0b0b0b',
}: DownloadJainaReportPdfOptions): Promise<void> {
  if (exportNode) {
    try {
      await captureNodeToPdf(exportNode, {
        backgroundColor,
        fileName: createJainaReportFilename(),
      });
      return;
    } catch {
      // Fall back to deterministic text/pdf rendering if canvas export fails.
    }
  }

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  renderReportPdf(doc, report, fallbackTables);
  doc.save(createJainaReportFilename());
}

// V2 report export: capture the live rendered report (real Recharts charts),
// theme-matched, as a multi-page PDF. No server-side chart regeneration.
export async function downloadJainaReportV2Pdf({
  exportNode,
  backgroundColor,
}: {
  exportNode: HTMLElement | null;
  backgroundColor?: string;
}): Promise<void> {
  if (!exportNode) {
    throw new Error('No rendered report available to export.');
  }
  await captureNodeToPdf(exportNode, {
    backgroundColor: backgroundColor ?? resolveExportBackground(exportNode),
    fileName: createJainaReportFilename(),
  });
}

function renderLegacyChartSpecs(report: FrontendCheckpointReport): string {
  const charts = [...report.graphs, ...report.sections.flatMap((section) => section.graphs)];
  if (charts.length === 0) return '';

  return `
    <section class="card">
      <h2>Charts</h2>
      ${charts
        .map((chart, index) => {
          const record = chart as Record<string, unknown>;
          const title = record.title || `Chart ${index + 1}`;
          const type = record.type || record.graph_type || record.chart_type || 'chart';
          return `
            <article class="chart-spec">
              <h3>${escapeHtml(title)}</h3>
              ${renderChartFigure({
                title,
                type,
                payload: {
                  chart: record,
                  chart_type: type,
                  category_key: record.category_key || record.x_axis_key || 'date',
                  value_key: record.value_key || record.y_axis_key || 'value',
                },
              })}
              ${renderKeyValueList([
                ['Chart type', type],
                ['X axis', record.x_axis_label],
                ['Y axis', record.y_axis_label],
                [
                  'Cached sources',
                  Array.isArray(record.cached_sources) ? record.cached_sources.join(', ') : '',
                ],
              ])}
              <pre>${escapeHtml(JSON.stringify(record.data ?? record.datasets ?? record.series ?? record.labels ?? {}, null, 2))}</pre>
            </article>
          `;
        })
        .join('')}
    </section>
  `;
}

export function buildJainaReportHtml({
  report,
  fallbackTables,
}: {
  report: FrontendCheckpointReport;
  fallbackTables: PdfTable[];
}): string {
  const title = report.report_title || 'Jaina Performance Analysis';
  const metrics = report.performance_snapshot
    .map((metric) => {
      const record = metric as Record<string, unknown>;
      return `
        <div class="metric">
          <div class="label">${escapeHtml(record.metric || 'Metric')}</div>
          <div class="value">${escapeHtml(formatMetricValueForPdf(metric))}</div>
          ${record.change ? `<p>${escapeHtml(`Change: ${record.change}`)}</p>` : ''}
          ${record.context || record.sub_label ? `<p>${escapeHtml(record.context ?? record.sub_label)}</p>` : ''}
        </div>
      `;
    })
    .join('');

  const sections = report.sections
    .map(
      (section) => `
        <section class="card">
          <h2>${escapeHtml(section.heading)}</h2>
          <span class="pill">${escapeHtml(section.scope)}</span>
          ${section.confidence ? `<span class="pill">Confidence: ${escapeHtml(section.confidence)}</span>` : ''}
          ${renderParagraph(section.summary)}
          ${
            section.highlights.length > 0
              ? `<h3>Highlights</h3><ul>${section.highlights
                  .map(
                    (insight) =>
                      `<li><strong>${escapeHtml(insight.title || insight.category)}</strong>: ${escapeHtml(insight.text)}${insight.impact ? ` (${escapeHtml(insight.impact)})` : ''}</li>`,
                  )
                  .join('')}</ul>`
              : ''
          }
          ${
            section.actions.length > 0
              ? `<h3>Actions</h3><ul>${section.actions
                  .map(
                    (action) =>
                      `<li><strong>${escapeHtml(action.title)}</strong>: ${escapeHtml(action.rationale)}${action.expected_impact ? ` (${escapeHtml(action.expected_impact)})` : ''}</li>`,
                  )
                  .join('')}</ul>`
              : ''
          }
        </section>
      `,
    )
    .join('');

  const recommendations = report.strategic_recommendations
    .map(
      (recommendation) => `
        <li>
          <strong>${escapeHtml(recommendation.title)}</strong>
          ${recommendation.priority ? `<span class="pill">${escapeHtml(recommendation.priority)}</span>` : ''}
          ${renderParagraph(recommendation.rationale)}
          ${recommendation.expected_impact ? `<p>Expected impact: ${escapeHtml(recommendation.expected_impact)}</p>` : ''}
        </li>
      `,
    )
    .join('');

  const body = `
    ${
      report.executive_summary
        ? `<section class="card"><h2>Executive Summary</h2>${renderParagraph(report.executive_summary)}</section>`
        : ''
    }
    ${metrics ? `<section class="card"><h2>Performance Snapshot</h2><div class="grid">${metrics}</div></section>` : ''}
    ${sections}
    ${renderLegacyChartSpecs(report)}
    ${fallbackTables.map((table, index) => renderHtmlTable(`Data Table ${index + 1}`, table)).join('')}
    ${recommendations ? `<section class="card"><h2>Recommendations</h2><ul>${recommendations}</ul></section>` : ''}
    ${
      report.follow_up_questions.length > 0
        ? `<section class="card"><h2>Follow-up Questions</h2><ul>${report.follow_up_questions.map((question) => `<li>${escapeHtml(question)}</li>`).join('')}</ul></section>`
        : ''
    }
  `;

  return renderReportShell({
    title,
    language: report.language,
    body,
  });
}

// ---------------------------------------------------------------------------
function downloadHtmlFile(filename: string, html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadJainaReportHtml(options: {
  report: FrontendCheckpointReport;
  fallbackTables: PdfTable[];
}) {
  downloadHtmlFile(createJainaReportHtmlFilename(), buildJainaReportHtml(options));
}
