'use client';

import { createRoot, type Root } from 'react-dom/client';
import type { CheckpointBlockV2, CheckpointReportV2 } from '@/lib/jaina/schemas';
import { EXPORT_STYLES, PAGE_CONTENT_WIDTH_PX } from './exportStyles';
import { ExportModeProvider } from './ExportModeContext';
import { JainaReportDocument } from './JainaReportDocument';

// Builds the report as a real, standalone document inside an offscreen iframe, and
// hands it back ready to print or to serialize.
//
// An iframe rather than a print stylesheet over the live page, for two reasons. The
// chat lives inside height-constrained scroll containers, and `@media print` over an
// app shell clips to whatever was in view. And a standalone HTML file has to come
// from somewhere — with an iframe, PDF and HTML are two sinks on one document
// instead of two renderers that drift.

const READY_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 50;

export type ExportDocumentHandle = {
  iframe: HTMLIFrameElement;
  doc: Document;
  cleanup: () => void;
};

/**
 * The app's own CSS, as text. This is what makes an export look like the product
 * rather than like a generic report: the export inherits the real tokens, type scale
 * and card treatment instead of re-describing them in a second stylesheet.
 *
 * Same-origin sheets expose `cssRules`; anything that does not (Google Fonts) is
 * re-linked by href instead.
 */
function collectAppStyles(): { css: string; externalHrefs: string[] } {
  const css: string[] = [];
  const externalHrefs: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      rules = null; // cross-origin
    }
    if (rules) {
      css.push(Array.from(rules, (rule) => rule.cssText).join('\n'));
    } else if (sheet.href) {
      externalHrefs.push(sheet.href);
    }
  }
  return { css: css.join('\n'), externalHrefs };
}

/**
 * Root-relative `url(/…)` in the copied CSS resolves against the *document* — which
 * is `about:srcdoc` here and `file://` once the HTML file is saved. Absolutize so
 * fonts and background images keep working in both.
 */
export function absolutizeCssUrls(css: string, origin: string): string {
  return css.replace(/url\((['"]?)\/(?!\/)/g, `url($1${origin}/`);
}

function waitFor(check: () => boolean, timeoutMs: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - startedAt > timeoutMs) return reject(new Error(`Export timed out: ${label}`));
      setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
  });
}

/**
 * The readiness gate — the part that decides whether this works at all.
 *
 * `BlockRenderer` is `React.lazy`, so a document printed too early is a page of
 * skeletons, and Recharts sizes its SVG from a DOM measurement that lands a frame
 * or more after mount. Both failures are silent and produce a plausible-looking
 * file, which is exactly why they are asserted here rather than hoped for.
 */
async function awaitDocumentReady(doc: Document): Promise<void> {
  await waitFor(
    () => doc.querySelectorAll('[data-block-skeleton]').length === 0,
    READY_TIMEOUT_MS,
    'report modules did not finish loading',
  );

  // `.recharts-surface` specifically, never the first <svg> in the block: that one
  // is the provenance icon, which the export hides, so it measures zero forever and
  // a naive check waits on an element that is not the chart.
  await waitFor(
    () =>
      Array.from(doc.querySelectorAll('[data-category="chart"]')).every((node) => {
        const surface = node.querySelector('svg.recharts-surface');
        if (!surface) return false;
        const { width, height } = surface.getBoundingClientRect();
        return width > 0 && height > 0;
      }),
    READY_TIMEOUT_MS,
    'charts did not finish drawing',
  );

  // Images are eager by now (see `prepareImages`); wait for the bytes.
  await waitFor(
    () => Array.from(doc.images).every((img) => img.complete),
    READY_TIMEOUT_MS,
    'images did not finish loading',
  );

  await doc.fonts?.ready;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
}

/** Nothing may be deferred in a document that is about to be frozen onto paper. */
function forceEagerImages(doc: Document): void {
  for (const img of Array.from(doc.images)) {
    img.removeAttribute('loading');
    img.decoding = 'sync';
  }
}

/**
 * Inline every image as a data URI. One step, two wins: the print snapshot can no
 * longer outrun the network, and the saved HTML file is genuinely self-contained
 * rather than a page of Meta CDN links that expire within the hour.
 *
 * A fetch that fails leaves the original URL in place — a live link beats a hole.
 */
async function inlineImages(doc: Document): Promise<void> {
  await Promise.all(
    Array.from(doc.images).map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      try {
        const response = await fetch(src, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) return;
        img.setAttribute('src', await blobToDataUrl(await response.blob()));
        img.removeAttribute('srcset');
      } catch {
        /* keep the original src */
      }
    }),
  );
}

export async function renderExportDocument({
  report,
  blocks,
  title,
}: {
  report: CheckpointReportV2;
  blocks: CheckpointBlockV2[];
  title?: string;
}): Promise<ExportDocumentHandle> {
  const { css, externalHrefs } = collectAppStyles();
  const origin = window.location.origin;

  const iframe = document.createElement('iframe');
  // Offscreen but LAID OUT. Not `display:none`, not `visibility:hidden`: Recharts
  // measures its container, and a zero-size box yields zero-size charts.
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-jaina-export-frame', '');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${PAGE_CONTENT_WIDTH_PX}px`,
    'height:1200px',
    'border:0',
    'opacity:0',
    'pointer-events:none',
  ].join(';');
  iframe.title = 'Report export';

  const ready = new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => resolve(), { once: true });
  });

  // `data-theme="light"` because the export is a document, not a screenshot of a
  // session — the theme variant here is `(.dark, [data-theme="dark"])`.
  iframe.srcdoc = `<!doctype html><html data-theme="light" lang="${report.language}"><head><meta charset="utf-8" /></head><body></body></html>`;
  document.body.appendChild(iframe);
  await ready;

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error('Could not open the export document.');
  }

  for (const href of externalHrefs) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    doc.head.appendChild(link);
  }

  const style = doc.createElement('style');
  style.textContent = `${absolutizeCssUrls(css, origin)}\n${EXPORT_STYLES}`;
  doc.head.appendChild(style);

  const titleNode = doc.createElement('title');
  titleNode.textContent = title ?? 'Performance Report';
  doc.head.appendChild(titleNode);

  let root: Root | undefined;
  const cleanup = () => {
    try {
      root?.unmount();
    } finally {
      iframe.remove();
    }
  };

  try {
    root = createRoot(doc.body);
    root.render(
      <ExportModeProvider>
        <JainaReportDocument report={report} blocks={blocks} title={title} />
      </ExportModeProvider>,
    );

    // Let the lazy chunks mount before forcing images eager, then gate on the real
    // document being finished.
    await waitFor(
      () => doc.querySelectorAll('[data-block-id]').length >= blocks.length,
      READY_TIMEOUT_MS,
      'report modules did not mount',
    );
    forceEagerImages(doc);
    await awaitDocumentReady(doc);
    await inlineImages(doc);
    await waitFor(
      () => Array.from(doc.images).every((img) => img.complete),
      READY_TIMEOUT_MS,
      'inlined images did not settle',
    );
  } catch (error) {
    cleanup();
    throw error;
  }

  return { iframe, doc, cleanup };
}

/** The finished document as a standalone HTML file. */
export function serializeExportDocument(doc: Document): string {
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
