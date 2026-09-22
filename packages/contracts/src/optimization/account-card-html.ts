// An account-read card as a self-contained HyperFrame.
//
// WHY THIS IS COMPILED AND NOT DRAFTED, which is the design decision underneath everything
// else here: the HyperFrames agent drafts HTML with a model — grounded, linted, and measured
// at about 117 seconds of model call for a five-second composition. That is right for a
// creative, where the model IS the author. It is wrong for an optimizer card, where the whole
// discipline is that figures come from a detector and the model may not author them. Asking a
// model to write a card whose numbers it is forbidden to invent means building a digit gate
// around the output and hoping. A generator with no model in it cannot invent a figure even by
// accident, and `cardFigures()` below is what proves it.
//
// WHAT THE FIRST PASS GOT WRONG, because the fix is the shape of this file:
//
//   1. It took a 262-pixel grid card and multiplied it. A 64px figure, a 29px sentence, a 20px
//      note — nothing decided at the frame's scale, everything stretched to it. There is one
//      type ramp now (FRAME_CSS), drawn for the frame.
//
//   2. `justify-content: space-between` gave the chart whatever the text did not take, so a
//      long line collapsed it. Every composition DECLARES a band and the chart fills it. That
//      is the difference between a chart and a remainder.
//
//   3. `impact_basis` is prose a detector writes for a hover — "200/day moved from a portfolio
//      at 90 to one at 60, which is 33% cheaper" — and it became the largest block on the
//      frame. The frame takes a short line under LINE_BUDGET characters instead, and leaves the
//      basis to the screen, where there is room to read it.
//
// TWENTY-FIVE COMPOSITIONS, ONE PER DETECTOR. The seven chart shapes are fixed by the contract
// and shared; what varies is where the figure sits, how much of the frame the chart takes, and
// whether the number or the sentence leads. The composition carries meaning rather than
// variety: a detector whose point is one figure with no counterpart is centred, because the
// empty half IS the message; a deadline gets a banner head; the two guards get the filled red
// head, which across twenty-five frames appears twice and therefore still interrupts.

import type { AccountChart } from './account-chart';
import { headlineAgreesWithChart } from './account-chart';
import type {
  AccountCandidate,
  AccountDetector,
  CandidateHeadline,
  ImpactClass,
} from './account-strategy';
import { perPeriod } from './account-strategy';

/** Colour is the KIND OF MONEY, never decoration and never tone of voice. */
const CLASS_INK: Record<
  ImpactClass,
  { ink: string; bg: string; fill: string; ink2: string; wash: string }
> = {
  recoverable: {
    ink: '#0F6B3F',
    bg: '#F4FAF6',
    fill: 'rgba(15,107,63,.14)',
    ink2: 'rgba(15,107,63,.36)',
    wash: 'rgba(15,107,63,.07)',
  },
  better_price: {
    ink: '#26429E',
    bg: '#F5F7FC',
    fill: 'rgba(38,66,158,.14)',
    ink2: 'rgba(38,66,158,.36)',
    wash: 'rgba(38,66,158,.07)',
  },
  deferred: {
    ink: '#8A6206',
    bg: '#FCF9F3',
    fill: 'rgba(138,98,6,.14)',
    ink2: 'rgba(138,98,6,.36)',
    wash: 'rgba(138,98,6,.07)',
  },
};

const GUARD_INK = {
  ink: '#A8322A',
  bg: '#FDF6F5',
  fill: 'rgba(168,50,42,.14)',
  ink2: 'rgba(168,50,42,.36)',
  wash: 'rgba(168,50,42,.07)',
};

/**
 * The eleven ways a frame can be laid out.
 *
 * Not eleven decorations. Each answers a different question about where the reader's eye
 * should land first, and a detector is assigned the one that matches what it is saying.
 */
export const CARD_COMPOSITIONS = [
  /** The money is the point; bars explain it underneath. */
  'figure-top',
  /** Read the chart, then the price — for a card whose evidence earns the number. */
  'figure-foot',
  /** The chart leads and the sentence closes. */
  'chart-lead',
  /** Two halves side by side; the gap between them is the argument. */
  'two-halves',
  /** A narrow plot on the flank, for a line that only needs to rise. */
  'flank',
  /** Full bleed, washed foot — the chart owns the frame. */
  'bleed',
  /** A filled head carrying the title. Used sparingly, so it still interrupts. */
  'banner',
  /** One figure, no counterpart. The empty half is the message. */
  'centre',
  /** A black rule over the title. Editorial, for a card that argues. */
  'ruled',
  /** Named rows on one scale. */
  'rows',
  /** A small square plot beside the words. */
  'stamp',
] as const;
export type CardComposition = (typeof CARD_COMPOSITIONS)[number];

/** Which layout each detector gets. Exhaustive by construction — the type demands all 25. */
export const COMPOSITION_BY_DETECTOR: Record<AccountDetector, CardComposition> = {
  portfolio_reallocation: 'figure-top',
  placement_mix: 'two-halves',
  format_gap: 'flank',
  market_allocation: 'banner',
  optimization_event: 'ruled',

  structure_consolidation: 'bleed',
  bid_strategy: 'figure-foot',

  funnel_coverage: 'chart-lead',
  testing_discipline: 'centre',
  new_vs_returning: 'figure-top',
  platform_diversification: 'centre',
  angle_concentration: 'rows',

  creative_supply: 'bleed',
  account_pacing: 'figure-foot',
  decision_window: 'centre',
  auction_pressure: 'flank',
  account_saturation: 'ruled',
  seasonality: 'banner',
  audience_overlap: 'figure-top',

  dead_tail: 'figure-top',
  measurement_integrity: 'banner',

  scale_readiness: 'figure-foot',
  guardrail_bottleneck: 'chart-lead',

  post_click: 'stamp',
  target_economics: 'ruled',
};

/**
 * The hard budget on the frame's one line of copy.
 *
 * Sixty characters is about what fits on two lines at the frame's sentence size without
 * squeezing the chart's band. Longer text is clipped on a word boundary rather than allowed to
 * push the layout around — the full sentence lives on the screen, not on a shareable frame.
 */
export const LINE_BUDGET = 60;

/**
 * The budget on the words BESIDE the figure, which is a different budget entirely.
 *
 * The line sits on its own and may take two rows; the headline label sits on the baseline of a
 * 38px figure and has one. Twenty-four characters is what fits there before it wraps under the
 * figure and pulls the declared band out of shape.
 */
export const HEADLINE_LABEL_BUDGET = 24;

export function clipLine(text: string, budget = LINE_BUDGET): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= budget) return clean;
  const cut = clean.slice(0, budget - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > budget * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]$/, '')}…`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pct(part: number, whole: number): number {
  if (!(whole > 0) || !(part > 0)) return 0;
  return Math.min(100, Math.round((part / whole) * 1000) / 10);
}

function money(value: number, currency: string | null): string {
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  const body = value.toFixed(digits);
  if (!currency) return body;
  return currency === 'USD' ? `$${body}` : `${body} ${currency}`;
}

/**
 * Money's support line: the same figure per day and per month.
 *
 * The one place `/day` is written on a frame. It used to be a literal in the figure row, which
 * is why a card could only ever say the small number — a person reading "2/day" has to do the
 * month in their head, and a person reading "2/day · 60/mo" does not.
 */
function moneyLine(perDay: number, currency: string | null): string {
  const { day, month } = perPeriod(perDay);
  return `${money(day, currency)}/day · ${money(month, currency)}/mo`;
}

/**
 * The headline's figure, printed.
 *
 * `unit` decides this and nothing else: the words are the detector's `label`, which carries its
 * own period and its own direction ("a day undelivered", "under plan") so nothing is glued on
 * here. A renderer that appends "/day" to a label that already ends in one is how "12% cheaper
 * /day" gets shipped.
 */
function headlineFigure(headline: CandidateHeadline, currency: string | null): string {
  switch (headline.unit) {
    case 'percent':
      return `${headline.value}%`;
    case 'currency_per_day':
      return money(headline.value, currency);
    case 'count':
      return String(headline.value);
  }
}

/**
 * Every number this card is allowed to print.
 *
 * The model-side digit gate, turned on the generator itself. A compiler cannot hallucinate but
 * it can absolutely carry a stale constant, and that is what this catches.
 */
export function cardFigures(candidate: AccountCandidate): number[] {
  // The month is on the frame now, so it is a figure the card prints and the gate must know.
  // Computed through `perPeriod`, the same call the renderer makes, so the two cannot drift.
  const out: number[] = [candidate.impact_per_day, perPeriod(candidate.impact_per_day).month];
  const headline = candidate.headline;
  if (headline) {
    out.push(headline.value);
    if (headline.from != null) out.push(headline.from);
    if (headline.to != null) out.push(headline.to);
  }
  // `cardChart`, not `candidate.chart`: a chart the frame refuses to draw prints no figures,
  // and an allowlist that still names them is an allowlist that has stopped describing the card.
  const chart = cardChart(candidate);
  if (!chart) return out;
  switch (chart.shape) {
    case 'transfer':
      out.push(
        chart.from.cost_per_result,
        chart.to.cost_per_result,
        chart.movable_per_day,
        chart.saving_per_day,
      );
      break;
    case 'threshold':
      out.push(chart.threshold, ...chart.bars.map((b) => b.value));
      if (chart.combined) out.push(chart.combined.value);
      break;
    case 'share':
      out.push(...chart.slices.map((s) => s.value));
      break;
    case 'rates':
      out.push(...chart.points.map((p) => p.a));
      if (chart.gap_per_day != null) out.push(chart.gap_per_day);
      break;
    case 'interval':
      out.push(chart.low, chart.high);
      if (chart.estimate != null) out.push(chart.estimate);
      if (chart.reference != null) out.push(chart.reference);
      if (chart.at_stake_per_day != null) out.push(chart.at_stake_per_day);
      break;
    case 'headroom':
      for (const gauge of chart.gauges) out.push(gauge.value, gauge.ceiling);
      if (chart.step_per_day != null) out.push(chart.step_per_day);
      break;
    case 'quadrant':
      out.push(chart.x_split, chart.y_split, ...chart.points.flatMap((p) => [p.x, p.y]));
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chart primitives. Each is sized by the band it is handed, never by leftovers.
// ---------------------------------------------------------------------------

function drawChart(chart: AccountChart, currency: string | null, narrow = false): string {
  switch (chart.shape) {
    case 'transfer': {
      const max = Math.max(chart.from.cost_per_result, chart.to.cost_per_result);
      return `<div class="lg2"><span>${esc(chart.from.label)}</span><span class="n">${esc(money(chart.from.cost_per_result, currency))}</span></div>
<div class="bar"><i style="width:${pct(chart.from.cost_per_result, max)}%"></i></div>
<div class="flow"><span class="a-flow"></span></div>
<div class="lg2"><span>${esc(chart.to.label)}</span><span class="n">${esc(money(chart.to.cost_per_result, currency))}</span></div>
<div class="bar"><i style="width:${pct(chart.to.cost_per_result, max)}%"></i></div>`;
    }
    case 'threshold': {
      const max = Math.max(chart.threshold, ...chart.bars.map((b) => b.value)) || 1;
      const bars = chart.bars
        .map(
          (bar, i) =>
            `<span class="a-reach" style="height:${pct(bar.value, max)}%;animation-delay:${(i * 0.12).toFixed(2)}s"></span>`,
        )
        .join('');
      return `<div class="cols"><div class="line" style="bottom:${pct(chart.threshold, max)}%"></div>${bars}</div>
<div class="lg2"><span>${esc(chart.threshold_label)}</span><span class="n">${chart.threshold}</span></div>`;
    }
    case 'share': {
      const slices = chart.slices
        .map(
          (slice, i) =>
            `<span class="${slice.label === chart.focus_label ? 'a-breathe' : ''}" style="flex:${Math.max(slice.value, 0.0001)};opacity:${(1 - i * 0.28).toFixed(2)}"></span>`,
        )
        .join('');
      const first = chart.slices[0]?.label ?? '';
      const last = chart.slices[chart.slices.length - 1]?.label ?? '';
      return `<div class="split">${slices}</div>
<div class="lg2"><span>${esc(first)}</span><span>${esc(last)}</span></div>`;
    }
    case 'rates': {
      const values = chart.points.map((p) => p.a);
      const max = Math.max(...values) || 1;
      const w = narrow ? 60 : 200;
      const step = chart.points.length > 1 ? (w - 8) / (chart.points.length - 1) : 0;
      const path = chart.points
        .map((p, i) => `${(4 + i * step).toFixed(1)},${(84 - (p.a / max) * 74).toFixed(1)}`)
        .join(' ');
      const lastX = (4 + (chart.points.length - 1) * step).toFixed(1);
      const lastY = (84 - ((values[values.length - 1] ?? 0) / max) * 74).toFixed(1);
      // No `preserveAspectRatio="none"` here on purpose: stretching the box would turn the
      // endpoint's halo into an ellipse, and that halo is this shape's only moving element.
      return `<svg class="plot" viewBox="0 0 ${w} 92" role="img" aria-label="${esc(chart.a_label)} against ${esc(chart.b_label)}">
  <polyline points="${path}" fill="none" stroke="var(--ink)" stroke-width="3.5" stroke-linejoin="round"/>
  <circle class="a-halo" cx="${lastX}" cy="${lastY}" r="6" fill="var(--ink)"/>
  <circle cx="${lastX}" cy="${lastY}" r="4" fill="var(--ink)"/>
</svg>
<div class="lg2"><span>${esc(chart.a_label)}</span><span>${esc(chart.b_label)}</span></div>`;
    }
    case 'interval': {
      const max = Math.max(chart.high, chart.reference ?? 0) || 1;
      const left = pct(chart.low, max);
      const width = Math.max(pct(chart.high, max) - left, 3);
      const ref = chart.reference != null ? pct(chart.reference, max) : null;
      return `<div class="iv">
  ${ref != null ? `<span class="ref" style="left:${ref}%"></span>` : ''}
  <span class="ivband a-widen" style="left:${left}%;width:${width}%"></span>
</div>
<div class="lg2"><span>${chart.no_results ? 'no results — no upper bound' : 'the estimate, with its interval'}</span>${chart.reference_label ? `<span>${esc(chart.reference_label)}</span>` : ''}</div>`;
    }
    case 'headroom': {
      const gauge = chart.gauges[0];
      if (!gauge) return '';
      const at = pct(gauge.value, gauge.ceiling);
      return `<div class="gauge"><i style="width:${at}%"></i><span class="mk a-nudge" style="left:${at}%"></span></div>
<div class="lg2"><span class="n">${esc(money(gauge.value, currency))}</span><span class="n">ceiling ${esc(money(gauge.ceiling, currency))}</span></div>`;
    }
    case 'quadrant': {
      const xs = chart.points.map((p) => p.x);
      const ys = chart.points.map((p) => p.y);
      const xMax = Math.max(...xs, chart.x_split) || 1;
      const yMax = Math.max(...ys, chart.y_split) || 1;
      const w = narrow ? 84 : 200;
      const vx = (v: number) => (4 + (v / xMax) * (w - 8)).toFixed(1);
      const vy = (v: number) => (84 - (v / yMax) * 76).toFixed(1);
      const dots = chart.points
        .map(
          (p) =>
            `<circle class="a-drift" cx="${vx(p.x)}" cy="${vy(p.y)}" r="6" fill="var(--ink)"/>`,
        )
        .join('');
      return `<svg class="plot" viewBox="0 0 ${w} 92" role="img" aria-label="${esc(chart.x_label)} against ${esc(chart.y_label)}">
  <rect x="4" y="4" width="${w - 8}" height="80" fill="none" stroke="var(--ink)" stroke-width="1.5" opacity=".28"/>
  <line x1="${vx(chart.x_split)}" y1="4" x2="${vx(chart.x_split)}" y2="84" stroke="var(--ink)" stroke-width="1.5" opacity=".28"/>
  <line x1="4" y1="${vy(chart.y_split)}" x2="${w - 4}" y2="${vy(chart.y_split)}" stroke="var(--ink)" stroke-width="1.5" opacity=".28"/>
  ${dots}
</svg>
<div class="lg2"><span>${esc(chart.x_label)}</span><span>${esc(chart.y_label)}</span></div>`;
    }
  }
}

// ---------------------------------------------------------------------------
// The compositions. Each places the same five parts differently.
// ---------------------------------------------------------------------------

type Parts = {
  kicker: string;
  figure: string;
  line: string;
  chart: string;
  foot: string;
};

function layout(composition: CardComposition, p: Parts): string {
  const k = `<div class="k">${p.kicker}</div>`;
  const fig = p.figure ? `<div class="figrow">${p.figure}</div>` : '';
  const line = p.line ? `<div class="say">${p.line}</div>` : '';
  const band = p.chart ? `<div class="band">${p.chart}</div>` : `<div class="band">${line}</div>`;
  const ft = `<div class="ft"><i></i>${p.foot}</div>`;

  switch (composition) {
    case 'figure-top':
      return `<main class="fr c-figtop">${k}${fig}${band}${p.chart ? `<div class="note">${p.line}</div>` : ''}${ft}</main>`;
    case 'figure-foot':
      return `<main class="fr c-figbot">${k}${band}${fig}${ft}</main>`;
    case 'chart-lead':
      return `<main class="fr c-chartlead">${k}${band}${fig}${ft}</main>`;
    case 'two-halves':
      return `<main class="fr c-split">${k}<div class="two"><div>${fig}</div><div>${p.chart || line}</div></div>${ft}</main>`;
    case 'flank':
      return `<main class="fr c-side">${k}<div class="band">${fig}${line}</div><div class="band flankplot">${p.chart}</div>${ft}</main>`;
    case 'bleed':
      return `<main class="fr c-bleed"><div class="plotbox">${k}<div class="band">${p.chart}</div></div><div class="foot">${fig}<div class="note">${p.line}</div>${ft}</div></main>`;
    case 'banner':
      return `<main class="fr c-banner"><div class="bn">${k}</div><div class="bd">${fig}<div class="band">${p.chart || line}</div></div><div class="fo">${ft}</div></main>`;
    case 'centre':
      return `<main class="fr c-centre">${k}${fig}<div class="note">${p.line}</div>${ft}</main>`;
    case 'ruled':
      return `<main class="fr c-rule"><div class="hr"></div>${k}<div class="band">${line}${p.chart}</div>${fig}${ft}</main>`;
    case 'rows':
      return `<main class="fr c-chartlead">${k}${band}${fig}${ft}</main>`;
    case 'stamp':
      return `<main class="fr c-side">${k}<div class="band">${line}${fig}</div><div class="band flankplot">${p.chart}</div>${ft}</main>`;
  }
}

/** One type ramp, one set of primitives, every band declared. Drawn for the frame. */
const FRAME_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%}
  body{background:var(--bg);color:#151820;font-family:"Inter","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif}
  .fr{width:100%;height:100%;position:relative;overflow:hidden;padding:20px;display:grid;gap:0}
  .k{font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--ink);opacity:.8;line-height:1.25}
  .figrow{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap}
  .fig{font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;font-size:38px;font-weight:500;line-height:.94;letter-spacing:-.035em;font-variant-numeric:tabular-nums;color:var(--ink)}
  .unit{font-family:"SFMono-Regular",Consolas,monospace;font-size:15px;opacity:.5;color:var(--ink)}
  .money{font-family:"SFMono-Regular",Consolas,monospace;font-size:11px;font-variant-numeric:tabular-nums;opacity:.58;color:var(--ink);white-space:nowrap}
  .say{font-size:15px;line-height:1.2;font-weight:600;letter-spacing:-.012em}
  .note{font-size:11px;line-height:1.35;opacity:.68}
  .ft{font-size:9px;letter-spacing:.13em;text-transform:uppercase;font-weight:600;color:var(--ink);opacity:.62;display:flex;align-items:center;gap:6px}
  .ft i{width:4px;height:4px;border-radius:50%;background:currentColor;flex:none}
  .n{font-family:"SFMono-Regular",Consolas,monospace;font-variant-numeric:tabular-nums}
  .band{min-height:0;display:flex;flex-direction:column;justify-content:center;gap:5px}
  .bar{height:7px;border-radius:4px;background:var(--fill);overflow:hidden}
  .bar i{display:block;height:100%;border-radius:4px;background:var(--ink)}
  .lg2{display:flex;justify-content:space-between;gap:8px;font-size:10px;opacity:.66;line-height:1.2}
  .flow{position:relative;height:13px}
  .flow .a-flow{position:absolute;left:6px;top:4px;width:30px;height:5px;border-radius:3px;background:var(--ink);opacity:0}
  .split{display:flex;height:18px;border-radius:5px;overflow:hidden}
  .split span{background:var(--ink);transform-origin:left}
  .cols{display:flex;align-items:flex-end;gap:6px;flex:1;min-height:60px;position:relative}
  .cols span{flex:1;background:var(--ink);border-radius:3px 3px 0 0;transform-origin:bottom}
  .cols .line{position:absolute;left:0;right:0;height:2px;background:var(--ink);opacity:.75}
  .gauge{position:relative;height:18px;border-radius:5px;background:var(--fill)}
  .gauge i{display:block;height:100%;border-radius:5px;background:var(--ink)}
  .gauge .mk{position:absolute;top:-4px;bottom:-4px;width:2px;background:#151820}
  .iv{position:relative;height:26px}
  .iv .ivband{position:absolute;top:5px;height:16px;border-radius:8px;background:var(--fill)}
  .iv .ref{position:absolute;top:0;bottom:0;width:2px;background:var(--ink)}
  svg.plot{width:100%;flex:1;min-height:0;display:block}

  .c-figtop{grid-template-rows:auto auto 1fr auto auto;row-gap:10px}
  .c-figbot{grid-template-rows:auto 1fr auto auto;row-gap:11px}
  .c-chartlead{grid-template-rows:auto 1fr auto auto;row-gap:12px}
  .c-split{grid-template-rows:auto 1fr auto;row-gap:12px}
  .c-split .two{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:end;min-height:0}
  .c-side{grid-template-columns:1fr 92px;grid-template-rows:auto 1fr auto;column-gap:12px;row-gap:10px}
  .c-side>.k,.c-side>.ft{grid-column:1/3}
  .c-side .flankplot{justify-content:flex-end}
  .c-bleed{padding:0;grid-template-rows:1fr auto}
  .c-bleed .plotbox{padding:20px 20px 0;min-height:0;display:grid;grid-template-rows:auto 1fr;gap:12px}
  .c-bleed .foot{padding:12px 20px 18px;background:var(--wash);display:grid;gap:8px}
  .c-banner{padding:0;grid-template-rows:auto 1fr auto}
  .c-banner .bn{background:var(--ink);padding:11px 20px}
  .c-banner .bn .k{color:#fff;opacity:.92}
  .c-banner .bd{padding:16px 20px;min-height:0;display:grid;grid-template-rows:auto 1fr;gap:11px}
  .c-banner .fo{padding:0 20px 16px}
  .c-centre{place-content:center;text-align:center;grid-template-rows:auto auto auto auto;row-gap:11px}
  .c-centre .figrow{justify-content:center}
  .c-centre .fig{font-size:52px}
  .c-centre .ft{justify-content:center}
  .c-rule{grid-template-rows:auto auto 1fr auto auto;row-gap:10px}
  .c-rule .hr{height:2px;background:var(--ink);opacity:.85}

  @keyframes hf-flow{0%{transform:translateX(0);opacity:0}4%{opacity:.9}17%{transform:translateX(150px);opacity:0}100%{transform:translateX(150px);opacity:0}}
  @keyframes hf-reach{0%,100%{transform:scaleY(1)}7%{transform:scaleY(1.13)}15%{transform:scaleY(1)}}
  @keyframes hf-breathe{0%,100%{transform:scaleX(1)}8%{transform:scaleX(1.035)}18%{transform:scaleX(1)}}
  @keyframes hf-halo{0%,100%{transform:scale(1);opacity:.3}6%{transform:scale(2.6);opacity:.04}13%{transform:scale(1);opacity:.3}}
  @keyframes hf-widen{0%,100%{transform:scaleX(1)}9%{transform:scaleX(1.07)}19%{transform:scaleX(1)}}
  @keyframes hf-nudge{0%,100%{transform:translateX(0)}7%{transform:translateX(7px)}17%{transform:translateX(0)}}
  @keyframes hf-drift{0%,100%{transform:translate(0,0)}8%{transform:translate(4px,-4px)}19%{transform:translate(0,0)}}
  .a-flow{animation:hf-flow 6s infinite}
  .a-reach{animation:hf-reach 6s infinite}
  .a-breathe{animation:hf-breathe 6s infinite}
  .a-halo{animation:hf-halo 6s infinite;transform-box:fill-box;transform-origin:center}
  .a-widen{animation:hf-widen 6s infinite;transform-origin:center}
  .a-nudge{animation:hf-nudge 6s infinite}
  .a-drift{animation:hf-drift 6s infinite;transform-box:fill-box;transform-origin:center}
  @media(prefers-reduced-motion:reduce){
    .a-flow,.a-reach,.a-breathe,.a-halo,.a-widen,.a-nudge,.a-drift{animation:none}
    .a-flow{opacity:.5;transform:translateX(75px)}
  }`;

export type AccountCardHtmlOptions = {
  /** The detector's own label, from ACCOUNT_DETECTOR_META. Passed in to keep this file pure. */
  title: string;
  /**
   * The frame's ONE line of copy, clipped to LINE_BUDGET. Deliberately not `impact_basis`:
   * that is prose written for a hover and it is what wrecked the first pass. Pass the
   * detector's `compares`, or a shorter sentence the caller composes.
   */
  line?: string;
  resultLabel: string;
  currency: string | null;
  /** Guards wear the guard colour and never a money class. */
  isGuard?: boolean;
  readDate?: string;
};

/**
 * The figure row, in one of two arrangements.
 *
 * WITH a headline the detector's own metric leads and money follows as the support line every
 * card shares, which is the whole point of the vocabulary: two cards no longer say the same
 * small sentence, but they still share one line that means the same thing.
 *
 * WITHOUT one the money still leads, so a candidate written before this existed renders as it
 * always did — except that it now says the month as well as the day, because "2/day" is the
 * figure a person has to finish in their head.
 */
function figureRow(candidate: AccountCandidate, currency: string | null): string {
  if (!(candidate.impact_per_day > 0) && !candidate.headline) return '';
  const support = candidate.impact_per_day > 0 ? moneyLine(candidate.impact_per_day, currency) : '';
  const headline = candidate.headline;
  if (headline) {
    return (
      `<span class="fig">${esc(headlineFigure(headline, currency))}</span>` +
      `<span class="unit">${esc(clipLine(headline.label, HEADLINE_LABEL_BUDGET))}</span>` +
      (support ? `<span class="money">${esc(support)}</span>` : '')
    );
  }
  const month = money(perPeriod(candidate.impact_per_day).month, currency);
  return (
    `<span class="fig">${esc(money(candidate.impact_per_day, currency))}</span>` +
    `<span class="unit">/day</span>` +
    `<span class="money">${esc(`· ${month}/mo`)}</span>`
  );
}

/**
 * The chart this frame is allowed to draw — the candidate's, or none.
 *
 * A frame carries one figure and one drawing, and a reader takes them as one argument because
 * they are inside one border. So the drawing has to be about the figure. When
 * `headlineAgreesWithChart` cannot find the headline's own sides anywhere on the chart, the two
 * are about different quantities, and printing both is worse than printing one: the reader is
 * handed a number and a picture and left to discover they do not meet.
 *
 * Dropping the chart rather than the headline is deliberate. The headline is the detector's own
 * finding and the whole point of the vocabulary; the chart is the part that wandered. The frame
 * keeps its composition — the band falls back to the sentence, which is what `layout` already
 * does for a chartless card — so nothing downstream has to know this happened, and the day the
 * detector's chart draws its own headline again the picture comes straight back.
 */
export function cardChart(candidate: AccountCandidate): AccountChart | null {
  if (!candidate.chart) return null;
  return headlineAgreesWithChart(candidate.headline, candidate.chart) ? candidate.chart : null;
}

/**
 * One card, as a complete HTML document with no network dependency of any kind.
 *
 * Self-containment is asserted by its own test: no http:, no https:, no url(), no script,
 * link or iframe tag. A browser encoding this to MP4 offline sees what a reader sees.
 */
export function accountCardHtml(
  candidate: AccountCandidate,
  options: AccountCardHtmlOptions,
): string {
  const palette = options.isGuard ? GUARD_INK : CLASS_INK[candidate.impact_class];
  const composition = COMPOSITION_BY_DETECTOR[candidate.detector];
  const narrow = composition === 'flank' || composition === 'stamp';
  const figure = figureRow(candidate, options.currency);
  const chart = cardChart(candidate);

  const html = layout(composition, {
    kicker: esc(options.title),
    figure,
    line: esc(clipLine(options.line ?? '')),
    chart: chart ? drawChart(chart, options.currency, narrow) : '',
    foot: `${options.isGuard ? 'Guard' : 'Trigger'} · ${esc(candidate.detector)}${options.readDate ? ` · ${esc(options.readDate)}` : ''}`,
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(options.title)}</title>
<style>
  :root{--ink:${palette.ink};--bg:${palette.bg};--fill:${palette.fill};--ink2:${palette.ink2};--wash:${palette.wash}}
${FRAME_CSS}
</style></head>
<body>${html}</body></html>`;
}
