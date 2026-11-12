// Pure models behind the agent-ui components: run spans (trace and cost waterfalls), the
// context-window map, attempts and judge brackets, and the away recap. No React here, so every
// rule the components lean on is tested on its own in model.test.ts.

export type RunSpanKind = 'agent' | 'llm' | 'tool';
export type RunSpanStatus = 'running' | 'ok' | 'error';

/**
 * One step of an agent run — an agent, an LLM call or a tool call. Times are ms on the run's
 * clock; `endMs` is absent while the step runs. Cost and tokens are the step's own, never its
 * children's (Backend runForensics: model calls carry tokens, tool executions carry timing).
 */
export type RunSpan = {
  id: string;
  parentId?: string;
  kind: RunSpanKind;
  name: string;
  detail?: string;
  startMs: number;
  endMs?: number;
  tokens?: number;
  costUsd?: number;
  status: RunSpanStatus;
};

export type SpanRow = {
  span: RunSpan;
  depth: number;
  hasChildren: boolean;
  /** Own cost plus every descendant's. */
  costUsd: number;
  tokens: number;
};

export function spanEnd(span: RunSpan, nowMs: number): number {
  return span.endMs ?? Math.max(nowMs, span.startMs);
}

const byStart = (a: RunSpan, b: RunSpan) => a.startMs - b.startMs;

/** Depth-first rows, children in start order. A span whose parent is missing is a root, and a
 *  parent cycle is broken rather than dropped, so a malformed run still shows every step. */
export function orderSpans(spans: RunSpan[]): SpanRow[] {
  const ids = new Set(spans.map((s) => s.id));
  const children = new Map<string | undefined, RunSpan[]>();
  for (const s of spans) {
    const parent =
      s.parentId && s.parentId !== s.id && ids.has(s.parentId) ? s.parentId : undefined;
    children.set(parent, [...(children.get(parent) ?? []), s]);
  }
  for (const list of children.values()) list.sort(byStart);

  const rows: SpanRow[] = [];
  const visited = new Set<string>();
  const visit = (span: RunSpan, depth: number): SpanRow => {
    visited.add(span.id);
    const row: SpanRow = {
      span,
      depth,
      hasChildren: false,
      costUsd: span.costUsd ?? 0,
      tokens: span.tokens ?? 0,
    };
    rows.push(row);
    for (const child of children.get(span.id) ?? []) {
      if (visited.has(child.id)) continue;
      row.hasChildren = true;
      const sub = visit(child, depth + 1);
      row.costUsd += sub.costUsd;
      row.tokens += sub.tokens;
    }
    return row;
  };
  for (const root of children.get(undefined) ?? []) visit(root, 0);
  for (const s of [...spans].sort(byStart)) if (!visited.has(s.id)) visit(s, 0);
  return rows;
}

export function visibleRows(rows: SpanRow[], collapsed: ReadonlySet<string>): SpanRow[] {
  const out: SpanRow[] = [];
  let hideBelow = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.depth > hideBelow) continue;
    hideBelow =
      row.hasChildren && collapsed.has(row.span.id) ? row.depth : Number.POSITIVE_INFINITY;
    out.push(row);
  }
  return out;
}

export type RunSummary = {
  startMs: number;
  durationMs: number;
  costUsd: number;
  tokens: number;
  llmCalls: number;
  toolCalls: number;
  errors: number;
  live: boolean;
};

export function summarizeRun(spans: RunSpan[], nowMs: number): RunSummary {
  if (spans.length === 0) {
    return {
      startMs: 0,
      durationMs: 0,
      costUsd: 0,
      tokens: 0,
      llmCalls: 0,
      toolCalls: 0,
      errors: 0,
      live: false,
    };
  }
  const startMs = Math.min(...spans.map((s) => s.startMs));
  const endMs = Math.max(...spans.map((s) => spanEnd(s, nowMs)));
  const count = (test: (s: RunSpan) => boolean) => spans.filter(test).length;
  return {
    startMs,
    durationMs: endMs - startMs,
    costUsd: spans.reduce((sum, s) => sum + (s.costUsd ?? 0), 0),
    tokens: spans.reduce((sum, s) => sum + (s.tokens ?? 0), 0),
    llmCalls: count((s) => s.kind === 'llm'),
    toolCalls: count((s) => s.kind === 'tool'),
    errors: count((s) => s.status === 'error'),
    live: spans.some((s) => s.status === 'running'),
  };
}

/** The longest finished call. Agents only contain calls, and a running call has no length yet. */
export function slowestSpan(spans: RunSpan[]): string | undefined {
  const finished = spans.filter((s) => s.kind !== 'agent' && s.endMs !== undefined);
  if (finished.length < 2) return undefined;
  return finished.reduce((a, b) =>
    (b.endMs ?? 0) - b.startMs > (a.endMs ?? 0) - a.startMs ? b : a,
  ).id;
}

/** Axis ticks at a 1/2/5 × 10^n step, about `target` of them. */
export function niceTicks(durationMs: number, target = 4): number[] {
  if (!(durationMs > 0)) return [0];
  const raw = durationMs / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.floor(durationMs / step) + 1 }, (_, i) => i * step);
}

export type CostMetric = 'cost' | 'tokens';
export type CostStep = { span: RunSpan; value: number; offset: number; share: number };

/** Every step that cost something, most expensive first; each bar starts where the one above
 *  ended, so the column reads as the running total. Shares are of the run total. */
export function costSteps(
  spans: RunSpan[],
  metric: CostMetric,
): { steps: CostStep[]; total: number } {
  const valued = spans
    .map((span) => ({ span, value: (metric === 'cost' ? span.costUsd : span.tokens) ?? 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = valued.reduce((sum, x) => sum + x.value, 0);
  let running = 0;
  const steps = valued.map(({ span, value }) => {
    const step = { span, value, offset: running / total, share: value / total };
    running += value;
    return step;
  });
  return { steps, total };
}

export type ContextPartKind = 'system' | 'tools' | 'memory' | 'files' | 'history' | 'results';
export const CONTEXT_KINDS: readonly ContextPartKind[] = [
  'system',
  'tools',
  'memory',
  'files',
  'history',
  'results',
];
export type ContextPart = { id: string; kind: ContextPartKind; label: string; tokens: number };
export type ContextGroup = {
  kind: ContextPartKind;
  tokens: number;
  share: number;
  parts: ContextPart[];
};

/** Groups in a fixed kind order, biggest part first. Shares are of the window, or of what is
 *  used once that overflows it, so the map always fills exactly. */
export function layoutContext(parts: ContextPart[], maxTokens: number) {
  const usedTokens = parts.reduce((sum, p) => sum + Math.max(0, p.tokens), 0);
  const scale = Math.max(usedTokens, maxTokens) || 1;
  const groups: ContextGroup[] = CONTEXT_KINDS.map((kind) => {
    const own = parts
      .filter((p) => p.kind === kind && p.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens);
    const tokens = own.reduce((sum, p) => sum + p.tokens, 0);
    return { kind, tokens, share: tokens / scale, parts: own };
  }).filter((g) => g.tokens > 0);
  const freeTokens = Math.max(0, maxTokens - usedTokens);
  return {
    groups,
    usedTokens,
    freeTokens,
    freeShare: freeTokens / scale,
    over: usedTokens > maxTokens,
  };
}

export type AttemptStatus = 'queued' | 'running' | 'done' | 'failed';

/** One of several tries at the same task (a pipeline run receipt: status, quality score, cost). */
export type Attempt = {
  id: string;
  label: string;
  model?: string;
  approach?: string;
  status: AttemptStatus;
  /** 0–1 while running. */
  progress?: number;
  /** 0–1 once done. */
  score?: number;
  costUsd?: number;
  durationMs?: number;
  error?: string;
};

export function bestAttempt(attempts: Attempt[]): string | undefined {
  let best: Attempt | undefined;
  for (const a of attempts) {
    if (a.status !== 'done' || a.score === undefined || !Number.isFinite(a.score)) continue;
    if (!best || a.score > (best.score ?? 0)) best = a;
  }
  return best?.id;
}

export type BracketEntrant = { id: string; label: string; detail?: string; summary?: string };
export type BracketMatch = {
  a: string;
  /** Absent for a bye. */
  b?: string;
  winner?: string;
  reason?: string;
  scores?: Record<string, number>;
};

/** Matches per round for a field of `entrants`, byes rounding up. */
export function bracketRounds(entrants: number): number[] {
  const counts: number[] = [];
  for (let n = entrants; n > 1; ) {
    n = Math.ceil(n / 2);
    counts.push(n);
  }
  return counts;
}

/** The champion and the `round:match` keys it won through — empty until the final is decided. */
export function championPath(rounds: BracketMatch[][], roundCount: number) {
  const champion = rounds[roundCount - 1]?.[0]?.winner;
  const keys = new Set<string>();
  if (champion) {
    rounds.forEach((matches, r) => {
      matches.forEach((m, i) => {
        if (m.winner === champion) keys.add(`${r}:${i}`);
      });
    });
  }
  return { champion, keys };
}

export type RecapTone = 'needs' | 'failed' | 'done';
export const RECAP_TONES: readonly RecapTone[] = ['needs', 'failed', 'done'];

/** Something that happened while the user was away (an Optimizer action row, a pending
 *  recommendation, a finished or failed job). `at` is epoch ms. */
export type RecapItem = {
  id: string;
  at: number;
  tone: RecapTone;
  title: string;
  detail?: string;
  actionLabel?: string;
};

export function groupRecap(items: RecapItem[]): Record<RecapTone, RecapItem[]> {
  const newest = [...items].sort((a, b) => b.at - a.at);
  return {
    needs: newest.filter((i) => i.tone === 'needs'),
    failed: newest.filter((i) => i.tone === 'failed'),
    done: newest.filter((i) => i.tone === 'done'),
  };
}

export function recapBins(items: RecapItem[], since: number, until: number, count: number) {
  const width = (until - since) / count;
  const bins = Array.from({ length: count }, (_, i) => ({
    start: since + i * width,
    counts: { needs: 0, failed: 0, done: 0 } as Record<RecapTone, number>,
  }));
  for (const item of items) {
    if (item.at < since || item.at > until) continue;
    bins[Math.min(count - 1, Math.floor((item.at - since) / width))].counts[item.tone] += 1;
  }
  return bins;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatAway(ms: number): string {
  if (ms < MINUTE) return '<1m';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m`;
  return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`;
}

export function formatClock(ms: number, locale = 'en'): string {
  if (ms >= MINUTE)
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(+(ms / MINUTE).toFixed(1))}m`;
  if (ms >= 1000)
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(+(ms / 1000).toFixed(1))}s`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(ms))}ms`;
}

export function formatUsd(value: number, locale = 'en'): string {
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatTokens(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}
