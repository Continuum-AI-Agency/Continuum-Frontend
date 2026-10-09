import { describe, expect, test } from 'bun:test';
import {
  CURRENCY_CODES,
  currencyNamed,
  findOverlaps,
  formatVisualViolations,
  groupByRule,
  highlightedIndexes,
  intersection,
  isAncestorOrSelf,
  looksLikeMoney,
  MAX_LAYOUT_SHIFT,
  MIN_TAP_TARGET_PX,
  moneyViolations,
  OVERLAP_TOLERANCE_PX,
  overlapsBeyondTolerance,
  type Rect,
  rectContains,
  SEVERITY_BY_RULE,
  severityOf,
  sidesOutsideViewport,
  type TablistFact,
  tabIndicatorViolations,
  tapTargetShortfall,
  union,
  VISUAL_RULES,
  type VisualNode,
  violation,
} from './visualGeometry';

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

describe('thresholds are the intent’s', () => {
  test('24 px targets, CLS 0.1, one pixel of overlap tolerance', () => {
    expect(MIN_TAP_TARGET_PX).toBe(24);
    expect(MAX_LAYOUT_SHIFT).toBe(0.1);
    expect(OVERLAP_TOLERANCE_PX).toBe(1);
  });

  test('every rule has a severity', () => {
    for (const rule of VISUAL_RULES) {
      expect(['blocker', 'major', 'minor']).toContain(severityOf(rule));
      expect(SEVERITY_BY_RULE[rule]).toBe(severityOf(rule));
    }
    expect(severityOf('covered-control')).toBe('blocker');
    expect(severityOf('tap-target')).toBe('minor');
  });
});

describe('rect math', () => {
  test('intersection of overlapping rects', () => {
    expect(intersection(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toEqual(rect(5, 5, 5, 5));
  });

  test('no intersection when rects only touch or are apart', () => {
    expect(intersection(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBeNull();
    expect(intersection(rect(0, 0, 10, 10), rect(20, 20, 5, 5))).toBeNull();
  });

  test('one pixel of shared edge is rounding, not overlap', () => {
    expect(overlapsBeyondTolerance(rect(0, 0, 10, 10), rect(9, 0, 10, 10))).toBe(false);
    expect(overlapsBeyondTolerance(rect(0, 0, 10, 10), rect(8, 0, 10, 10))).toBe(true);
    // Shared on x only: a column boundary, not a collision.
    expect(overlapsBeyondTolerance(rect(0, 0, 10, 10), rect(5, 9.5, 10, 10))).toBe(false);
  });

  test('containment and union', () => {
    expect(rectContains(rect(0, 0, 100, 100), rect(10, 10, 20, 20))).toBe(true);
    expect(rectContains(rect(0, 0, 100, 100), rect(90, 90, 20, 20))).toBe(false);
    expect(union([rect(0, 0, 10, 10), rect(20, 20, 5, 5)])).toEqual(rect(0, 0, 25, 25));
    expect(union([])).toEqual(rect(0, 0, 0, 0));
  });

  test('sides outside the viewport', () => {
    expect(sidesOutsideViewport(rect(10, 10, 50, 20), 375, 812)).toEqual([]);
    expect(sidesOutsideViewport(rect(-5, 10, 50, 20), 375, 812)).toEqual(['left by 5px']);
    expect(sidesOutsideViewport(rect(350, 800, 50, 20), 375, 812)).toEqual([
      'right by 25px',
      'bottom by 8px',
    ]);
  });
});

describe('findOverlaps', () => {
  const node = (
    kind: VisualNode['kind'],
    selector: string,
    rects: Rect[],
    order: number,
    end: number,
    extra: Partial<VisualNode> = {},
  ): VisualNode => ({ kind, selector, rects, order, end, layered: false, ...extra });

  test('ancestry is a range test', () => {
    const button = { order: 3, end: 7 };
    const icon = { order: 5, end: 6 };
    const sibling = { order: 7, end: 9 };
    expect(isAncestorOrSelf(button, icon)).toBe(true);
    expect(isAncestorOrSelf(icon, button)).toBe(false);
    expect(isAncestorOrSelf(button, sibling)).toBe(false);
    expect(isAncestorOrSelf(button, button)).toBe(true);
  });

  test('a button and the text inside it never collide', () => {
    const nodes = [
      node('control', 'button', [rect(0, 0, 100, 32)], 1, 4),
      node('text', 'button', [rect(24, 8, 70, 16)], 1, 2, { text: 'Approve' }),
      node('image', 'button > svg', [rect(4, 8, 16, 16)], 2, 3),
    ];
    expect(findOverlaps(nodes)).toEqual([]);
  });

  test('two unrelated text lines that intersect are one violation naming both', () => {
    const nodes = [
      node('text', 'h2.title', [rect(0, 0, 200, 24)], 1, 2, { text: 'Leads a 38.59 MXN' }),
      node('text', 'p.subtitle', [rect(0, 12, 200, 24)], 2, 3, { text: '10 % sobre objetivo' }),
    ];
    const found = findOverlaps(nodes);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('overlap');
    expect(found[0].selector).toBe('h2.title');
    expect(found[0].bbox).toEqual(rect(0, 12, 200, 12));
    expect(found[0].detail).toContain('p.subtitle');
    expect(found[0].severity).toBe('major');
  });

  test('wrapped prose is compared per line box, not by its bounding box', () => {
    const prose = node('text', 'p', [rect(0, 0, 300, 20), rect(0, 20, 120, 20)], 1, 2, {
      text: 'two lines',
    });
    const badge = node('control', 'button.badge', [rect(200, 20, 60, 20)], 5, 6);
    expect(findOverlaps([prose, badge])).toEqual([]);
    const collidingBadge = node('control', 'button.badge', [rect(100, 20, 60, 20)], 5, 6);
    expect(findOverlaps([prose, collidingBadge])).toHaveLength(1);
  });

  test('a fixed layer floats over content without colliding', () => {
    const toast = node('text', 'div.toast', [rect(0, 0, 200, 40)], 9, 10, { layered: true });
    const content = node('text', 'p', [rect(0, 0, 200, 40)], 1, 2);
    expect(findOverlaps([toast, content])).toEqual([]);
  });

  test('an image over a control it does not belong to is a collision', () => {
    const nodes = [
      node('control', 'a.card', [rect(0, 0, 100, 100)], 1, 2),
      node('image', 'img.thumb', [rect(50, 50, 100, 100)], 7, 8),
    ];
    const found = findOverlaps(nodes);
    expect(found).toHaveLength(1);
    expect(found[0].detail).toContain('control a.card intersects image img.thumb');
  });
});

describe('tap targets', () => {
  test('meets the floor on both axes', () => {
    expect(tapTargetShortfall(rect(0, 0, 24, 24))).toBeNull();
    expect(tapTargetShortfall(rect(0, 0, 40, 32))).toBeNull();
  });

  test('names the short axis', () => {
    expect(tapTargetShortfall(rect(0, 0, 20, 32))).toBe('width 20px < 24px');
    expect(tapTargetShortfall(rect(0, 0, 32, 16))).toBe('height 16px < 24px');
    expect(tapTargetShortfall(rect(0, 0, 16, 16))).toBe('width 16px, height 16px < 24px');
  });
});

describe('money and currency', () => {
  test('a currency symbol glued to a number reads as money', () => {
    expect(looksLikeMoney('$1,234', null)).toBe(true);
    expect(looksLikeMoney('MX$ 38.59', null)).toBe(true);
    expect(looksLikeMoney('1.234,56 €', null)).toBe(true);
    expect(looksLikeMoney('-$12/day', null)).toBe(true);
    expect(looksLikeMoney('38.59', null)).toBe(false);
    expect(looksLikeMoney('12 leads', null)).toBe(false);
    expect(looksLikeMoney('3.2%', null)).toBe(false);
  });

  test('the figure unit decides when the node carries one', () => {
    expect(looksLikeMoney('38.59', 'currency')).toBe(true);
    expect(looksLikeMoney('2,608 per day', 'per-period')).toBe(true);
    expect(looksLikeMoney('$12', 'count')).toBe(false);
    expect(looksLikeMoney('12', 'percent')).toBe(false);
  });

  test('a currency is named by attribute or by an ISO code in the text, never by CPA', () => {
    expect(currencyNamed('38.59', 'MXN')).toBe('MXN');
    expect(currencyNamed('38.59', 'mxn')).toBe('MXN');
    expect(currencyNamed('38.59 MXN', 'none')).toBe('MXN');
    expect(currencyNamed('38.59 MXN', null)).toBe('MXN');
    expect(currencyNamed('CPA 38.59', null)).toBeNull();
    expect(currencyNamed('CTR 1.2', 'none')).toBeNull();
    expect(CURRENCY_CODES.has('CPA')).toBe(false);
  });

  test('moneyViolations: the intent’s rule 2', () => {
    const base = { selector: 'span[data-figure="x"]', bbox: rect(0, 0, 50, 20) };
    const found = moneyViolations([
      { ...base, text: '$38.59', currencyAttr: null, unit: null },
      { ...base, text: '38.59 MXN', currencyAttr: null, unit: 'currency' },
      { ...base, text: '38.59', currencyAttr: 'MXN', unit: 'currency' },
      { ...base, text: '38.59', currencyAttr: 'none', unit: 'currency' },
      { ...base, text: '—', currencyAttr: 'none', unit: 'currency' },
      { ...base, text: '12', currencyAttr: 'none', unit: 'count' },
    ]);
    expect(found.map((v) => v.detail)).toEqual([
      expect.stringContaining('"$38.59" reads as money'),
      expect.stringContaining('"38.59" reads as money (unit=currency, currency attr=none)'),
    ]);
    expect(found.every((v) => v.rule === 'money-currency' && v.severity === 'blocker')).toBe(true);
  });
});

describe('selected-tab-indicator', () => {
  const tab = (
    label: string,
    ariaSelected: boolean,
    signature: string,
    id = label.toLowerCase(),
  ) => ({
    selector: `button[role=tab][aria-label="${label}"]`,
    bbox: rect(0, 0, 80, 32),
    label,
    ariaSelected,
    signature,
    controls: `${id}-panel`,
  });
  const ACTIVE = 'bg=rgb(255, 255, 255) shadow=0 1px';
  const REST = 'bg=none shadow=none';

  test('the odd ones out are the highlighted tabs; two tabs decide nothing', () => {
    expect(highlightedIndexes([REST, ACTIVE, REST, REST])).toEqual([1]);
    expect(highlightedIndexes([REST, REST, REST])).toEqual([]);
    expect(highlightedIndexes([ACTIVE, REST])).toEqual([]);
    expect(highlightedIndexes(['a', 'b', 'c'])).toEqual([]);
  });

  test('clean when the highlighted tab is the selected one and its panel shows', () => {
    const tablist: TablistFact = {
      selector: '[role=tablist]',
      tabs: [
        tab('Automations', false, REST),
        tab('Overview', true, ACTIVE),
        tab('Portfolios', false, REST),
      ],
      tabIds: ['automations', 'overview', 'portfolios'],
      visiblePanelLabelledBy: ['overview'],
    };
    expect(tabIndicatorViolations([tablist])).toEqual([]);
  });

  test('the Portfolios candidate: Automations styled active while Portfolios is selected', () => {
    const tablist: TablistFact = {
      selector: '[role=tablist]',
      tabs: [
        tab('Automations', false, ACTIVE),
        tab('Overview', false, REST),
        tab('Portfolios', true, REST),
        tab('Actions', false, REST),
      ],
      tabIds: ['automations', 'overview', 'portfolios', 'actions'],
      visiblePanelLabelledBy: ['portfolios'],
    };
    const found = tabIndicatorViolations([tablist]);
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('selected-tab-indicator');
    expect(found[0].selector).toContain('Automations');
    expect(found[0].detail).toBe(
      'tab "Automations" is styled as the active tab while aria-selected is on "Portfolios"',
    );
  });

  test('the panel side of the same lie: the visible panel belongs to another tab', () => {
    const tablist: TablistFact = {
      selector: '[role=tablist]',
      tabs: [
        tab('Automations', true, ACTIVE),
        tab('Overview', false, REST),
        tab('Portfolios', false, REST),
      ],
      tabIds: ['automations', 'overview', 'portfolios'],
      visiblePanelLabelledBy: ['portfolios'],
    };
    const found = tabIndicatorViolations([tablist]);
    expect(found).toHaveLength(1);
    expect(found[0].detail).toBe(
      'the visible panel belongs to tab "Portfolios" while aria-selected is on "Automations"',
    );
  });

  test('a selected tab with no visible indicator is a finding too', () => {
    const tablist: TablistFact = {
      selector: '[role=tablist]',
      tabs: [tab('A', true, REST), tab('B', false, REST), tab('C', false, REST)],
      tabIds: ['a', 'b', 'c'],
      visiblePanelLabelledBy: ['a'],
    };
    const found = tabIndicatorViolations([tablist]);
    expect(found).toHaveLength(1);
    expect(found[0].detail).toContain('no visible indicator');
  });

  test('a single-tab list and a list with unknown panels say nothing', () => {
    expect(
      tabIndicatorViolations([
        {
          selector: 'x',
          tabs: [tab('Only', true, ACTIVE)],
          tabIds: ['only'],
          visiblePanelLabelledBy: [],
        },
      ]),
    ).toEqual([]);
  });
});

describe('reporting', () => {
  test('groupByRule keeps the rule order and drops empty rules', () => {
    const grouped = groupByRule([
      violation('tap-target', 'a', rect(0, 0, 1, 1), 'x'),
      violation('overlap', 'b', rect(0, 0, 1, 1), 'y'),
      violation('tap-target', 'c', rect(0, 0, 1, 1), 'z'),
    ]);
    expect([...grouped.keys()]).toEqual(['overlap', 'tap-target']);
    expect(grouped.get('tap-target')).toHaveLength(2);
  });

  test('formatVisualViolations names label, rule, selector, bbox and detail per line', () => {
    const text = formatVisualViolations('Jaina @375 dark loaded', [
      violation(
        'clipped-text',
        'p.lead',
        rect(10.4, 20.6, 100, 18),
        'scrollWidth 140 > clientWidth 100',
      ),
    ]);
    expect(text).toBe(
      '[Jaina @375 dark loaded] clipped-text p.lead 100×18@10,21: scrollWidth 140 > clientWidth 100',
    );
  });
});
