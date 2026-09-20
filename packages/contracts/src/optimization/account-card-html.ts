// An account-read card as a self-contained HyperFrame.
//
// WHY THIS IS COMPILED AND NOT DRAFTED, which is the whole design decision:
//
// The HyperFrames agent drafts HTML with a model — grounded, linted, and measured at ~117
// seconds of model call for a 5-second composition. That is the right shape for a creative,
// where the model IS the author. It is the wrong shape for an optimizer card, where the
// entire discipline is that figures come from a detector and the model may not author them.
// Asking a model to write the HTML for a card whose numbers it is forbidden to invent means
// building a digit gate around the output and hoping.
//
// So a Jaina hyperframe is RENDERED from the candidate, in code. No model call, no gate to
// enforce, no 117 seconds — and the strongest possible version of the rule, because a
// generator with no model in it cannot invent a figure even by accident. `cardFigures()`
// below pins that: the test asserts every digit in the emitted HTML came from the candidate.
//
// What it keeps from HyperFrames: self-containment. One HTML document, no network at all, so
// the browser that seeks it frame-by-frame to encode an MP4 sees exactly what a reader sees.
//
// What it deliberately does NOT keep: an embedded font. A HyperFrame for a creative embeds
// its brand face as a data URI; this one names a system stack, because a card is an
// instrument and a font file would be most of the payload. Say so rather than pretend.
//
// The visual language is the Quiet set: colour is the money class, shape is the comparison,
// and the motion is one six-second loop with about eight-tenths of a second of movement in
// it. No sheen — that was removed deliberately; the only thing that moves is the chart.

import type { AccountChart } from './account-chart';
import type { AccountCandidate, ImpactClass } from './account-strategy';

/** Colour is the KIND OF MONEY, never decoration, and never severity of tone. */
const CLASS_INK: Record<ImpactClass, { ink: string; bg: string; fill: string; ink2: string }> = {
  recoverable: {
    ink: '#0F6B3F',
    bg: '#F4FAF6',
    fill: 'rgba(15,107,63,.15)',
    ink2: 'rgba(15,107,63,.4)',
  },
  better_price: {
    ink: '#26429E',
    bg: '#F5F7FC',
    fill: 'rgba(38,66,158,.15)',
    ink2: 'rgba(38,66,158,.4)',
  },
  deferred: {
    ink: '#8A6206',
    bg: '#FCF9F3',
    fill: 'rgba(138,98,6,.15)',
    ink2: 'rgba(138,98,6,.4)',
  },
};

const GUARD_INK = {
  ink: '#A8322A',
  bg: '#FDF6F5',
  fill: 'rgba(168,50,42,.15)',
  ink2: 'rgba(168,50,42,.4)',
};

/** HTML-escape. Everything that reaches the document goes through here. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Clamp a fraction to a percentage width that cannot escape its track. */
function pct(part: number, whole: number): number {
  if (!(whole > 0) || !(part > 0)) return 0;
  return Math.min(100, Math.round((part / whole) * 1000) / 10);
}

function money(value: number, currency: string | null): string {
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  const body = value.toFixed(digits);
  return currency
    ? `${currency === 'USD' ? '$' : ''}${body}${currency === 'USD' ? '' : ` ${currency}`}`
    : body;
}

/**
 * Every number this card is allowed to print.
 *
 * The same idea as the model-side digit gate, turned on the generator itself: a test walks
 * the emitted HTML and asserts each figure appears here. A compiler cannot hallucinate, but
 * it can absolutely carry a stale constant, and this is what catches that.
 */
export function cardFigures(candidate: AccountCandidate): number[] {
  const out: number[] = [candidate.impact_per_day];
  const chart = candidate.chart;
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

/** The chart, drawn. One function per shape, all of them plain SVG or flex — no library. */
function drawChart(chart: AccountChart, currency: string | null): string {
  switch (chart.shape) {
    case 'transfer': {
      const max = Math.max(chart.from.cost_per_result, chart.to.cost_per_result);
      return `<div class="stk">
  <div class="lgd"><span>${esc(chart.from.label)}</span><span class="n">${esc(money(chart.from.cost_per_result, currency))}</span></div>
  <div class="bar"><i style="width:${pct(chart.from.cost_per_result, max)}%"></i></div>
  <div class="flow"><span class="a-flow"></span></div>
  <div class="lgd"><span>${esc(chart.to.label)}</span><span class="n">${esc(money(chart.to.cost_per_result, currency))}</span></div>
  <div class="bar"><i style="width:${pct(chart.to.cost_per_result, max)}%"></i></div>
</div>`;
    }
    case 'threshold': {
      const max = Math.max(chart.threshold, ...chart.bars.map((b) => b.value)) || 1;
      const bars = chart.bars
        .map(
          (bar, i) =>
            `<span class="a-reach" style="height:${pct(bar.value, max)}%;animation-delay:${i * 0.12}s" title="${esc(bar.label)}"></span>`,
        )
        .join('');
      return `<div class="cols"><div class="line" style="bottom:${pct(chart.threshold, max)}%"></div>${bars}</div>
<div class="lgd"><span>${esc(chart.threshold_label)}</span><span class="n">${chart.threshold}</span></div>`;
    }
    case 'share': {
      const total = chart.slices.reduce((sum, s) => sum + s.value, 0) || 1;
      const slices = chart.slices
        .map(
          (slice, i) =>
            `<span class="${slice.label === chart.focus_label ? 'a-breathe' : ''}" style="flex:${Math.max(slice.value, 0.0001)};opacity:${1 - i * 0.22}" title="${esc(slice.label)}"></span>`,
        )
        .join('');
      return `<div class="split">${slices}</div>
<div class="lgd"><span>${esc(chart.focus_label)}</span><span class="n">${pct(chart.slices.find((s) => s.label === chart.focus_label)?.value ?? 0, total)}%</span></div>`;
    }
    case 'rates': {
      const values = chart.points.map((p) => p.a);
      const max = Math.max(...values) || 1;
      const step = chart.points.length > 1 ? 196 / (chart.points.length - 1) : 0;
      const path = chart.points
        .map((p, i) => `${(6 + i * step).toFixed(1)},${(58 - (p.a / max) * 48).toFixed(1)}`)
        .join(' ');
      const lastX = (6 + (chart.points.length - 1) * step).toFixed(1);
      const lastY = (58 - ((values[values.length - 1] ?? 0) / max) * 48).toFixed(1);
      return `<svg viewBox="0 0 208 64" class="plot" role="img" aria-label="${esc(chart.a_label)} against ${esc(chart.b_label)}">
  <polyline points="${path}" fill="none" stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round"/>
  <circle class="a-halo" cx="${lastX}" cy="${lastY}" r="5" fill="var(--ink)"/>
  <circle cx="${lastX}" cy="${lastY}" r="3.2" fill="var(--ink)"/>
</svg>
<div class="lgd"><span>${esc(chart.a_label)}</span><span>${esc(chart.b_label)}</span></div>`;
    }
    case 'interval': {
      const max = Math.max(chart.high, chart.reference ?? 0) || 1;
      const left = pct(chart.low, max);
      const width = Math.max(pct(chart.high, max) - left, 2);
      const ref = chart.reference != null ? pct(chart.reference, max) : null;
      return `<div class="iv">
  ${ref != null ? `<span class="ref" style="left:${ref}%"></span>` : ''}
  <span class="a-widen band" style="left:${left}%;width:${width}%"></span>
</div>
<div class="lgd"><span>${chart.no_results ? 'no results — no upper bound' : 'estimate with its interval'}</span>${chart.reference_label ? `<span>${esc(chart.reference_label)}</span>` : ''}</div>`;
    }
    case 'headroom': {
      const gauge = chart.gauges[0];
      if (!gauge) return '';
      return `<div class="gauge"><i style="width:${pct(gauge.value, gauge.ceiling)}%"></i><span class="a-nudge mark" style="left:${pct(gauge.value, gauge.ceiling)}%"></span></div>
<div class="lgd"><span>${esc(gauge.label)}</span><span class="n">${esc(money(gauge.value, currency))} of ${esc(money(gauge.ceiling, currency))}</span></div>`;
    }
    case 'quadrant': {
      const xs = chart.points.map((p) => p.x);
      const ys = chart.points.map((p) => p.y);
      const xMax = Math.max(...xs, chart.x_split) || 1;
      const yMax = Math.max(...ys, chart.y_split) || 1;
      const dots = chart.points
        .map(
          (p) =>
            `<circle class="a-drift" cx="${(14 + (p.x / xMax) * 180).toFixed(1)}" cy="${(70 - (p.y / yMax) * 62).toFixed(1)}" r="5" fill="var(--ink)"/>`,
        )
        .join('');
      return `<svg viewBox="0 0 208 80" class="plot" role="img" aria-label="${esc(chart.x_label)} against ${esc(chart.y_label)}">
  <line x1="${(14 + (chart.x_split / xMax) * 180).toFixed(1)}" y1="6" x2="${(14 + (chart.x_split / xMax) * 180).toFixed(1)}" y2="74" stroke="var(--ink)" stroke-width="1" opacity=".3"/>
  <line x1="14" y1="${(70 - (chart.y_split / yMax) * 62).toFixed(1)}" x2="194" y2="${(70 - (chart.y_split / yMax) * 62).toFixed(1)}" stroke="var(--ink)" stroke-width="1" opacity=".3"/>
  ${dots}
</svg>
<div class="lgd"><span>${esc(chart.x_label)}</span><span>${esc(chart.y_label)}</span></div>`;
    }
  }
}

export type AccountCardHtmlOptions = {
  /** The detector's own label, from ACCOUNT_DETECTOR_META. Passed in to keep this file pure. */
  title: string;
  /** The objective's own word for one result. */
  resultLabel: string;
  currency: string | null;
  /** Guards are read before the list and wear the guard colour, never a money class. */
  isGuard?: boolean;
  /** Stamped into the foot so a shared card can always be traced back. */
  readDate?: string;
};

/**
 * One card, as a complete HTML document with no network dependency of any kind.
 *
 * Self-containment is checked by its own test: no `http:`, no `https:`, no `//` host, no
 * `url(` pointing anywhere. A browser encoding this to MP4 offline sees what a reader sees.
 */
export function accountCardHtml(
  candidate: AccountCandidate,
  options: AccountCardHtmlOptions,
): string {
  const palette = options.isGuard ? GUARD_INK : CLASS_INK[candidate.impact_class];
  const chart = candidate.chart ? drawChart(candidate.chart, options.currency) : '';
  const foot = options.isGuard
    ? `Guard · ${esc(candidate.detector)}`
    : `Trigger · ${esc(candidate.detector)}`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(options.title)}</title>
<style>
  :root{--ink:${palette.ink};--bg:${palette.bg};--fill:${palette.fill};--ink2:${palette.ink2}}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%}
  body{background:var(--bg);color:#151820;
    font-family:"Inter","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;
    display:flex;align-items:center;justify-content:center}
  .card{width:100%;height:100%;padding:34px;display:flex;flex-direction:column;justify-content:space-between;gap:16px}
  .k{font-size:17px;letter-spacing:.17em;text-transform:uppercase;font-weight:600;color:var(--ink);opacity:.86}
  .big{font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;
    font-size:64px;font-weight:500;line-height:1;letter-spacing:-.035em;font-variant-numeric:tabular-nums;color:var(--ink)}
  .big s{text-decoration:none;font-size:30px;opacity:.55}
  .mid{font-size:29px;line-height:1.16;font-weight:600;letter-spacing:-.012em}
  .sm{font-size:20px;line-height:1.38;opacity:.74}
  .src{font-size:15px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;color:var(--ink);opacity:.78;
    display:flex;align-items:center;gap:10px}
  .src i{width:9px;height:9px;border-radius:50%;background:currentColor;flex:none}
  .n{font-family:"SFMono-Regular",Consolas,monospace;font-variant-numeric:tabular-nums}
  .stk{display:flex;flex-direction:column;gap:10px}
  .lgd{display:flex;justify-content:space-between;gap:14px;font-size:17px;opacity:.72}
  .bar{height:14px;border-radius:7px;background:var(--fill);overflow:hidden}
  .bar i{display:block;height:100%;border-radius:7px;background:var(--ink)}
  .flow{position:relative;height:20px}
  .flow .a-flow{position:absolute;left:10px;top:7px;width:46px;height:7px;border-radius:4px;background:var(--ink);opacity:0}
  .cols{position:relative;display:flex;align-items:flex-end;gap:12px;height:150px}
  .cols span{flex:1;background:var(--ink);border-radius:5px 5px 0 0;transform-origin:bottom}
  .cols .line{position:absolute;left:0;right:0;height:3px;background:var(--ink);opacity:.8}
  .split{display:flex;height:34px;border-radius:8px;overflow:hidden}
  .split span{background:var(--ink);transform-origin:left}
  .plot{width:100%;height:150px}
  .iv{position:relative;height:40px}
  .iv .band{position:absolute;top:8px;height:24px;border-radius:12px;background:var(--fill)}
  .iv .ref{position:absolute;top:0;bottom:0;width:3px;background:var(--ink)}
  .gauge{position:relative;height:34px;border-radius:8px;background:var(--fill);overflow:visible}
  .gauge i{display:block;height:100%;border-radius:8px;background:var(--ink)}
  .gauge .mark{position:absolute;top:-6px;bottom:-6px;width:3px;background:#151820}

  /* One six-second loop. Under a second of movement, then five seconds of stillness. */
  @keyframes hf-flow{0%{transform:translateX(0);opacity:0}4%{opacity:.9}17%{transform:translateX(300px);opacity:0}100%{transform:translateX(300px);opacity:0}}
  @keyframes hf-reach{0%,100%{transform:scaleY(1)}7%{transform:scaleY(1.13)}15%{transform:scaleY(1)}}
  @keyframes hf-breathe{0%,100%{transform:scaleX(1)}8%{transform:scaleX(1.035)}18%{transform:scaleX(1)}}
  @keyframes hf-halo{0%,100%{transform:scale(1);opacity:.3}6%{transform:scale(2.6);opacity:.04}13%{transform:scale(1);opacity:.3}}
  @keyframes hf-widen{0%,100%{transform:scaleX(1)}9%{transform:scaleX(1.07)}19%{transform:scaleX(1)}}
  @keyframes hf-nudge{0%,100%{transform:translateX(0)}7%{transform:translateX(9px)}17%{transform:translateX(0)}}
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
    .a-flow{opacity:.5;transform:translateX(150px)}
  }
</style></head>
<body><main class="card">
  <div class="k">${esc(options.title)}</div>
  <div class="stk">${chart}</div>
  <div>
    <div class="big">${esc(money(candidate.impact_per_day, options.currency))}<s>/day</s></div>
    <div class="sm">${esc(candidate.impact_basis)}</div>
  </div>
  <div class="src"><i></i>${foot}${options.readDate ? ` · ${esc(options.readDate)}` : ''}</div>
</main></body></html>`;
}
