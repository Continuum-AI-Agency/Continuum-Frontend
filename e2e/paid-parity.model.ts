// The parity rules, pure — what `paid:parity:e2e:bench` grades every `[data-testid=figure]`
// node against, kept free of Playwright so `paid-parity.model.test.ts` can pin each rule on
// fixtures shaped like the real payloads.
//
// THE RULES ARE RE-DERIVED HERE, NOT IMPORTED. `formatCurrency`, `perPeriod` and
// `windowFor` are the code under test; a bench that imports them grades the formatter with
// its own copy and cannot see it drift. So the symbol rule, the digit rule, the ×30 month and
// the window spans are written out again below, from the product's stated contract
// (format.ts header, contracts/optimization/range.ts, account-strategy.ts `perPeriod`). If
// the product changes one of them on purpose, this file changes with it — loudly.
//
// A node carries five attributes (see `figureProps` in
// src/components/paid-media/optimizer/format.ts): the key, the raw figure, the currency the
// site formatted with (`none` when unknown), the window it was computed over and the unit.
// Four rules read the node alone; the fifth reads it against the payload the page fetched.

export type FigureUnit =
  | 'currency'
  | 'per-period'
  | 'per-month'
  | 'percent'
  | 'percent-signed'
  | 'count'
  | 'sentence';

export type FigureNode = {
  key: string;
  /** Null when the site rendered a placeholder (`—`) and declared no figure. */
  raw: number | null;
  /** An ISO code, or `none`. */
  currency: string;
  window: string;
  unit: FigureUnit;
  /** `header` when the node sits in a table column whose header names the code, so the cell
   *  prints the symbol alone ("CPL · MXN" over "$99.57"); `text` otherwise. */
  codeIn: 'text' | 'header';
  text: string;
};

export type Grade = 'PASS' | 'WARN' | 'SKIP' | 'FAIL';
export type Rule = 'format' | 'symbol' | 'day-month' | 'window' | 'payload';
export type RuleResult = { rule: Rule; key: string; grade: Grade; detail: string };

/** What the payload says a node's raw figure should be. */
export type PayloadExpectation =
  | {
      kind: 'value';
      /** Where in the captured payload the figure was read from, for the report. */
      path: string;
      value: number | null;
      /** How many distinct days the mapper summed, when the figure is a window total. */
      daysSummed?: number;
    }
  | { kind: 'sentence'; path: string; figures: Record<string, number | null> }
  | { kind: 'unmapped'; reason: string };

const DAYS_PER_MONTH = 30;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const MONEY_TOLERANCE = 0.005;

/** The span a window name covers. `none` and anything unknown have no span. */
export function windowSpanDays(window: string): number | null {
  const match = /^d(\d+)$/.exec(window);
  if (!match) return null;
  const days = Number(match[1]);
  return Number.isInteger(days) && days > 0 ? days : null;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The currency's own symbol, from the platform (never from the product's formatter): "$"
 *  for MXN and USD, "€" for EUR; null when it has none beyond its code. */
export function currencySymbolOf(currency: string): string | null {
  if (!ISO_CURRENCY.test(currency)) return null;
  try {
    const part = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value;
    return part && part !== currency && !ISO_CURRENCY.test(part) ? part : null;
  } catch {
    return null;
  }
}

/** The product's money rule (M1, 2026-10-13), restated: grouping, 2 decimals under 100 and
 *  0 at or above, the sign outside the unit, the currency's symbol before the figure and its
 *  ISO code after it for EVERY known currency ("$85.47 MXN", "$85.47 USD"), the code alone
 *  for a currency with no symbol, and a bare figure when the currency is unknown. `codeIn:
 *  'header'` drops the code for a table cell whose column header names it. */
export function formatMoney(
  value: number,
  currency: string,
  codeIn: FigureNode['codeIn'] = 'text',
): string {
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  const body = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value));
  const sign = value < 0 ? '-' : '';
  if (!ISO_CURRENCY.test(currency)) return `${sign}${body}`;
  const symbol = currencySymbolOf(currency) ?? '';
  return codeIn === 'header' ? `${sign}${symbol}${body}` : `${sign}${symbol}${body} ${currency}`;
}

const COUNT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** The text a node must show for its raw figure, or null when it declared none. */
export function expectedText(node: FigureNode): string | null {
  if (node.raw == null || node.unit === 'sentence') return null;
  switch (node.unit) {
    case 'currency':
      return formatMoney(node.raw, node.currency, node.codeIn);
    case 'per-period':
      return `${formatMoney(node.raw, node.currency, node.codeIn)}/day · ${formatMoney(round2(node.raw * DAYS_PER_MONTH), node.currency, node.codeIn)}/mo`;
    case 'per-month':
      return `${formatMoney(round2(node.raw * DAYS_PER_MONTH), node.currency, node.codeIn)}/mo`;
    case 'percent':
      return `${node.raw.toFixed(0)}%`;
    case 'percent-signed':
      return `${node.raw > 0 ? '+' : ''}${node.raw.toFixed(0)}%`;
    case 'count':
      return COUNT.format(node.raw);
  }
}

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Rule 1 — the text is the declared raw figure, formatted. */
export function checkFormat(node: FigureNode): RuleResult {
  if (node.unit === 'sentence') {
    return {
      rule: 'format',
      key: node.key,
      grade: 'SKIP',
      detail: 'prose — graded by the sentence rule',
    };
  }
  const expected = expectedText(node);
  const actual = normalize(node.text);
  if (expected == null) {
    return actual === '—'
      ? { rule: 'format', key: node.key, grade: 'PASS', detail: 'no figure, placeholder shown' }
      : {
          rule: 'format',
          key: node.key,
          grade: 'FAIL',
          detail: `declared no raw figure but rendered "${actual}"`,
        };
  }
  if (actual === expected) {
    return { rule: 'format', key: node.key, grade: 'PASS', detail: `"${actual}"` };
  }
  // The figure followed by its unit word ("779 conversations", "4.20 MXN/day", "2 of 7"):
  // the raw value is graded, the words after it are the label the design gives it.
  if (actual.startsWith(expected) && /^[\s/]/.test(actual.slice(expected.length))) {
    return {
      rule: 'format',
      key: node.key,
      grade: 'PASS',
      detail: `"${actual}" leads with ${expected}`,
    };
  }
  // A money figure printed bare while its node declares the currency: the code rides on
  // data-figure-currency and the design puts the unit in the sub-line (module D anchor).
  const bare =
    MONEY_UNITS.has(node.unit) && node.raw != null ? formatMoney(node.raw, 'none') : null;
  if (bare != null && actual === bare && ISO_CURRENCY.test(node.currency)) {
    return {
      rule: 'format',
      key: node.key,
      grade: 'PASS',
      detail: `"${actual}" is ${node.raw} with ${node.currency} on the node`,
    };
  }
  return {
    rule: 'format',
    key: node.key,
    grade: 'FAIL',
    detail: `rendered "${actual}", expected "${expected}" from raw ${node.raw} (${node.unit}, ${node.currency})`,
  };
}

const MONEY_UNITS: ReadonlySet<FigureUnit> = new Set(['currency', 'per-period', 'per-month']);

const SYMBOLS = /R\$|\$|€|£|¥|₹|₩/;

/** Rule 2 — the symbol rule: unknown prints bare; every known currency prints its own symbol
 *  and its own code ("$… MXN", "$… USD"), the code only in the column header for a cell that
 *  declares `codeIn: header`. A symbol or code of another currency FAILS. */
export function checkSymbol(node: FigureNode): RuleResult {
  if (!MONEY_UNITS.has(node.unit) || node.raw == null) {
    return { rule: 'symbol', key: node.key, grade: 'SKIP', detail: 'not a money figure' };
  }
  const text = node.text;
  const symbols = [...text.matchAll(new RegExp(SYMBOLS, 'g'))].map((m) => m[0]);
  const codes = [...text.matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1]);
  let ok: boolean;
  let want: string;
  if (node.currency === 'none') {
    ok = symbols.length === 0 && codes.length === 0;
    want = 'a bare figure (currency unknown)';
  } else {
    const own = currencySymbolOf(node.currency);
    const symbolOk =
      own == null ? symbols.length === 0 : symbols.length > 0 && symbols.every((s) => s === own);
    const codeOk =
      codes.every((code) => code === node.currency) &&
      (node.codeIn === 'header' ? codes.length === 0 : codes.length > 0);
    ok = symbolOk && codeOk;
    want =
      node.codeIn === 'header'
        ? `${own ?? 'no symbol'} with ${node.currency} in the column header`
        : `${own ?? ''}… ${node.currency}`;
    if (!ok && symbols.length === 0 && codes.length === 0) {
      // No symbol at all, the code declared on the node: not wrong money, but the text alone
      // does not say it. Visible as WARN until the anchor decision (unit in the sub-line).
      return {
        rule: 'symbol',
        key: node.key,
        grade: 'WARN',
        detail: `"${text}" carries no code in its text; ${node.currency} is on the node`,
      };
    }
  }
  return ok
    ? { rule: 'symbol', key: node.key, grade: 'PASS', detail: want }
    : { rule: 'symbol', key: node.key, grade: 'FAIL', detail: `"${text}" should carry ${want}` };
}

const PER_PERIOD = /^(.+?)\/day · (.+?)\/mo$/;

/** Rule 3 — a day and its month are one figure: month = day × 30, rounded to cents, and the
 *  two halves are printed under the same digit rule. */
export function checkDayMonth(node: FigureNode): RuleResult {
  if (node.unit !== 'per-period' || node.raw == null) {
    return { rule: 'day-month', key: node.key, grade: 'SKIP', detail: 'not a day · month pair' };
  }
  const match = PER_PERIOD.exec(normalize(node.text));
  if (!match) {
    return {
      rule: 'day-month',
      key: node.key,
      grade: 'FAIL',
      detail: `"${node.text}" is not a "<day>/day · <month>/mo" pair`,
    };
  }
  const [, dayText, monthText] = match;
  const wantDay = formatMoney(node.raw, node.currency);
  const wantMonth = formatMoney(round2(node.raw * DAYS_PER_MONTH), node.currency);
  if (dayText !== wantDay || monthText !== wantMonth) {
    return {
      rule: 'day-month',
      key: node.key,
      grade: 'FAIL',
      detail: `day "${dayText}" · month "${monthText}", expected "${wantDay}" · "${wantMonth}"`,
    };
  }
  return {
    rule: 'day-month',
    key: node.key,
    grade: 'PASS',
    detail: `${wantDay} × 30 = ${wantMonth}`,
  };
}

/** Rule 4 — a window total was summed over exactly the days its window names. */
export function checkWindow(node: FigureNode, expectation: PayloadExpectation): RuleResult {
  const span = windowSpanDays(node.window);
  if (span == null) {
    return { rule: 'window', key: node.key, grade: 'SKIP', detail: `window ${node.window}` };
  }
  if (expectation.kind !== 'value' || expectation.daysSummed == null) {
    return {
      rule: 'window',
      key: node.key,
      grade: 'WARN',
      detail: `declares ${node.window} but the mapper summed no daily rows to check it against`,
    };
  }
  return expectation.daysSummed <= span
    ? {
        rule: 'window',
        key: node.key,
        grade: 'PASS',
        detail: `${expectation.daysSummed} day(s) inside a ${span}-day window`,
      }
    : {
        rule: 'window',
        key: node.key,
        grade: 'FAIL',
        detail: `${expectation.daysSummed} days summed for a ${span}-day window (${node.window})`,
      };
}

function closeEnough(a: number, b: number, unit: FigureUnit): boolean {
  if (unit === 'count' || unit === 'percent' || unit === 'percent-signed') {
    return Math.abs(a - b) < 0.5;
  }
  return Math.abs(a - b) <= MONEY_TOLERANCE || Math.abs(a - b) <= Math.abs(b) * 1e-6;
}

/** Every money-looking token in a sentence, as numbers with their symbol/code. */
export function moneyTokens(
  text: string,
): { token: string; value: number; symbol: string; code: string }[] {
  const out: { token: string; value: number; symbol: string; code: string }[] = [];
  const pattern = /(R\$|\$|€|£|¥|₹|₩)?(\d[\d,]*(?:\.\d+)?)(?:\s?([A-Z]{3})\b)?/g;
  for (const match of text.matchAll(pattern)) {
    const [token, glyph, digits, code] = match;
    const value = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    out.push({ token, value, symbol: glyph ?? '', code: code ?? '' });
  }
  return out;
}

/** Rule 5 — the raw figure is the payload field it claims to come from. */
export function checkPayload(node: FigureNode, expectation: PayloadExpectation): RuleResult {
  if (node.unit === 'sentence' && expectation.kind !== 'sentence') {
    return {
      rule: 'payload',
      key: node.key,
      grade: 'WARN',
      detail: `prose with no figure set to read it against: ${expectation.kind === 'unmapped' ? expectation.reason : expectation.path}`,
    };
  }
  if (expectation.kind === 'unmapped') {
    return {
      rule: 'payload',
      key: node.key,
      grade: 'WARN',
      detail: `unmapped: ${expectation.reason}`,
    };
  }
  if (expectation.kind === 'sentence') {
    return checkSentence(node, expectation);
  }
  if (node.raw == null && expectation.value == null) {
    return {
      rule: 'payload',
      key: node.key,
      grade: 'PASS',
      detail: `${expectation.path} is empty too`,
    };
  }
  if (node.raw == null || expectation.value == null) {
    return {
      rule: 'payload',
      key: node.key,
      grade: 'FAIL',
      detail: `screen raw ${node.raw ?? 'none'} vs ${expectation.path} = ${expectation.value ?? 'none'}`,
    };
  }
  return closeEnough(node.raw, expectation.value, node.unit)
    ? {
        rule: 'payload',
        key: node.key,
        grade: 'PASS',
        detail: `${expectation.path} = ${expectation.value}`,
      }
    : {
        rule: 'payload',
        key: node.key,
        grade: 'FAIL',
        detail: `screen raw ${node.raw} vs ${expectation.path} = ${expectation.value}`,
      };
}

/** Prose that quotes figures: every money token must be one of the growth figures under the
 *  screen's currency rule. A `$` in a sentence about an account with no known currency is
 *  the exact leak this rule exists for and FAILS; an unmatched number is named as WARN
 *  because prose may cite a percent or a day count the figure set does not carry. */
export function checkSentence(
  node: FigureNode,
  expectation: Extract<PayloadExpectation, { kind: 'sentence' }>,
): RuleResult {
  const tokens = moneyTokens(node.text);
  if (tokens.length === 0) {
    return { rule: 'payload', key: node.key, grade: 'PASS', detail: 'no figures quoted' };
  }
  const own = currencySymbolOf(node.currency);
  const leaks = tokens.filter(
    (token) =>
      (node.currency === 'none' && (token.symbol !== '' || token.code !== '')) ||
      (node.currency !== 'none' && token.symbol !== '' && token.symbol !== own),
  );
  if (leaks.length > 0) {
    return {
      rule: 'payload',
      key: node.key,
      grade: 'FAIL',
      detail: `"${leaks.map((t) => t.token).join('", "')}" carries a symbol the account (${node.currency}) does not have`,
    };
  }
  const known = Object.entries(expectation.figures).filter(
    (entry): entry is [string, number] => entry[1] != null,
  );
  const unmatched = tokens.filter(
    (token) =>
      !known.some(
        ([, value]) =>
          closeEnough(token.value, value, 'currency') ||
          closeEnough(token.value, Math.round(value), 'count') ||
          closeEnough(token.value, round2(value), 'currency'),
      ),
  );
  if (unmatched.length > 0) {
    return {
      rule: 'payload',
      key: node.key,
      grade: 'WARN',
      detail: `"${unmatched.map((t) => t.token).join('", "')}" is not among ${known
        .map(([name, value]) => `${name}=${value}`)
        .join(', ')} (${expectation.path})`,
    };
  }
  return {
    rule: 'payload',
    key: node.key,
    grade: 'PASS',
    detail: `${tokens.length} figure(s) match ${expectation.path}`,
  };
}

/** All five rules over every node, in order, for one surface. */
export function gradeNodes(
  nodes: FigureNode[],
  resolve: (node: FigureNode) => PayloadExpectation,
): RuleResult[] {
  const out: RuleResult[] = [];
  for (const node of nodes) {
    const expectation = resolve(node);
    out.push(checkFormat(node));
    out.push(checkSymbol(node));
    out.push(checkDayMonth(node));
    out.push(checkWindow(node, expectation));
    out.push(checkPayload(node, expectation));
  }
  return out;
}

/** A DOM node's attributes → a FigureNode. Null when the node is not a figure. */
export function readFigureNode(
  attrs: Record<string, string | null>,
  text: string,
): FigureNode | null {
  const key = attrs['data-figure'];
  const unit = attrs['data-figure-unit'] as FigureUnit | null;
  if (!key || !unit) return null;
  const rawAttr = attrs['data-figure-raw'] ?? '';
  const raw = rawAttr === '' ? null : Number(rawAttr);
  return {
    key,
    raw: raw != null && Number.isFinite(raw) ? raw : null,
    currency: attrs['data-figure-currency'] ?? 'none',
    window: attrs['data-figure-window'] ?? 'none',
    unit,
    codeIn: attrs['data-figure-code'] === 'header' ? 'header' : 'text',
    text,
  };
}
