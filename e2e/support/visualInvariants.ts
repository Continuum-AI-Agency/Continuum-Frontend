import type { BrowserContext, Page } from '@playwright/test';
import {
  CLIP_TOLERANCE_PX,
  type FigureFact,
  findOverlaps,
  formatRect,
  MAX_LAYOUT_SHIFT,
  MIN_TAP_TARGET_PX,
  moneyViolations,
  type Rect,
  sidesOutsideViewport,
  type TablistFact,
  tabIndicatorViolations,
  tapTargetShortfall,
  type VisualNode,
  type VisualViolation,
  violation,
} from './visualGeometry';

// The L1V geometric detector of the Performance+ campaign (docs/perfplus-campaign/
// 04-visual-and-platforms.md "Oráculo visual"; docs/perfplus-design-intent.md, global rules 2
// and 8). `auditVisual` reads a page as it stands and returns every violation of:
//
//   overlap                 text / control / image boxes that intersect without being
//                           ancestor and descendant (overlays and fixed layers excluded)
//   clipped-text            scrollWidth > clientWidth + 1 without text-overflow: ellipsis;
//                           scrollHeight > clientHeight + 1 in a box that hides its overflow
//   covered-control         elementsFromPoint at a control's centre is not the control
//   tap-target              an interactive element under 24 × 24 CSS px
//   horizontal-scroll       document.documentElement.scrollWidth > clientWidth
//   layout-shift            cumulative layout-shift over the settle window > 0.1
//   contrast                axe-core `color-contrast` and `link-in-text-block` (AA)
//   tooltip-offscreen       a tooltip / popover outside the viewport after hover or focus
//   money-currency          a `[data-figure]` that reads as money with no ISO code on the node
//   selected-tab-indicator  the tab styled as active is not the aria-selected one, or the
//                           visible panel belongs to another tab
//
// Every rule is geometry or computed style, read in the page; the judgement (what is a
// collision, what counts as money, which tab is highlighted) lives in visualGeometry.ts so
// `bun test` can pin it. The thresholds are the intent's and are not tuned here: a violation
// is a finding for the campaign ledger.
//
// Intentional overlays are skipped by rule (a): elements under a dialog / alertdialog /
// tooltip / menu / listbox role, the shadcn `*-content` slots (popover, dropdown-menu, select,
// tooltip, sheet, dialog), anything carrying `data-visual-overlay`, sonner toasts, and Next's
// dev-only `nextjs-portal`. A `position: fixed` subtree is a layer, not a neighbour, so it is
// excluded from (a) too; whether a layer HIDES a control is rule (c)'s question.

export type VisualTheme = 'light' | 'dark';
export type VisualState = 'loaded' | 'empty' | 'error';

export type VisualAuditContext = {
  viewport: number;
  theme: VisualTheme;
  surface: string;
  state: VisualState;
};

export type VisualAuditOptions = {
  /** Path to axe.min.js; `null` skips contrast and reports it unexercised. Resolved from
   *  node_modules by default. */
  axeScriptPath?: string | null;
  /** How many tooltip / popover triggers to hover and focus (the intent says the first 5). */
  tooltipProbes?: number;
  /** Upper bound on the controls rule (c) hit-tests (each may scroll the page). */
  maxControls?: number;
};

export type VisualStats = {
  nodes: number;
  textElements: number;
  controls: number;
  tablists: number;
  figures: number;
  tooltipsProbed: number;
  contrastUndetermined: number;
  layoutShift: number;
};

export type VisualReport = {
  context: VisualAuditContext;
  violations: VisualViolation[];
  /** Rules (or parts of rules) this audit could not run, each with its reason. */
  unexercised: string[];
  stats: VisualStats;
};

/* ------------------------------------------------------------------------- */
/* Selectors shared by the in-page collectors                                 */
/* ------------------------------------------------------------------------- */

export const CONTROL_SELECTOR =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
  '[role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="radio"], ' +
  '[role="switch"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], ' +
  '[role="option"], [role="slider"], [role="combobox"], [role="textbox"]';

export const IMAGE_SELECTOR = 'img, svg, video, canvas, picture';

/** Overlays rule (a) must not compare against the content beneath them. */
export const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="tooltip"], [role="menu"], [role="listbox"], ' +
  '[data-slot="popover-content"], [data-slot="dropdown-menu-content"], ' +
  '[data-slot="select-content"], [data-slot="tooltip-content"], [data-slot="sheet-content"], ' +
  '[data-slot="dialog-content"], [data-visual-overlay], [data-sonner-toaster], nextjs-portal';

/** What rule (h) hovers: the intent names `[data-tooltip]` and `[aria-describedby]`; this app
 *  marks its Base UI tooltip triggers with `data-slot="tooltip-trigger"` and only writes
 *  `aria-describedby` once the tooltip is open, so the slot is the selector that finds them. */
export const TOOLTIP_TRIGGER_SELECTOR =
  '[data-tooltip], [aria-describedby], [data-slot="tooltip-trigger"]';

/** What rule (h) measures once a trigger is hovered or focused. */
export const FLOATING_SELECTOR =
  '[role="tooltip"], [data-slot="tooltip-content"], [data-slot="popover-content"], ' +
  '[data-slot="dropdown-menu-content"]';

/* ------------------------------------------------------------------------- */
/* Probes installed before navigation                                        */
/* ------------------------------------------------------------------------- */

type PageHelpers = ReturnType<typeof pageHelpers>;

declare global {
  interface Window {
    __l1vCls?: number;
    __l1vClsSources?: { value: number; selector: string }[];
    __l1vHelpers?: PageHelpers;
    axe?: {
      run: (
        context: unknown,
        options: unknown,
      ) => Promise<{
        violations: AxeResult[];
        incomplete: AxeResult[];
      }>;
    };
  }
}

type AxeResult = {
  id: string;
  nodes: {
    target: string[];
    failureSummary?: string;
    any: { data?: Record<string, unknown>; message?: string }[];
  }[];
};

/** Installs the layout-shift observer on every page of `context` before any script runs, so
 *  the shifts of the first paint count. */
export async function installVisualProbes(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    window.__l1vCls = 0;
    window.__l1vClsSources = [];
    const describe = (node: unknown): string => {
      const el = node instanceof Element ? node : (node as Node | null)?.parentElement;
      if (!el) return 'unknown';
      const testid = el.getAttribute('data-testid');
      if (testid) return `${el.tagName.toLowerCase()}[data-testid="${testid}"]`;
      if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
      const classes = Array.from(el.classList)
        .filter((c) => !/[:[/]/.test(c))
        .slice(0, 2);
      return el.tagName.toLowerCase() + (classes.length ? `.${classes.join('.')}` : '');
    };
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
            sources?: { node?: Node | null }[];
          };
          if (shift.hadRecentInput) continue;
          window.__l1vCls = (window.__l1vCls ?? 0) + shift.value;
          const source = shift.sources?.[0]?.node;
          (window.__l1vClsSources ??= []).push({
            value: shift.value,
            selector: describe(source ?? null),
          });
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // No layout-shift support: the audit reports the rule unexercised.
    }
  });
}

/** Seeds the theme the way the app stores it (`localStorage.theme`, JSON-encoded, read by the
 *  NoFlashScript in app/layout.tsx and by ThemeProvider) before any page of `context` boots. */
export async function seedTheme(context: BrowserContext, theme: VisualTheme): Promise<void> {
  await context.addInitScript((next) => {
    window.localStorage.setItem('theme', JSON.stringify(next));
  }, theme);
}

/** Zeroes the layout-shift accumulator: between two sub-surfaces on the same page. */
export async function resetLayoutShift(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      window.__l1vCls = 0;
      window.__l1vClsSources = [];
    })
    .catch(() => undefined);
}

/* ------------------------------------------------------------------------- */
/* axe-core                                                                   */
/* ------------------------------------------------------------------------- */

/** axe.min.js from node_modules (hoisted at the monorepo root), or null when not installed —
 *  `@axe-core/playwright` is not a dependency here, the bare engine is. */
export function resolveAxeScript(): string | null {
  try {
    return require.resolve('axe-core/axe.min.js');
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------- */
/* auditVisual                                                                */
/* ------------------------------------------------------------------------- */

type ElementFact = { selector: string; bbox: Rect };

type ClippedTextFact = ElementFact & {
  axis: 'x' | 'y';
  scroll: number;
  client: number;
  overflow: string;
  text: string;
};

type ControlFact = ElementFact & {
  inlineTextLink: boolean;
  covered: { by: string; at: [number, number] } | null;
};

type HorizontalScrollFact = {
  scrollWidth: number;
  clientWidth: number;
  widest: ElementFact | null;
};

type ContrastFact = {
  violations: (ElementFact & { rule: string; detail: string })[];
  undetermined: number;
};

export async function auditVisual(
  page: Page,
  context: VisualAuditContext,
  options: VisualAuditOptions = {},
): Promise<VisualReport> {
  const violations: VisualViolation[] = [];
  const unexercised: string[] = [];
  const stats: VisualStats = {
    nodes: 0,
    textElements: 0,
    controls: 0,
    tablists: 0,
    figures: 0,
    tooltipsProbed: 0,
    contrastUndetermined: 0,
    layoutShift: 0,
  };
  const viewport = page.viewportSize() ?? { width: context.viewport, height: 900 };

  // Hover and focus styles are not the page's resting state; a tab still under the mouse
  // after its click would read as highlighted for the wrong reason.
  await parkMouse(page, viewport);
  await page
    .evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.scrollTo(0, 0);
    })
    .catch(() => undefined);

  const run = async (rule: string, step: () => Promise<void>) => {
    try {
      await step();
    } catch (error) {
      unexercised.push(
        `${rule}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
      );
    }
  };

  await run('page-helpers', () => installPageHelpers(page));

  // (a) overlap
  await run('overlap', async () => {
    const nodes = await collectVisualNodes(page);
    stats.nodes = nodes.length;
    violations.push(...findOverlaps(nodes));
  });

  // (b) clipped text
  await run('clipped-text', async () => {
    const { facts, textElements } = await collectClippedText(page);
    stats.textElements = textElements;
    for (const fact of facts) {
      const measure =
        fact.axis === 'x'
          ? `scrollWidth ${fact.scroll} > clientWidth ${fact.client}`
          : `scrollHeight ${fact.scroll} > clientHeight ${fact.client}`;
      const how =
        fact.overflow === 'visible'
          ? 'spills past its box'
          : `clipped (overflow: ${fact.overflow})`;
      violations.push(
        violation(
          'clipped-text',
          fact.selector,
          fact.bbox,
          `"${fact.text.slice(0, 50)}" ${measure}, ${how}, no ellipsis`,
        ),
      );
    }
  });

  // (c) covered controls and (d) tap targets
  await run('covered-control/tap-target', async () => {
    const controls = await collectControls(page, options.maxControls ?? 400);
    stats.controls = controls.length;
    for (const control of controls) {
      if (control.covered) {
        violations.push(
          violation(
            'covered-control',
            control.selector,
            control.bbox,
            `centre (${control.covered.at[0]}, ${control.covered.at[1]}) hits ${control.covered.by} instead of the control`,
          ),
        );
      }
      if (control.inlineTextLink) continue;
      const short = tapTargetShortfall(control.bbox, MIN_TAP_TARGET_PX);
      if (short) violations.push(violation('tap-target', control.selector, control.bbox, short));
    }
  });

  // (e) horizontal body scroll
  await run('horizontal-scroll', async () => {
    const fact = await page.evaluate(measureHorizontalScroll);
    if (fact.scrollWidth > fact.clientWidth) {
      violations.push(
        violation(
          'horizontal-scroll',
          fact.widest?.selector ?? 'html',
          fact.widest?.bbox ?? { x: 0, y: 0, width: fact.scrollWidth, height: 0 },
          `document scrollWidth ${fact.scrollWidth} > clientWidth ${fact.clientWidth}` +
            (fact.widest
              ? `; widest element reaches x=${Math.round(fact.widest.bbox.x + fact.widest.bbox.width)}`
              : ''),
        ),
      );
    }
  });

  // (f) CLS over the settle window
  await run('layout-shift', async () => {
    const shift = await page.evaluate(() => ({
      value: window.__l1vCls,
      sources: (window.__l1vClsSources ?? []).sort((a, b) => b.value - a.value).slice(0, 3),
    }));
    if (typeof shift.value !== 'number') {
      unexercised.push('layout-shift: no PerformanceObserver(layout-shift) on this page');
      return;
    }
    stats.layoutShift = shift.value;
    if (shift.value > MAX_LAYOUT_SHIFT) {
      const top = shift.sources[0];
      violations.push(
        violation(
          'layout-shift',
          top?.selector ?? 'document',
          { x: 0, y: 0, width: viewport.width, height: viewport.height },
          `CLS ${shift.value.toFixed(3)} > ${MAX_LAYOUT_SHIFT}; largest shifts: ${shift.sources
            .map((s) => `${s.selector} ${s.value.toFixed(3)}`)
            .join(', ')}`,
        ),
      );
    }
  });

  // (g) contrast via axe-core
  await run('contrast', async () => {
    const axePath =
      options.axeScriptPath === undefined ? resolveAxeScript() : options.axeScriptPath;
    if (!axePath) {
      unexercised.push('contrast: axe-core is not resolvable from node_modules');
      return;
    }
    const loaded = await page.evaluate(() => typeof window.axe !== 'undefined');
    if (!loaded) await page.addScriptTag({ path: axePath });
    const fact = await page.evaluate(runAxeContrast);
    stats.contrastUndetermined = fact.undetermined;
    for (const hit of fact.violations) {
      violations.push(violation('contrast', hit.selector, hit.bbox, `${hit.rule}: ${hit.detail}`));
    }
  });

  // (i) money without currency
  await run('money-currency', async () => {
    const figures = await page.evaluate(collectFigures);
    stats.figures = figures.length;
    violations.push(...moneyViolations(figures));
  });

  // (j) the highlighted tab is the selected tab
  await run('selected-tab-indicator', async () => {
    const tablists = await page.evaluate(collectTablists);
    stats.tablists = tablists.length;
    violations.push(...tabIndicatorViolations(tablists));
  });

  // (h) tooltips and popovers inside the viewport — last, because hovering moves the page.
  await run('tooltip-offscreen', async () => {
    const probed = await probeTooltips(page, options.tooltipProbes ?? 5, viewport, violations);
    stats.tooltipsProbed = probed;
  });
  await parkMouse(page, viewport);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);

  return { context, violations, unexercised, stats };
}

/** Parks the pointer where nothing reacts to it: the middle of the right edge. The top-left
 *  corner is the collapsed sidebar's hover zone, and a sidebar expanded by the bench's own
 *  pointer would be measured as covering the page. */
async function parkMouse(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.mouse.move(viewport.width - 2, Math.floor(viewport.height / 2)).catch(() => undefined);
}

/* ------------------------------------------------------------------------- */
/* In-page helpers — installed once per audit as window.__l1vHelpers          */
/* ------------------------------------------------------------------------- */

/** Visibility, ancestry, naming and clipping, shared by every collector. It is serialised with
 *  `toString()` and evaluated in the page, so it must reference nothing outside itself. */
function pageHelpers(overlaySelector: string) {
  const isHiddenByStyle = (el: Element): boolean => {
    const style = window.getComputedStyle(el);
    return (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      Number(style.opacity) === 0
    );
  };
  /** Screen-reader-only text (`sr-only`: 1 × 1 px, clipped) is not on screen. */
  const isScreenReaderOnly = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 && rect.height <= 1) return true;
    const style = window.getComputedStyle(el);
    return style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clipPath === 'inset(50%)';
  };
  const isVisible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    for (let cursor: Element | null = el; cursor; cursor = cursor.parentElement) {
      if (isHiddenByStyle(cursor) || isScreenReaderOnly(cursor)) return false;
    }
    return true;
  };
  const isAriaHidden = (el: Element): boolean => {
    for (let cursor: Element | null = el; cursor; cursor = cursor.parentElement) {
      if (cursor.getAttribute('aria-hidden') === 'true') return true;
    }
    return false;
  };
  const inOverlay = (el: Element): boolean => el.closest(overlaySelector) !== null;
  const inFixedLayer = (el: Element): boolean => {
    for (let cursor: Element | null = el; cursor; cursor = cursor.parentElement) {
      if (window.getComputedStyle(cursor).position === 'fixed') return true;
    }
    return false;
  };
  const part = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const testid = el.getAttribute('data-testid');
    if (testid && testid !== 'figure') return `${tag}[data-testid="${testid}"]`;
    const figure = el.getAttribute('data-figure') ?? el.getAttribute('data-figure-id');
    if (figure) return `${tag}[data-figure="${figure}"]`;
    if (el.id) return `${tag}#${el.id}`;
    const label = el.getAttribute('aria-label');
    if (label) return `${tag}[aria-label="${label.slice(0, 30)}"]`;
    const role = el.getAttribute('role');
    const classes = Array.from(el.classList)
      .filter((c) => !/[:[/]/.test(c))
      .slice(0, 2);
    let out =
      tag + (role ? `[role=${role}]` : '') + (classes.length ? `.${classes.join('.')}` : '');
    const parent = el.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
      if (same.length > 1) out += `:nth-of-type(${same.indexOf(el) + 1})`;
    }
    return out;
  };
  const describe = (el: Element): string => {
    const parts: string[] = [];
    let cursor: Element | null = el;
    while (cursor && cursor !== document.body && parts.length < 3) {
      const p = part(cursor);
      parts.unshift(p);
      if (/#|\[data-testid|\[data-figure/.test(p)) break;
      cursor = cursor.parentElement;
    }
    return parts.join(' > ');
  };
  const toRect = (rect: DOMRect) => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  /** The visible part of `rect` once every overflow-clipping ancestor of `el` is applied. An
   *  element's own overflow clips its CONTENT (`includeSelf`, for the text inside it), never
   *  its own border box. */
  const clipToAncestors = (el: Element, rect: DOMRect, includeSelf = false) => {
    let x = rect.x;
    let y = rect.y;
    let right = rect.x + rect.width;
    let bottom = rect.y + rect.height;
    const start = includeSelf ? el : el.parentElement;
    for (let cursor = start; cursor; cursor = cursor.parentElement) {
      const style = window.getComputedStyle(cursor);
      const clipsX = style.overflowX !== 'visible';
      const clipsY = style.overflowY !== 'visible';
      if (!clipsX && !clipsY) continue;
      const box = cursor.getBoundingClientRect();
      if (clipsX) {
        x = Math.max(x, box.x);
        right = Math.min(right, box.x + box.width);
      }
      if (clipsY) {
        y = Math.max(y, box.y);
        bottom = Math.min(bottom, box.y + box.height);
      }
    }
    if (right <= x || bottom <= y) return null;
    return { x, y, width: right - x, height: bottom - y };
  };
  /** Every scrolled box on the page, so a sweep that scrolls can put it all back. */
  const snapshotScroll = () =>
    [document.documentElement, ...Array.from(document.body.querySelectorAll('*'))]
      .filter((el) => el.scrollTop !== 0 || el.scrollLeft !== 0)
      .map((el) => ({ el, top: el.scrollTop, left: el.scrollLeft }));
  const restoreScroll = (snapshot: { el: Element; top: number; left: number }[]) => {
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (el.scrollTop !== 0 || el.scrollLeft !== 0) el.scrollTo(0, 0);
    }
    for (const { el, top, left } of snapshot) el.scrollTo(left, top);
    window.scrollTo(0, 0);
  };
  return {
    isVisible,
    isAriaHidden,
    inOverlay,
    inFixedLayer,
    describe,
    toRect,
    clipToAncestors,
    snapshotScroll,
    restoreScroll,
  };
}

async function installPageHelpers(page: Page): Promise<void> {
  // A string script, not a closure: `pageHelpers` is plain JS once Playwright strips the types
  // and the page needs its SOURCE, which a closure passed to evaluate would not carry.
  await page.evaluate(
    `window.__l1vHelpers = (${pageHelpers.toString()})(${JSON.stringify(OVERLAY_SELECTOR)})`,
  );
}

/* ------------------------------------------------------------------------- */
/* In-page collectors — each runs inside page.evaluate and is self-contained  */
/* ------------------------------------------------------------------------- */

async function collectVisualNodes(page: Page): Promise<VisualNode[]> {
  return page.evaluate(
    ({ controlSelector, imageSelector, overlaySelector }) => {
      const helpers = window.__l1vHelpers;
      if (!helpers) throw new Error('page helpers not installed');
      const nodes: VisualNode[] = [];
      let counter = 0;
      const visit = (el: Element): void => {
        const order = counter;
        counter += 1;
        const tag = el.tagName.toLowerCase();
        const skipSubtree =
          tag === 'script' ||
          tag === 'style' ||
          tag === 'noscript' ||
          tag === 'template' ||
          el.matches(overlaySelector) ||
          !helpers.isVisible(el) ||
          helpers.isAriaHidden(el);
        if (skipSubtree) {
          // The subtree still owns its indexes, so every other range stays consistent.
          counter += el.getElementsByTagName('*').length;
          return;
        }
        const layered = helpers.inFixedLayer(el);
        const isImage = el.matches(imageSelector);
        const isControl = el.matches(controlSelector);
        let own: VisualNode | null = null;
        if (isImage || isControl) {
          const clipped = helpers.clipToAncestors(el, el.getBoundingClientRect());
          if (clipped) {
            own = {
              kind: isControl ? 'control' : 'image',
              selector: helpers.describe(el),
              rects: [clipped],
              order,
              end: order + 1,
              layered,
              text: isControl ? (el.textContent ?? '').trim().slice(0, 40) : undefined,
            };
            nodes.push(own);
          }
        }
        if (isImage) {
          counter += el.getElementsByTagName('*').length;
        } else {
          const rects: Rect[] = [];
          let text = '';
          for (const child of Array.from(el.childNodes)) {
            if (child.nodeType !== Node.TEXT_NODE) continue;
            const content = child.textContent ?? '';
            if (content.trim().length === 0) continue;
            const range = document.createRange();
            range.selectNodeContents(child);
            for (const line of Array.from(range.getClientRects())) {
              if (line.width < 1 || line.height < 1) continue;
              const clipped = helpers.clipToAncestors(el, line, true);
              if (clipped) rects.push(clipped);
            }
            text += content;
          }
          if (rects.length > 0) {
            nodes.push({
              kind: 'text',
              selector: helpers.describe(el),
              rects,
              order,
              end: order + 1,
              layered,
              text: text.replace(/\s+/g, ' ').trim().slice(0, 40),
            });
          }
          for (const child of Array.from(el.children)) visit(child);
        }
        if (own) own.end = counter;
      };
      visit(document.body);
      return nodes;
    },
    {
      controlSelector: CONTROL_SELECTOR,
      imageSelector: IMAGE_SELECTOR,
      overlaySelector: OVERLAY_SELECTOR,
    },
  );
}

async function collectClippedText(
  page: Page,
): Promise<{ facts: ClippedTextFact[]; textElements: number }> {
  return page.evaluate(
    ({ tolerance }) => {
      const helpers = window.__l1vHelpers;
      if (!helpers) throw new Error('page helpers not installed');
      const facts: ClippedTextFact[] = [];
      let textElements = 0;
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        if (el.closest('nextjs-portal, script, style')) continue;
        const hasText = Array.from(el.childNodes).some(
          (child) =>
            child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim().length > 0,
        );
        if (!hasText || !helpers.isVisible(el) || helpers.isAriaHidden(el)) continue;
        const box = el as HTMLElement;
        // An inline element has no box of its own to clip against.
        if (box.clientWidth === 0 && box.clientHeight === 0) continue;
        textElements += 1;
        const style = window.getComputedStyle(el);
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        const scrollable = (axis: string) => axis === 'auto' || axis === 'scroll';
        if (
          box.scrollWidth > box.clientWidth + tolerance &&
          style.textOverflow !== 'ellipsis' &&
          !scrollable(style.overflowX)
        ) {
          facts.push({
            selector: helpers.describe(el),
            bbox: helpers.toRect(el.getBoundingClientRect()),
            axis: 'x',
            scroll: box.scrollWidth,
            client: box.clientWidth,
            overflow: style.overflowX,
            text,
          });
        }
        const lineClamp = style.getPropertyValue('-webkit-line-clamp');
        if (
          box.scrollHeight > box.clientHeight + tolerance &&
          (style.overflowY === 'hidden' || style.overflowY === 'clip') &&
          (lineClamp === '' || lineClamp === 'none')
        ) {
          facts.push({
            selector: helpers.describe(el),
            bbox: helpers.toRect(el.getBoundingClientRect()),
            axis: 'y',
            scroll: box.scrollHeight,
            client: box.clientHeight,
            overflow: style.overflowY,
            text,
          });
        }
      }
      return { facts, textElements };
    },
    { tolerance: CLIP_TOLERANCE_PX },
  );
}

async function collectControls(page: Page, maxControls: number): Promise<ControlFact[]> {
  return page.evaluate(
    ({ controlSelector, maxControls }) => {
      const helpers = window.__l1vHelpers;
      if (!helpers) throw new Error('page helpers not installed');
      const facts: ControlFact[] = [];
      const scrollSnapshot = helpers.snapshotScroll();
      const controls = Array.from(document.body.querySelectorAll(controlSelector)).filter(
        (el) =>
          !el.closest('nextjs-portal') &&
          helpers.isVisible(el) &&
          !helpers.isAriaHidden(el) &&
          !el.hasAttribute('disabled') &&
          el.getAttribute('aria-disabled') !== 'true' &&
          !el.closest('[inert]') &&
          window.getComputedStyle(el).pointerEvents !== 'none',
      );
      for (const el of controls.slice(0, maxControls)) {
        const bbox = helpers.toRect(el.getBoundingClientRect());
        const style = window.getComputedStyle(el);
        const parentText = Array.from(el.parentElement?.childNodes ?? []).some(
          (child) =>
            child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim().length > 0,
        );
        const inlineTextLink = el.tagName === 'A' && style.display === 'inline' && parentText;

        let rect = el.getBoundingClientRect();
        const outside =
          rect.bottom < 0 ||
          rect.right < 0 ||
          rect.top > window.innerHeight ||
          rect.left > window.innerWidth;
        if (outside) {
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
          rect = el.getBoundingClientRect();
        }
        const cx = Math.round(rect.left + rect.width / 2);
        const cy = Math.round(rect.top + rect.height / 2);
        let covered: ControlFact['covered'] = null;
        if (cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight) {
          const top = document.elementsFromPoint(cx, cy)[0] ?? null;
          if (
            top &&
            top.tagName.toLowerCase() !== 'nextjs-portal' &&
            top !== el &&
            !el.contains(top)
          ) {
            covered = { by: helpers.describe(top), at: [cx, cy] };
          }
        }
        facts.push({ selector: helpers.describe(el), bbox, inlineTextLink, covered });
      }
      helpers.restoreScroll(scrollSnapshot);
      return facts;
    },
    { controlSelector: CONTROL_SELECTOR, maxControls },
  );
}

function measureHorizontalScroll(): HorizontalScrollFact {
  const root = document.documentElement;
  const clientWidth = root.clientWidth;
  const scrollWidth = Math.max(root.scrollWidth, document.body.scrollWidth);
  let widest: ElementFact | null = null;
  let widestRight = clientWidth;
  if (scrollWidth > clientWidth) {
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (el.closest('nextjs-portal')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.right <= widestRight) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed')
        continue;
      widestRight = rect.right;
      const testid = el.getAttribute('data-testid');
      const classes = Array.from(el.classList)
        .filter((c) => !/[:[/]/.test(c))
        .slice(0, 2);
      const name = testid
        ? `[data-testid="${testid}"]`
        : el.id
          ? `#${el.id}`
          : classes.length
            ? `.${classes.join('.')}`
            : '';
      widest = {
        selector: el.tagName.toLowerCase() + name,
        bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    }
  }
  return { scrollWidth, clientWidth, widest };
}

async function runAxeContrast(): Promise<ContrastFact> {
  const axe = window.axe;
  if (!axe) throw new Error('axe did not attach to window');
  const results = await axe.run(
    { exclude: ['nextjs-portal'] },
    {
      runOnly: { type: 'rule', values: ['color-contrast', 'link-in-text-block'] },
      resultTypes: ['violations', 'incomplete'],
    },
  );
  const violations: ContrastFact['violations'] = [];
  for (const result of results.violations) {
    for (const node of result.nodes) {
      const selector = node.target.join(' ');
      let bbox: Rect = { x: 0, y: 0, width: 0, height: 0 };
      try {
        const el = document.querySelector(selector);
        if (el) {
          const rect = el.getBoundingClientRect();
          bbox = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
      } catch {
        // an axe selector querySelector rejects (shadow parts): keep the empty bbox
      }
      const data = node.any[0]?.data as
        | {
            fgColor?: string;
            bgColor?: string;
            contrastRatio?: number;
            expectedContrastRatio?: string;
            fontSize?: string;
            fontWeight?: string;
          }
        | undefined;
      const detail = data?.contrastRatio
        ? `${data.contrastRatio}:1 < ${data.expectedContrastRatio ?? 'AA'} (${data.fgColor ?? '?'} on ${data.bgColor ?? '?'}, ${data.fontSize ?? '?'} ${data.fontWeight ?? ''})`.trim()
        : (node.any[0]?.message ?? node.failureSummary ?? 'contrast below AA')
            .replace(/\s+/g, ' ')
            .slice(0, 160);
      violations.push({ selector, bbox, rule: result.id, detail });
    }
  }
  const undetermined = results.incomplete.reduce((count, result) => count + result.nodes.length, 0);
  return { violations, undetermined };
}

function collectFigures(): FigureFact[] {
  const facts: FigureFact[] = [];
  for (const el of Array.from(document.querySelectorAll('[data-figure], [data-figure-id]'))) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const key = el.getAttribute('data-figure') ?? el.getAttribute('data-figure-id') ?? '';
    facts.push({
      selector: `${el.tagName.toLowerCase()}[data-figure="${key}"]`,
      bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      text: el.textContent ?? '',
      currencyAttr: el.getAttribute('data-currency') ?? el.getAttribute('data-figure-currency'),
      unit: el.getAttribute('data-figure-unit'),
    });
  }
  return facts;
}

function collectTablists(): TablistFact[] {
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const colour = (value: string) =>
    value === 'rgba(0, 0, 0, 0)' || value === 'transparent' ? 'none' : value;
  const pseudo = (el: Element, which: '::before' | '::after') => {
    const style = window.getComputedStyle(el, which);
    if (style.content === 'none' || style.content === '') return 'none';
    if (Number(style.opacity) === 0) return 'hidden';
    return `${colour(style.backgroundColor)}/${style.height}/${style.width}`;
  };
  const signature = (el: Element) => {
    const style = window.getComputedStyle(el);
    return [
      `bg=${colour(style.backgroundColor)}`,
      `bb=${style.borderBottomWidth}/${colour(style.borderBottomColor)}`,
      `shadow=${style.boxShadow}`,
      `color=${style.color}`,
      `weight=${style.fontWeight}`,
      `after=${pseudo(el, '::after')}`,
      `before=${pseudo(el, '::before')}`,
    ].join(' ');
  };
  const name = (el: Element) => {
    const testid = el.getAttribute('data-testid');
    if (testid) return `[data-testid="${testid}"]`;
    if (el.id) return `#${el.id}`;
    const label = (el.getAttribute('aria-label') ?? el.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return label ? `[aria-label="${label.slice(0, 30)}"]` : el.tagName.toLowerCase();
  };
  const panelsLabelledBy = Array.from(document.querySelectorAll('[role="tabpanel"]'))
    .filter(visible)
    .map((panel) => panel.getAttribute('aria-labelledby'))
    .filter((id): id is string => Boolean(id));

  const out: TablistFact[] = [];
  for (const list of Array.from(document.querySelectorAll('[role="tablist"]'))) {
    if (!visible(list) || list.closest('nextjs-portal')) continue;
    const tabs = Array.from(list.querySelectorAll('[role="tab"]')).filter(visible);
    const facts = tabs.map((tab) => {
      const rect = tab.getBoundingClientRect();
      return {
        selector: `${tab.tagName.toLowerCase()}[role=tab]${name(tab)}`,
        bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        label: (tab.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30),
        ariaSelected: tab.getAttribute('aria-selected') === 'true',
        signature: signature(tab),
        controls: tab.getAttribute('aria-controls'),
      };
    });
    const tabIds = tabs.map((tab) => tab.id || null);
    out.push({
      selector: `[role=tablist]${name(list)}`,
      tabs: facts,
      tabIds,
      visiblePanelLabelledBy: panelsLabelledBy.filter((id) => tabIds.includes(id)),
    });
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* Rule (h): tooltips and popovers after hover / focus                        */
/* ------------------------------------------------------------------------- */

type FloatingFact = ElementFact & { text: string };

function collectFloating(floatingSelector: string): FloatingFact[] {
  return Array.from(document.querySelectorAll(floatingSelector))
    .filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    })
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const role = el.getAttribute('role');
      return {
        selector: `${el.tagName.toLowerCase()}[${role ? `role=${role}` : `data-slot=${el.getAttribute('data-slot')}`}]`,
        bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
      };
    });
}

async function probeTooltips(
  page: Page,
  probes: number,
  viewport: { width: number; height: number },
  violations: VisualViolation[],
): Promise<number> {
  const triggers = page.locator(TOOLTIP_TRIGGER_SELECTOR).locator('visible=true');
  const count = Math.min(await triggers.count(), probes);
  let probed = 0;
  for (let i = 0; i < count; i += 1) {
    const trigger = triggers.nth(i);
    const selector = await trigger
      .evaluate((el) => {
        const testid = el.getAttribute('data-testid');
        const label = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 30);
        const name = testid ? `[data-testid="${testid}"]` : label ? `[aria-label="${label}"]` : '';
        return `${el.tagName.toLowerCase()}${name}`;
      })
      .catch(() => `trigger #${i}`);
    for (const mode of ['hover', 'focus'] as const) {
      try {
        if (mode === 'hover') await trigger.hover({ timeout: 3_000 });
        else await trigger.focus({ timeout: 3_000 });
      } catch {
        continue;
      }
      await page.waitForTimeout(600);
      const floating = await page.evaluate(collectFloating, FLOATING_SELECTOR).catch(() => []);
      for (const popup of floating) {
        const outside = sidesOutsideViewport(popup.bbox, viewport.width, viewport.height);
        if (outside.length === 0) continue;
        violations.push(
          violation(
            'tooltip-offscreen',
            `${selector} → ${popup.selector}`,
            popup.bbox,
            `after ${mode}, "${popup.text}" ${formatRect(popup.bbox)} leaves the ${viewport.width}×${viewport.height} viewport: ${outside.join(', ')}`,
          ),
        );
      }
      // Escape only when something opened: on a bare page it would dismiss a dialog that is
      // part of the surface.
      if (floating.length > 0) await page.keyboard.press('Escape').catch(() => undefined);
      await parkMouse(page, viewport);
      await page
        .evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
        .catch(() => undefined);
      await page.waitForTimeout(150);
    }
    probed += 1;
  }
  return probed;
}
