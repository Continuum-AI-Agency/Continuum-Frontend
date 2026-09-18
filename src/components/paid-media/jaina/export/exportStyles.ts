// The paper stylesheet. It is appended AFTER a copy of the app's own stylesheets
// (see `renderExportDocument`), so the export inherits the chat's real design —
// the same tokens, type scale and card treatment — and this file only says what
// paper needs that a screen does not.
//
// Three classes of rule live here, and the reasons matter:
//
//  1. PAGINATION. `break-inside: avoid` is the difference between a report and a
//     photocopy: the old exporter sliced one tall PNG at fixed offsets, so a chart
//     or a table row could be cut in half by arithmetic. Here the browser breaks
//     between blocks instead of through them.
//  2. UN-SCROLLING. The chat renders inside scroll containers (`overflow-x-auto`
//     on wide tables, capped heights on long lists). A scroll container on paper
//     is a guillotine — whatever is out of view is simply gone. Every one is
//     released back to its natural size here.
//  3. DE-INTERACTION. Buttons, toggles and hover affordances are noise in a
//     document nobody can click.

/** A4 content width at 96dpi: (210mm − 2 × PAGE_MARGIN_MM) / 25.4 × 96. */
export const PAGE_MARGIN_MM = 12;
export const PAGE_CONTENT_WIDTH_PX = Math.round(((210 - 2 * PAGE_MARGIN_MM) / 25.4) * 96);

/**
 * The size every chart is drawn at in an export. Paper has a width known before
 * anything renders, so charts are given it rather than left to measure a container
 * (see `explicitSize` on `ChartContainer`). The height is a deliberate budget: the
 * screen chart is 380px, and a shorter one is what keeps a report near one page.
 */
export const EXPORT_CHART_WIDTH_PX = PAGE_CONTENT_WIDTH_PX;
export const EXPORT_CHART_HEIGHT_PX = 240;

export const EXPORT_STYLES = `
@page { size: A4; margin: ${PAGE_MARGIN_MM}mm; }

html, body {
  margin: 0;
  padding: 0;
  height: auto;
  overflow: visible;
  background: #ffffff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

body {
  width: ${PAGE_CONTENT_WIDTH_PX}px;
  font-size: 12px;
  line-height: 1.45;
}

/* ---- 1. Pagination ---------------------------------------------------- */

.jaina-export-block,
.jaina-export-summary {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* A heading stranded at the foot of a page is worse than an early break. */
.jaina-export-block h2,
.jaina-export-block h3,
.jaina-export-block h4 {
  break-after: avoid;
  page-break-after: avoid;
}

/* Long tables may span pages — but never mid-row, and every page repeats the head. */
.jaina-export-block table { break-inside: auto; page-break-inside: auto; }
.jaina-export-block thead { display: table-header-group; }
.jaina-export-block tfoot { display: table-footer-group; }
.jaina-export-block tr { break-inside: avoid; page-break-inside: avoid; }

.jaina-export-header { break-after: avoid; page-break-after: avoid; }
.jaina-export-pagebreak { break-before: page; page-break-before: always; }

/* ---- 2. Un-scrolling -------------------------------------------------- */

.jaina-export-root [class*="overflow-"],
.jaina-export-root [style*="overflow"] {
  overflow: visible !important;
}

.jaina-export-root [class*="max-h-"] {
  max-height: none !important;
}

/* A sticky header inside a released scroller pins to the wrong box on paper. */
.jaina-export-root .sticky,
.jaina-export-root [class*="sticky"] {
  position: static !important;
}

/* Charts are drawn at EXPORT_CHART_* px; the box just has to stop imposing the
   screen's 380px height and aspect ratio on them. */
.jaina-export-root [data-chart],
.jaina-export-root [data-slot="chart"] {
  height: auto !important;
  aspect-ratio: auto !important;
  min-width: 0 !important;
  width: 100% !important;
}

/* Recharts writes pixel width/height onto the <svg> from its last measurement.
   Let it scale to the page box rather than overflow it. */
.jaina-export-root .recharts-wrapper,
.jaina-export-root .recharts-surface {
  max-width: 100% !important;
}

/* ---- 3. De-interaction ------------------------------------------------ */

/* Scoped to affordances that carry NO content. Hiding every button is wrong here:
   MediaPreview wraps the creative's own NAME in one, so a blanket rule silently
   deletes report text rather than just removing an interaction. */
.jaina-export-root [data-base-ui-tooltip-trigger],
.jaina-export-root fieldset[aria-label="Report modules"],
.jaina-export-root [data-slot="suggestion"],
.jaina-export-root [data-block-skeleton] {
  display: none !important;
}

/* <details> carries real report context (objectives, analysis, sources). On paper
   there is nothing to click, so everything is open and the marker is dropped. */
.jaina-export-root details > summary {
  list-style: none;
  font-weight: 600;
}
.jaina-export-root details > summary::-webkit-details-marker { display: none; }

/* Hover-only underlines read as broken links in print. */
.jaina-export-root .border-dashed { border-bottom-style: none !important; }

/* Nothing should still be pulsing in a finished document. */
.jaina-export-root .animate-pulse { animation: none !important; }

/* ---- Document furniture ----------------------------------------------- */

.jaina-export-root {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.jaina-export-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid currentColor;
}

.jaina-export-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.jaina-export-subtitle {
  margin: 3px 0 0;
  font-size: 11px;
  opacity: 0.7;
}

.jaina-export-meta {
  text-align: right;
  font-size: 10px;
  line-height: 1.5;
  opacity: 0.7;
  white-space: nowrap;
}

.jaina-export-footer {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(127, 127, 127, 0.3);
  font-size: 9px;
  opacity: 0.6;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
`;
