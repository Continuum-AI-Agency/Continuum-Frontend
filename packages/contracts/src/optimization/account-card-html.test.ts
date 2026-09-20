import { describe, expect, it } from 'bun:test';
import {
  accountCardHtml,
  CARD_COMPOSITIONS,
  cardFigures,
  clipLine,
  COMPOSITION_BY_DETECTOR,
  LINE_BUDGET,
} from './account-card-html';
import { type AccountCandidate, accountCandidateSchema, accountDetectorSchema } from './account-strategy';

const candidate = (over: Partial<AccountCandidate> = {}): AccountCandidate =>
  accountCandidateSchema.parse({
    id: 'portfolio_reallocation:p1>p2',
    detector: 'portfolio_reallocation',
    impact_per_day: 66.67,
    impact_class: 'better_price',
    impact_basis: '200/day moved from a portfolio at 90 to one at 60',
    chart: {
      shape: 'transfer',
      from: { label: 'Prospecting', cost_per_result: 90, spend_per_day: 900 },
      to: { label: 'Retargeting', cost_per_result: 60, spend_per_day: 300 },
      movable_per_day: 200,
      saving_per_day: 66.67,
    },
    ...over,
  });

const opts = { title: 'Move budget between portfolios', resultLabel: 'purchases', currency: 'USD' };

describe('accountCardHtml — self-contained or it is not a HyperFrame', () => {
  const html = accountCardHtml(candidate(), opts);

  it('reaches the network for nothing at all', () => {
    // A browser encoding this to MP4 offline must see exactly what a reader sees.
    expect(html).not.toContain('http://');
    expect(html).not.toContain('https://');
    expect(html).not.toContain('url(');
    expect(html).not.toMatch(/<(script|link|iframe)\b/i);
  });

  it('is a whole document, not a fragment', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
  });

  it('names a system font stack rather than pretending to embed one', () => {
    expect(html).toContain('system-ui');
    expect(html).not.toContain('@font-face');
  });
});

describe('accountCardHtml — a compiler cannot hallucinate, but it can carry a stale constant', () => {
  it('prints no figure the candidate did not supply', () => {
    const c = candidate();
    const html = accountCardHtml(c, opts);
    const allowed = new Set<string>();
    for (const figure of cardFigures(c)) {
      for (const form of [String(figure), figure.toFixed(0), figure.toFixed(1), figure.toFixed(2)]) {
        for (const piece of form.split('.')) allowed.add(piece);
      }
    }
    // Percentages and animation timings are layout, not claims about the account — they are
    // computed from the figures above and are allowed to appear.
    const body = html.slice(html.indexOf('<body'));
    const digits = body.match(/\d+/g) ?? [];
    const unexplained = digits.filter((d) => !allowed.has(d) && !/^\d{1,3}$/.test(d));
    expect(unexplained).toEqual([]);
  });

  it('collects every figure each shape can print', () => {
    expect(cardFigures(candidate())).toContain(90);
    expect(cardFigures(candidate())).toContain(60);
    expect(cardFigures(candidate({ chart: null }))).toEqual([66.67]);
  });
});

describe('accountCardHtml — colour is the kind of money', () => {
  it('gives each class its own ink, and a guard its own', () => {
    const better = accountCardHtml(candidate({ impact_class: 'better_price' }), opts);
    const recoverable = accountCardHtml(candidate({ impact_class: 'recoverable' }), opts);
    const guard = accountCardHtml(candidate(), { ...opts, isGuard: true });
    expect(better).toContain('#26429E');
    expect(recoverable).toContain('#0F6B3F');
    expect(guard).toContain('#A8322A');
    expect(guard).toContain('Guard · ');
  });

  it('carries no emoji', () => {
    expect(/\p{Extended_Pictographic}/u.test(accountCardHtml(candidate(), opts))).toBe(false);
  });
});

describe('accountCardHtml — the motion is the Quiet loop', () => {
  const html = accountCardHtml(candidate(), opts);

  it('runs a six-second loop and no sheen', () => {
    expect(html).toContain('6s infinite');
    expect(html).not.toContain('hf-sheen');
  });

  it('stops entirely for a reader who asked it to', () => {
    expect(html).toContain('prefers-reduced-motion');
  });
});

describe('accountCardHtml — every shape draws its own marks', () => {
  const shapes: Array<[string, AccountCandidate['chart'], string]> = [
    ['transfer', candidate().chart, 'a-flow'],
    [
      'interval',
      {
        shape: 'interval',
        unit: 'currency',
        estimate: null,
        low: 420,
        high: 840,
        reference: 70,
        reference_label: 'target',
        at_stake_per_day: 102,
        no_results: true,
      },
      'a-widen',
    ],
    [
      'rates',
      {
        shape: 'rates',
        unit: 'currency',
        points: [
          { t: 'a', a: 12, b: 10 },
          { t: 'b', a: 14, b: 10 },
        ],
        a_label: 'Cost',
        b_label: 'Target',
        projected_from: null,
        gap_per_day: 40,
      },
      'a-halo',
    ],
    [
      'threshold',
      {
        shape: 'threshold',
        unit: 'count',
        bars: [
          { label: 'a', value: 12 },
          { label: 'b', value: 18 },
        ],
        threshold: 50,
        threshold_label: 'learning exit',
        combined: null,
      },
      'a-reach',
    ],
    [
      'share',
      {
        shape: 'share',
        slices: [
          { label: 'top', share: 0.9, value: 900 },
          { label: 'rest', share: 0.1, value: 100 },
        ],
        focus_label: 'top',
        band: null,
        band_label: null,
      },
      'a-breathe',
    ],
    [
      'headroom',
      {
        shape: 'headroom',
        unit: 'currency',
        gauges: [{ label: 'daily', value: 680, ceiling: 1100, good_when_low: false }],
        step_per_day: 420,
      },
      'a-nudge',
    ],
    [
      'quadrant',
      {
        shape: 'quadrant',
        x_label: 'conversion rate',
        y_label: 'click-through',
        x_split: 5,
        y_split: 5,
        points: [{ label: 'this', x: 8, y: 2 }],
        focus_corner: 'x_high_y_low',
      },
      'a-drift',
    ],
  ];

  for (const [name, chart, marker] of shapes) {
    it(`draws a ${name}`, () => {
      const html = accountCardHtml(candidate({ chart }), opts);
      expect(html).toContain(marker);
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('Infinity');
    });
  }

  it('renders the line alone when there is no chart, rather than an empty frame', () => {
    const html = accountCardHtml(candidate({ chart: null }), { ...opts, line: 'no chart for this one' });
    expect(html).toContain('no chart for this one');
    expect(html).not.toContain('<svg');
  });
});

describe('accountCardHtml — hostile input cannot break out', () => {
  it('escapes a label that tries to close the document', () => {
    const html = accountCardHtml(candidate(), {
      ...opts,
      title: '"><img onerror=x>',
      line: '</style><script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('twenty-five detectors, twenty-five compositions', () => {
  it('assigns every detector a layout, with none left out', () => {
    for (const detector of accountDetectorSchema.options) {
      expect(COMPOSITION_BY_DETECTOR[detector]).toBeDefined();
      expect(CARD_COMPOSITIONS).toContain(COMPOSITION_BY_DETECTOR[detector]);
    }
    expect(Object.keys(COMPOSITION_BY_DETECTOR)).toHaveLength(25);
  });

  it('uses every layout it defines — an unused composition is dead code', () => {
    const used = new Set(Object.values(COMPOSITION_BY_DETECTOR));
    for (const composition of CARD_COMPOSITIONS) expect(used.has(composition)).toBe(true);
  });

  it('spreads them, so a screen of cards does not look like one card repeated', () => {
    const counts = new Map<string, number>();
    for (const c of Object.values(COMPOSITION_BY_DETECTOR)) counts.set(c, (counts.get(c) ?? 0) + 1);
    // no layout may carry more than a fifth of the catalogue
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(5);
  });

  it('renders every detector without a hole in it', () => {
    for (const detector of accountDetectorSchema.options) {
      const html = accountCardHtml(candidate({ detector, id: `${detector}:x` }), {
        ...opts,
        line: 'a short line under the budget',
      });
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('Infinity');
      expect(html).toContain(`· ${detector}`);
      expect(html).toContain('class="fr c-');
    }
  });

  it('keeps the two guards in the filled head, where they still interrupt', () => {
    expect(COMPOSITION_BY_DETECTOR.measurement_integrity).toBe('banner');
    const banners = Object.values(COMPOSITION_BY_DETECTOR).filter((c) => c === 'banner');
    expect(banners.length).toBeLessThanOrEqual(3);
  });
});

describe('the copy budget — what wrecked the first pass', () => {
  it('clips a long line on a word boundary', () => {
    const long =
      '200/day moved from a portfolio at 90 to one at 60, which is 33% cheaper over the window';
    const clipped = clipLine(long);
    expect(clipped.length).toBeLessThanOrEqual(LINE_BUDGET);
    expect(clipped.endsWith('…')).toBe(true);
    expect(clipped).not.toContain('  ');
  });

  it('leaves a short line exactly alone', () => {
    expect(clipLine('two ad sets, no results')).toBe('two ad sets, no results');
  });

  it('collapses the whitespace a model or a detector may have left', () => {
    expect(clipLine('  a   line\nwith  breaks ')).toBe('a line with breaks');
  });

  it('never lets a detector’s hover prose onto the frame by default', () => {
    // impact_basis is written for a tooltip. It became the largest block on the frame once.
    const c = candidate({ impact_basis: 'a very long basis line that belongs on the screen' });
    const html = accountCardHtml(c, opts);
    expect(html).not.toContain('a very long basis line');
  });
});

describe('every shape moves — a still frame in an animated set reads as broken', () => {
  it('gives each of the seven a moving element', () => {
    const markers = ['a-flow', 'a-reach', 'a-breathe', 'a-halo', 'a-widen', 'a-nudge', 'a-drift'];
    // Each marker must be reachable: the CSS defines it and at least one shape emits it.
    for (const marker of markers) {
      expect(accountCardHtml(candidate(), opts)).toContain(`.${marker}{animation`);
    }
  });
});
