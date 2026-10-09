// The pure half of the L1V geometric detector (docs/perfplus-campaign/04-visual-and-platforms.md
// "Oráculo visual", docs/perfplus-design-intent.md "Reglas globales" 2 and 8): bounding-box
// math, the money / currency matchers, the tab-indicator reducer, the severity map and the
// report formatter. No DOM, no Playwright — `bun test visualInvariants.test.ts` covers it.
// `visualInvariants.ts` collects the raw facts from the page and hands them here.
//
// The thresholds are the intent's, not tunable knobs: 24 px targets, CLS 0.1, AA contrast.

/* ------------------------------------------------------------------------- */
/* Rules and violations                                                       */
/* ------------------------------------------------------------------------- */

export const VISUAL_RULES = [
  'overlap',
  'clipped-text',
  'covered-control',
  'tap-target',
  'horizontal-scroll',
  'layout-shift',
  'contrast',
  'tooltip-offscreen',
  'money-currency',
  'selected-tab-indicator',
] as const;

export type VisualRule = (typeof VISUAL_RULES)[number];

export type VisualSeverity = 'blocker' | 'major' | 'minor';

export type Rect = { x: number; y: number; width: number; height: number };

export type VisualViolation = {
  rule: VisualRule;
  /** A short CSS-ish path to the offending element (or the first of a pair). */
  selector: string;
  bbox: Rect;
  detail: string;
  severity: VisualSeverity;
};

/** The intent treats every rule as a failure; severity only orders the triage. A control the
 *  user cannot reach, a tab that lies about what is shown and money without its currency break
 *  the product's promise outright; the geometric breaks degrade it; a short tap target is the
 *  cheapest to fix and the least likely to hide a data lie. */
export const SEVERITY_BY_RULE: Record<VisualRule, VisualSeverity> = {
  'covered-control': 'blocker',
  'selected-tab-indicator': 'blocker',
  'money-currency': 'blocker',
  overlap: 'major',
  'clipped-text': 'major',
  'horizontal-scroll': 'major',
  'layout-shift': 'major',
  contrast: 'major',
  'tooltip-offscreen': 'major',
  'tap-target': 'minor',
};

export function severityOf(rule: VisualRule): VisualSeverity {
  return SEVERITY_BY_RULE[rule];
}

export function violation(
  rule: VisualRule,
  selector: string,
  bbox: Rect,
  detail: string,
): VisualViolation {
  return { rule, selector, bbox, detail, severity: severityOf(rule) };
}

/* ------------------------------------------------------------------------- */
/* Thresholds — the intent's numbers                                          */
/* ------------------------------------------------------------------------- */

/** Design intent, global rule 8: targets ≥ 24 px. */
export const MIN_TAP_TARGET_PX = 24;
/** Design intent, global rule 8: CLS ≤ 0.1. */
export const MAX_LAYOUT_SHIFT = 0.1;
/** Two boxes that share a border (a `-ml-px` button group, sub-pixel rounding) do not overlap.
 *  One CSS pixel of intersection on an axis is rounding, not a collision. */
export const OVERLAP_TOLERANCE_PX = 1;
/** `scrollWidth > clientWidth + 1`: the intent's own definition of clipped text. */
export const CLIP_TOLERANCE_PX = 1;

/* ------------------------------------------------------------------------- */
/* Rect math                                                                  */
/* ------------------------------------------------------------------------- */

export function rectRight(rect: Rect): number {
  return rect.x + rect.width;
}

export function rectBottom(rect: Rect): number {
  return rect.y + rect.height;
}

/** The intersection of two rects, or null when they do not meet. */
export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(rectRight(a), rectRight(b));
  const bottom = Math.min(rectBottom(a), rectBottom(b));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** True when the two rects share more than `tolerance` px on BOTH axes. */
export function overlapsBeyondTolerance(a: Rect, b: Rect, tolerance = OVERLAP_TOLERANCE_PX) {
  const shared = intersection(a, b);
  return shared !== null && shared.width > tolerance && shared.height > tolerance;
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    rectRight(inner) <= rectRight(outer) &&
    rectBottom(inner) <= rectBottom(outer)
  );
}

/** The rect that bounds every rect given (the empty rect for none). */
export function union(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let x = Number.POSITIVE_INFINITY;
  let y = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    x = Math.min(x, rect.x);
    y = Math.min(y, rect.y);
    right = Math.max(right, rectRight(rect));
    bottom = Math.max(bottom, rectBottom(rect));
  }
  return { x, y, width: right - x, height: bottom - y };
}

export function roundRect(rect: Rect): Rect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export function formatRect(rect: Rect): string {
  const r = roundRect(rect);
  return `${r.width}×${r.height}@${r.x},${r.y}`;
}

/** The sides of `rect` that leave a `width × height` viewport, or [] when it is inside. */
export function sidesOutsideViewport(rect: Rect, width: number, height: number): string[] {
  const outside: string[] = [];
  if (rect.x < 0) outside.push(`left by ${Math.round(-rect.x)}px`);
  if (rect.y < 0) outside.push(`top by ${Math.round(-rect.y)}px`);
  if (rectRight(rect) > width) outside.push(`right by ${Math.round(rectRight(rect) - width)}px`);
  if (rectBottom(rect) > height)
    outside.push(`bottom by ${Math.round(rectBottom(rect) - height)}px`);
  return outside;
}

/* ------------------------------------------------------------------------- */
/* Rule (a): overlap between text, controls and images                        */
/* ------------------------------------------------------------------------- */

export type VisualNodeKind = 'text' | 'control' | 'image';

/** One visible thing on the page, as the in-page collector reports it. `order` is the
 *  element's pre-order index and `end` the index after its last descendant, so ancestry is a
 *  range test with no DOM in sight. Text nodes carry their parent's span and one rect per line
 *  box, so wrapped prose is not a block-sized box that "overlaps" everything beside it. */
export type VisualNode = {
  kind: VisualNodeKind;
  selector: string;
  rects: Rect[];
  order: number;
  end: number;
  /** A `position: fixed` element or a descendant of one: a layer, not a neighbour. */
  layered: boolean;
  text?: string;
};

export function isAncestorOrSelf(
  a: Pick<VisualNode, 'order' | 'end'>,
  b: Pick<VisualNode, 'order' | 'end'>,
): boolean {
  return a.order <= b.order && b.order < a.end;
}

export function related(
  a: Pick<VisualNode, 'order' | 'end'>,
  b: Pick<VisualNode, 'order' | 'end'>,
): boolean {
  return isAncestorOrSelf(a, b) || isAncestorOrSelf(b, a);
}

/** Every pair of unrelated nodes whose line boxes intersect beyond the tolerance. A pair is
 *  reported once; the FIRST node names the violation and the detail names the second. Two
 *  text nodes under the same parent are compared too — a title and its subtitle collide when a
 *  line-height goes wrong. A layered node (fixed) never collides with the content it floats
 *  over; `covered-control` is the rule that asks whether a float hides a control. */
export function findOverlaps(
  nodes: readonly VisualNode[],
  tolerance = OVERLAP_TOLERANCE_PX,
): VisualViolation[] {
  const found: VisualViolation[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    if (a.layered) continue;
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      if (b.layered || related(a, b)) continue;
      const shared = firstSharedRect(a.rects, b.rects, tolerance);
      if (!shared) continue;
      found.push(
        violation(
          'overlap',
          a.selector,
          shared,
          `${a.kind} ${describeNode(a)} intersects ${b.kind} ${describeNode(b)} by ${formatRect(shared)}`,
        ),
      );
    }
  }
  return found;
}

function firstSharedRect(a: readonly Rect[], b: readonly Rect[], tolerance: number): Rect | null {
  for (const ra of a) {
    for (const rb of b) {
      if (overlapsBeyondTolerance(ra, rb, tolerance)) return intersection(ra, rb);
    }
  }
  return null;
}

function describeNode(node: VisualNode): string {
  const text = node.text?.trim();
  return text ? `${node.selector} "${text.slice(0, 40)}"` : node.selector;
}

/* ------------------------------------------------------------------------- */
/* Rule (d): tap targets                                                      */
/* ------------------------------------------------------------------------- */

/** The axis a control falls short on, or null when it meets the floor on both. */
export function tapTargetShortfall(rect: Rect, min = MIN_TAP_TARGET_PX): string | null {
  const short: string[] = [];
  if (rect.width < min) short.push(`width ${Math.round(rect.width)}px`);
  if (rect.height < min) short.push(`height ${Math.round(rect.height)}px`);
  return short.length > 0 ? `${short.join(', ')} < ${min}px` : null;
}

/* ------------------------------------------------------------------------- */
/* Rule (i): money without its currency                                       */
/* ------------------------------------------------------------------------- */

/** ISO 4217 codes the product formats in (account currencies seen in Continuum brands) plus the
 *  majors. A bare `\b[A-Z]{3}\b` would accept CPA, CPC, CPM and CTR as currencies. */
export const CURRENCY_CODES: ReadonlySet<string> = new Set([
  'MXN',
  'USD',
  'EUR',
  'GBP',
  'ARS',
  'BRL',
  'CLP',
  'COP',
  'PEN',
  'UYU',
  'CAD',
  'AUD',
  'NZD',
  'JPY',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'INR',
  'SGD',
  'HKD',
  'ZAR',
  'TRY',
  'ILS',
  'AED',
  'SAR',
  'KRW',
  'CNY',
  'PHP',
  'IDR',
  'MYR',
  'THB',
  'VND',
  'EGP',
  'NGN',
  'KES',
  'DOP',
  'GTQ',
  'CRC',
  'PAB',
  'BOB',
  'PYG',
  'VES',
  'HNL',
  'NIO',
]);

/** A currency symbol glued to a number: `$1,234`, `1.234,56 €`, `MX$ 38.59`, `-$12`. */
export const MONEY_SYMBOL_PATTERN =
  /(?:^|[^A-Za-z])(?:[A-Z]{0,2}\$|€|£|¥|₡|₱)\s?-?\d|\d\s?(?:\$|€|£|¥)/;

/** The figure units the Optimizer and Jaina mark money with (`data-figure-unit`). */
export const MONEY_UNITS: ReadonlySet<string> = new Set(['currency', 'per-period', 'per-month']);

export type FigureFact = {
  selector: string;
  bbox: Rect;
  text: string;
  /** `data-currency` or `data-figure-currency`, as written on the node (`none` = no currency). */
  currencyAttr: string | null;
  /** `data-figure-unit`, when the node carries one. */
  unit: string | null;
};

export function looksLikeMoney(text: string, unit: string | null): boolean {
  if (unit && MONEY_UNITS.has(unit)) return true;
  if (unit && !MONEY_UNITS.has(unit)) return false;
  return MONEY_SYMBOL_PATTERN.test(text);
}

/** The ISO code the node names — its attribute when that is a real code, else a code in its
 *  own text — or null. `none` on the attribute means "formatted without a currency", which the
 *  text may still contradict with a `$`. */
export function currencyNamed(text: string, currencyAttr: string | null): string | null {
  const attr = currencyAttr?.trim().toUpperCase();
  if (attr && CURRENCY_CODES.has(attr)) return attr;
  for (const token of text.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? []) {
    if (CURRENCY_CODES.has(token)) return token;
  }
  return null;
}

/** Intent rule 2: every money figure carries its currency in the same node. A figure the unit
 *  marks as money, or whose text shows a currency symbol, must name a code either on the node
 *  (`data-currency` / `data-figure-currency`) or in its own text. An empty figure ("—") is not
 *  money. */
export function moneyViolations(figures: readonly FigureFact[]): VisualViolation[] {
  const found: VisualViolation[] = [];
  for (const figure of figures) {
    const text = figure.text.replace(/\s+/g, ' ').trim();
    if (!/\d/.test(text)) continue;
    if (!looksLikeMoney(text, figure.unit)) continue;
    if (currencyNamed(text, figure.currencyAttr)) continue;
    found.push(
      violation(
        'money-currency',
        figure.selector,
        figure.bbox,
        `"${text.slice(0, 60)}" reads as money (unit=${figure.unit ?? 'n/a'}, currency attr=${figure.currencyAttr ?? 'missing'}) with no ISO code on the node`,
      ),
    );
  }
  return found;
}

/* ------------------------------------------------------------------------- */
/* Rule (j): the highlighted tab is the selected tab                          */
/* ------------------------------------------------------------------------- */

export type TabFact = {
  selector: string;
  bbox: Rect;
  label: string;
  ariaSelected: boolean;
  /** The computed-style signature of what makes a tab look active: background, border-bottom,
   *  underline (::after), shadow, text colour and weight, joined into one string. */
  signature: string;
  /** The id of the panel this tab controls (`aria-controls`), when the tab names one. */
  controls: string | null;
};

export type TablistFact = {
  selector: string;
  tabs: TabFact[];
  /** Ids of the visible `[role=tabpanel]`s in the document, by `aria-labelledby` → tab id. */
  visiblePanelLabelledBy: string[];
  tabIds: (string | null)[];
};

/** Among tabs that style one of them differently, the odd ones out are the highlighted. With
 *  two tabs each is the other's odd one, so there the signature says nothing on its own. */
export function highlightedIndexes(signatures: readonly string[]): number[] {
  if (signatures.length < 3) return [];
  const counts = new Map<string, number>();
  for (const signature of signatures) counts.set(signature, (counts.get(signature) ?? 0) + 1);
  const majority = Math.max(...counts.values());
  if (majority === 1) return [];
  return signatures.flatMap((signature, index) =>
    (counts.get(signature) ?? 0) < majority ? [index] : [],
  );
}

/** Two checks per tablist: the tab that LOOKS selected (styled unlike its siblings) must be the
 *  `aria-selected="true"` one, and the panel on screen must be the one that tab controls. The
 *  first is the geometric half of the Portfolios finding (a trigger highlighted while another
 *  panel shows); the second catches the same lie from the panel's side. */
export function tabIndicatorViolations(tablists: readonly TablistFact[]): VisualViolation[] {
  const found: VisualViolation[] = [];
  for (const tablist of tablists) {
    const tabs = tablist.tabs;
    if (tabs.length < 2) continue;
    const selected = tabs.filter((tab) => tab.ariaSelected);
    const selectedLabels = selected.map((tab) => `"${tab.label}"`).join(', ') || 'none';
    const highlighted = highlightedIndexes(tabs.map((tab) => tab.signature)).map((i) => tabs[i]);

    for (const tab of highlighted) {
      if (tab.ariaSelected) continue;
      found.push(
        violation(
          'selected-tab-indicator',
          tab.selector,
          tab.bbox,
          `tab "${tab.label}" is styled as the active tab while aria-selected is on ${selectedLabels}`,
        ),
      );
    }
    if (highlighted.length === 0 && tabs.length >= 3 && selected.length === 1) {
      found.push(
        violation(
          'selected-tab-indicator',
          selected[0].selector,
          selected[0].bbox,
          `tab "${selected[0].label}" is aria-selected but styled like every sibling (no visible indicator)`,
        ),
      );
    }

    const selectedIds = tabs.flatMap((tab, index) =>
      tab.ariaSelected && tablist.tabIds[index] ? [tablist.tabIds[index] as string] : [],
    );
    for (const panelLabel of tablist.visiblePanelLabelledBy) {
      const owner = tablist.tabIds.indexOf(panelLabel);
      if (owner === -1 || selectedIds.includes(panelLabel)) continue;
      const tab = tabs[owner];
      found.push(
        violation(
          'selected-tab-indicator',
          tab.selector,
          tab.bbox,
          `the visible panel belongs to tab "${tab.label}" while aria-selected is on ${selectedLabels}`,
        ),
      );
    }
  }
  return found;
}

/* ------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* ------------------------------------------------------------------------- */

export function groupByRule(
  violations: readonly VisualViolation[],
): Map<VisualRule, VisualViolation[]> {
  const grouped = new Map<VisualRule, VisualViolation[]>();
  for (const rule of VISUAL_RULES) {
    const hits = violations.filter((v) => v.rule === rule);
    if (hits.length > 0) grouped.set(rule, hits);
  }
  return grouped;
}

/** The message a failing audit carries: label, rule, selector, bbox and detail, one line per
 *  violation, so the list reporter names everything at once. */
export function formatVisualViolations(
  label: string,
  violations: readonly VisualViolation[],
): string {
  return violations
    .map((v) => `[${label}] ${v.rule} ${v.selector} ${formatRect(v.bbox)}: ${v.detail}`)
    .join('\n');
}
