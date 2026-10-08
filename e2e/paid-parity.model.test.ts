// The four node-only rules and the payload rule of `paid:parity:e2e:bench`, pinned on
// fixtures shaped like the figures the five Performance+ surfaces actually render (captured
// from the Easy Fit agency brand, account 521903353286118, a MXN account whose row carries
// no currency code — so `none` is the common case here, not the edge).
//
// Run: cd Continuum-Frontend && bun test e2e/paid-parity.model.test.ts
// (`bun run tests` ignores e2e/**, so this file is named in the ledger anchor directly.)

import { describe, expect, it } from 'bun:test';
import {
  checkDayMonth,
  checkFormat,
  checkPayload,
  checkSentence,
  checkSymbol,
  checkWindow,
  expectedText,
  type FigureNode,
  formatMoney,
  gradeNodes,
  moneyTokens,
  readFigureNode,
  windowSpanDays,
} from './paid-parity.model';

const node = (overrides: Partial<FigureNode>): FigureNode => ({
  key: 'tiles.daily-budget',
  raw: 2000,
  currency: 'none',
  window: 'none',
  unit: 'currency',
  text: '2,000',
  ...overrides,
});

describe('windowSpanDays', () => {
  it('reads the range vocabulary and nothing else', () => {
    expect(windowSpanDays('d1')).toBe(1);
    expect(windowSpanDays('d3')).toBe(3);
    expect(windowSpanDays('d7')).toBe(7);
    expect(windowSpanDays('d14')).toBe(14);
    expect(windowSpanDays('d30')).toBe(30);
    expect(windowSpanDays('none')).toBeNull();
    expect(windowSpanDays('week')).toBeNull();
    expect(windowSpanDays('d0')).toBeNull();
  });
});

describe('formatMoney — the symbol and digit rules, restated', () => {
  it('prints a bare figure when the currency is unknown', () => {
    expect(formatMoney(324, 'none')).toBe('324');
    expect(formatMoney(25.54, 'none')).toBe('25.54');
  });
  it('prints $ for USD and the code after the figure otherwise', () => {
    expect(formatMoney(25.54, 'USD')).toBe('$25.54');
    expect(formatMoney(2000, 'MXN')).toBe('2,000 MXN');
  });
  it('keeps the sign outside the unit', () => {
    expect(formatMoney(-25.54, 'USD')).toBe('-$25.54');
  });
});

describe('rule 1 — format', () => {
  it('passes a bare currency figure on a null-currency account', () => {
    expect(checkFormat(node({ raw: 766.2, text: '766' })).grade).toBe('PASS');
  });
  it('fails a figure printed from a different number than it declared', () => {
    const result = checkFormat(node({ raw: 2000, text: '2,300' }));
    expect(result.grade).toBe('FAIL');
    expect(result.detail).toContain('expected "2,000"');
  });
  it('grades percent, signed percent and count in their own units', () => {
    expect(expectedText(node({ unit: 'percent', raw: 33 }))).toBe('33%');
    expect(expectedText(node({ unit: 'percent-signed', raw: 12 }))).toBe('+12%');
    expect(expectedText(node({ unit: 'percent-signed', raw: -8 }))).toBe('-8%');
    expect(expectedText(node({ unit: 'count', raw: 1234 }))).toBe('1,234');
  });
  it('accepts the placeholder only when no figure was declared', () => {
    expect(checkFormat(node({ raw: null, text: '—' })).grade).toBe('PASS');
    expect(checkFormat(node({ raw: null, text: '$0' })).grade).toBe('FAIL');
  });
});

describe('rule 2 — symbol', () => {
  it('fails a $ on an account with no known currency', () => {
    const result = checkSymbol(node({ currency: 'none', text: '$2,000' }));
    expect(result.grade).toBe('FAIL');
    expect(result.detail).toContain('bare figure');
  });
  it('requires $ on USD and the code on anything else', () => {
    expect(checkSymbol(node({ currency: 'USD', text: '$2,000' })).grade).toBe('PASS');
    expect(checkSymbol(node({ currency: 'USD', text: '2,000' })).grade).toBe('FAIL');
    expect(checkSymbol(node({ currency: 'MXN', text: '2,000 MXN' })).grade).toBe('PASS');
    expect(checkSymbol(node({ currency: 'MXN', text: '$2,000' })).grade).toBe('FAIL');
  });
  it('skips figures that are not money', () => {
    expect(checkSymbol(node({ unit: 'percent', raw: 33, text: '33%' })).grade).toBe('SKIP');
  });
});

describe('rule 3 — day · month agree', () => {
  it('passes the pair the compiled card renders', () => {
    const result = checkDayMonth(
      node({ unit: 'per-period', raw: 25.54, currency: 'USD', text: '$25.54/day · $766/mo' }),
    );
    expect(result.grade).toBe('PASS');
  });
  it('fails the "$26/day · $766/mo" pair a reader multiplies to 780', () => {
    const result = checkDayMonth(
      node({ unit: 'per-period', raw: 25.54, currency: 'USD', text: '$26/day · $766/mo' }),
    );
    expect(result.grade).toBe('FAIL');
    expect(result.detail).toContain('expected "$25.54"');
  });
  it('rounds the month to cents before formatting, like perPeriod', () => {
    const result = checkDayMonth(
      node({ unit: 'per-period', raw: 66.67, currency: 'none', text: '66.67/day · 2,000/mo' }),
    );
    expect(result.grade).toBe('PASS');
  });
  it('fails a month that is not the day × 30', () => {
    const result = checkDayMonth(
      node({ unit: 'per-period', raw: 10, currency: 'none', text: '10.00/day · 310/mo' }),
    );
    expect(result.grade).toBe('FAIL');
  });
  it('skips everything that is not a pair', () => {
    expect(checkDayMonth(node({})).grade).toBe('SKIP');
  });
});

describe('rule 4 — the per-day divisor is the window span', () => {
  const recapSpend = node({ key: 'recap.spend', raw: 1400, window: 'd7', text: '1,400' });
  it('passes when the mapper summed at most the window span', () => {
    const result = checkWindow(recapSpend, {
      kind: 'value',
      path: 'snapshots[].daily[2026-09-17..2026-09-23].spend',
      value: 1400,
      daysSummed: 7,
    });
    expect(result.grade).toBe('PASS');
  });
  it('fails the d7 window that summed 8 days', () => {
    const result = checkWindow(recapSpend, {
      kind: 'value',
      path: 'snapshots[].daily[..].spend',
      value: 1600,
      daysSummed: 8,
    });
    expect(result.grade).toBe('FAIL');
    expect(result.detail).toContain('8 days summed for a 7-day window');
  });
  it('warns, by name, when a window figure had no daily rows to check', () => {
    expect(checkWindow(recapSpend, { kind: 'value', path: 'x', value: 1 }).grade).toBe('WARN');
  });
  it('skips point figures', () => {
    expect(
      checkWindow(node({ window: 'none' }), { kind: 'value', path: 'x', value: 1 }).grade,
    ).toBe('SKIP');
  });
});

describe('rule 5 — the raw figure is the payload field', () => {
  it('passes within half a cent of the payload', () => {
    const result = checkPayload(node({ raw: 2000.004 }), {
      kind: 'value',
      path: 'optimizer_list_portfolios[].daily_total Σ',
      value: 2000,
    });
    expect(result.grade).toBe('PASS');
  });
  it('fails a figure the payload does not carry', () => {
    const result = checkPayload(node({ raw: 2300 }), {
      kind: 'value',
      path: 'optimizer_list_portfolios[].daily_total Σ',
      value: 2000,
    });
    expect(result.grade).toBe('FAIL');
    expect(result.detail).toContain('2300');
  });
  it('is a named WARN, never a silent pass, when no payload path is mapped', () => {
    const result = checkPayload(node({ key: 'timeline.projected.next' }), {
      kind: 'unmapped',
      reason: 'a linear projection, no payload field',
    });
    expect(result.grade).toBe('WARN');
    expect(result.detail).toContain('linear projection');
  });
  it('counts and percents compare as whole numbers', () => {
    const count = node({ key: 'tiles.on-autopilot', unit: 'count', raw: 3, text: '3' });
    expect(
      checkPayload(count, { kind: 'value', path: 'apply_mode=autopilot', value: 3 }).grade,
    ).toBe('PASS');
    expect(
      checkPayload(count, { kind: 'value', path: 'apply_mode=autopilot', value: 4 }).grade,
    ).toBe('FAIL');
  });
});

describe('the recap sentence — prose that quotes figures', () => {
  const sentence = node({
    key: 'recap.sentence',
    raw: 28.6,
    currency: 'none',
    window: 'd7',
    unit: 'sentence',
    text: 'Spent 1,430 on 50 leads at 28.60 each, above the 25 target.',
  });
  const figures = { spend: 1430.2, results: 50, cost: 28.6, target: 25 };
  it('is never graded as a single figure — the format and symbol rules skip prose', () => {
    expect(checkFormat(sentence).grade).toBe('SKIP');
    expect(checkSymbol(sentence).grade).toBe('SKIP');
    expect(checkDayMonth(sentence).grade).toBe('SKIP');
  });
  it('warns when the mapper hands prose no figure set', () => {
    const result = checkPayload(sentence, { kind: 'unmapped', reason: 'no daily series' });
    expect(result.grade).toBe('WARN');
    expect(result.detail).toContain('no daily series');
  });
  it('extracts money tokens with their symbols', () => {
    expect(moneyTokens('$1,430 and 28.60 MXN')).toEqual([
      { token: '$1,430', value: 1430, symbol: '$' },
      { token: '28.60 MXN', value: 28.6, symbol: 'MXN' },
    ]);
  });
  it('passes when every figure quoted is one of the growth figures', () => {
    expect(checkSentence(sentence, { kind: 'sentence', path: 'growth', figures }).grade).toBe(
      'PASS',
    );
  });
  it('fails a $ in prose about an account with no known currency', () => {
    const leaked = { ...sentence, text: 'Spent $1,430 on 50 leads.' };
    const result = checkSentence(leaked, { kind: 'sentence', path: 'growth', figures });
    expect(result.grade).toBe('FAIL');
    expect(result.detail).toContain('$1,430');
  });
  it('warns, naming the token, when the prose quotes a number the payload does not carry', () => {
    const drifted = { ...sentence, text: 'Spent 1,430 on 50 leads at 31 each.' };
    const result = checkSentence(drifted, { kind: 'sentence', path: 'growth', figures });
    expect(result.grade).toBe('WARN');
    expect(result.detail).toContain('"31"');
  });
});

describe('gradeNodes and readFigureNode', () => {
  it('reads a node from its attributes and runs all five rules', () => {
    const read = readFigureNode(
      {
        'data-figure': 'account-lead.money',
        'data-figure-raw': '25.54',
        'data-figure-currency': 'USD',
        'data-figure-window': 'none',
        'data-figure-unit': 'per-period',
      },
      '$25.54/day · $766/mo',
    );
    expect(read).not.toBeNull();
    const results = gradeNodes([read as FigureNode], () => ({
      kind: 'value',
      path: 'read.candidates[lead].impact_per_day',
      value: 25.54,
    }));
    expect(results.map((r) => `${r.rule}:${r.grade}`)).toEqual([
      'format:PASS',
      'symbol:PASS',
      'day-month:PASS',
      'window:SKIP',
      'payload:PASS',
    ]);
  });
  it('ignores an element that is not a figure', () => {
    expect(readFigureNode({ 'data-figure': null, 'data-figure-unit': null }, 'x')).toBeNull();
  });
  it('treats an empty raw as no figure', () => {
    const read = readFigureNode(
      {
        'data-figure': 'recap.cost',
        'data-figure-raw': '',
        'data-figure-currency': 'none',
        'data-figure-window': 'd7',
        'data-figure-unit': 'currency',
      },
      '—',
    );
    expect(read?.raw).toBeNull();
  });
});
