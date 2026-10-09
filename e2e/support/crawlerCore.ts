// The pure parts of the Performance+ chaos crawler (docs/perfplus-campaign/02-phases.md P2.1):
// the seeded PRNG, the write-safety fence, the selector-signature normaliser that lets the
// crawler dedupe against the P1.3 visual-matrix read, the baseline parser and the
// novelty-weighted picker. No Playwright runtime dependency, so `bun test` covers every rule
// in `crawlerCore.test.ts`; the browser-facing crawler is `e2e/perfplus-crawler.bench.spec.ts`.

/* ------------------------------------------------------------------------- */
/* Seeded randomness                                                          */
/* ------------------------------------------------------------------------- */

/** FNV-1a over the UTF-16 code units of `parts`, joined — one stable 32-bit seed per
 *  (campaign seed, surface, traversal index) so a single traversal replays on its own. */
export function hashSeed(...parts: readonly (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = `${part}\u0000`;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

export type Rng = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
};

/** mulberry32: small, fast, and the same sequence for the same seed on every runtime. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

/** Short, harmless strings the crawler types: no SQL, no HTML, no currency — a value a real
 *  user could leave in a draft field. Seeded so a replay types the same thing. */
export const TYPED_WORDS: readonly string[] = [
  'easy fit',
  'q4 plan',
  'leads',
  '2026-10',
  'mx',
  'tours',
  'cpa 120',
  'hola',
  'test draft',
  'ventas',
];

/* ------------------------------------------------------------------------- */
/* The write-safety fence                                                     */
/* ------------------------------------------------------------------------- */

/** Accessible names and test ids the crawler must never act on. The campaign's list
 *  (approve … new portfolio) plus what this app adds: session (sign out), the brand switcher
 *  (its rows write the active-brand preference), Stripe and credits (checkout sessions),
 *  exports and downloads, notification writes, and Jaina sends. Audited by name in the
 *  envelope: every skipped element is logged. */
export const FENCE_NAME_PATTERN =
  /approve|apply|pause|resume|activate|archive|delete|remove|deploy|publish|revert|run now|run cycle|save|submit|confirm|connect|disconnect|send|unenroll|enroll|create|new portfolio|sign out|log ?out|switch brand|upgrade|subscribe|checkout|\bbuy\b|purchase|top up|\bchoose\b|select plan|pick plan|get started|start (a )?(free )?trial|continue to|pay now|manage plan|change plan|cancel plan|billing portal|credit packs?|promo code|\badd\b|export|download|invite|dismiss|mark (all |as )?(done|read|complete|seen|resolved)?|\bdone\b|complete|accept|decline|reject|validate|generate|rerun|re-run|regenerate|reset|clear|convert|duplicate|clone|rename|assign|set as|make default|enable|disable|turn (on|off)|opt (in|out)|switch to|new (chat|conversation|session)|start (a )?(new )?(chat|conversation)|retry (the )?apply|sync now|refresh token|reauthori[sz]e|redeem|edit tags|\bstop\b|cancel|abort|interrupt|email .*report|email continuum/i;

/** Option names that commit a role, a plan or a status when chosen from a listbox. */
export const FENCE_OPTION_PATTERN =
  /^(owner|admin|editor|viewer|member|manager|done|dismissed|archived|paused|active|performance plus|trends\+|organic|canvas)$/i;

/** Settings: every switch, checkbox, radio and option persists a preference the moment it is
 *  toggled (BrandPulseSection, OptimizerNotificationsSection, AutoBillingControl). Elsewhere a
 *  checkbox is a row selection or a filter and the write sits behind a fenced button. */
export const PREFERENCE_PATH_PATTERN = /^\/settings(\/|\?|#|$)/;

/** Button names that confirm inside a dialog. Cancel / Close / Back are the way out. */
export const DIALOG_CONFIRM_PATTERN =
  /^(ok|okay|yes|continue|proceed|got it|done|accept|agree|i understand|understood)\b/i;

/** Paths a link may lead to and still be "the product under test". A link elsewhere (Forge,
 *  Organic, AI Studio, auth) is fenced as off-surface so a traversal stays on Performance+. */
export const ON_SURFACE_PATH_PATTERN = /^\/(scale|settings|dashboard)(\/|\?|#|$)/;

export type FenceSubject = {
  tag: string;
  role: string | null;
  type: string | null;
  name: string;
  testId: string | null;
  href: string | null;
  target: string | null;
  download: boolean;
  inForm: boolean;
  inDialog: boolean;
  /** The placeholder, for the Jaina composer rule. */
  placeholder: string | null;
};

export type FenceVerdict = { fenced: false } | { fenced: true; reason: string };

/** Why `subject` must not be acted on, or `{ fenced: false }`. `pageOrigin` classifies links. */
export function fenceVerdict(
  subject: FenceSubject,
  pageOrigin: string,
  pagePath = '/',
): FenceVerdict {
  const haystack = `${subject.name} ${subject.testId ?? ''}`.trim();
  if (FENCE_NAME_PATTERN.test(haystack)) {
    return { fenced: true, reason: `name matches the fence: "${haystack.slice(0, 60)}"` };
  }
  if (subject.role === 'option' && FENCE_OPTION_PATTERN.test(subject.name.trim())) {
    return { fenced: true, reason: `option commits a role, plan or status: "${subject.name}"` };
  }
  const isPreferenceControl =
    ['switch', 'checkbox', 'radio', 'option', 'menuitemcheckbox', 'menuitemradio'].includes(
      subject.role ?? '',
    ) ||
    subject.tag === 'select' ||
    (subject.tag === 'input' && (subject.type === 'checkbox' || subject.type === 'radio'));
  if (isPreferenceControl && PREFERENCE_PATH_PATTERN.test(pagePath)) {
    return {
      fenced: true,
      reason: `preference control on ${pagePath.split('?')[0]} persists on toggle: "${subject.name.slice(0, 60)}"`,
    };
  }
  const isButton =
    subject.tag === 'button' ||
    subject.role === 'button' ||
    (subject.tag === 'input' && (subject.type === 'submit' || subject.type === 'button'));
  if (
    subject.inForm &&
    (subject.type === 'submit' || (subject.tag === 'button' && !subject.type))
  ) {
    return { fenced: true, reason: `submit button inside a form: "${subject.name.slice(0, 60)}"` };
  }
  if (subject.inDialog && isButton && DIALOG_CONFIRM_PATTERN.test(subject.name.trim())) {
    return { fenced: true, reason: `confirms inside a dialog: "${subject.name.slice(0, 60)}"` };
  }
  if (subject.tag === 'input' && (subject.type === 'file' || subject.type === 'color')) {
    return { fenced: true, reason: `native ${subject.type} picker` };
  }
  if (subject.download) return { fenced: true, reason: 'download link' };
  if (subject.href !== null) {
    const verdict = linkVerdict(subject.href, subject.target, pageOrigin);
    if (verdict.fenced) return verdict;
  }
  return { fenced: false };
}

function linkVerdict(href: string, target: string | null, pageOrigin: string): FenceVerdict {
  const trimmed = href.trim();
  if (trimmed === '' || trimmed === '#' || trimmed.startsWith('javascript:'))
    return { fenced: false };
  if (/^(mailto|tel|sms):/i.test(trimmed))
    return { fenced: true, reason: `${trimmed.split(':')[0]} link` };
  if (target === '_blank')
    return { fenced: true, reason: `opens a new tab: ${trimmed.slice(0, 80)}` };
  let url: URL;
  try {
    url = new URL(trimmed, pageOrigin);
  } catch {
    return { fenced: true, reason: `unparseable href: ${trimmed.slice(0, 80)}` };
  }
  if (url.origin !== pageOrigin)
    return { fenced: true, reason: `off-origin link: ${url.href.slice(0, 80)}` };
  if (/^\/(logout|api\/auth|auth\/)/.test(url.pathname)) {
    return { fenced: true, reason: `session link: ${url.pathname}` };
  }
  if (!ON_SURFACE_PATH_PATTERN.test(`${url.pathname}${url.search}`)) {
    return { fenced: true, reason: `off-surface link: ${url.pathname}` };
  }
  return { fenced: false };
}

/** The Jaina composer, by its placeholder (JainaChatSurface.tsx): typing is allowed, Enter is
 *  not — Enter sends. */
export const JAINA_COMPOSER_PLACEHOLDER = /Ask Jaina|Reply to Jaina/i;

export function isJainaComposer(placeholder: string | null): boolean {
  return placeholder !== null && JAINA_COMPOSER_PLACEHOLDER.test(placeholder);
}

/* ------------------------------------------------------------------------- */
/* Signatures                                                                 */
/* ------------------------------------------------------------------------- */

/** The selector a detector emits, minus what changes between renders: React `useId` ids
 *  (`#base-ui-_r_7_`, `#_r_m_`), positional `:nth-of-type(3)` / `:nth-child(3)`, and digits
 *  inside quoted test ids. Two violations on the same CLASS of element share a signature. */
export function normalizeSelector(selector: string): string {
  return selector
    .replace(/#base-ui-_r_[a-z0-9]+_/gi, '#base-ui-_r_*_')
    .replace(/#_r_[a-z0-9]+_/gi, '#_r_*_')
    .replace(/#(?:radix|react-aria|headlessui)[-:][a-z0-9:_-]+/gi, '#lib-*')
    .replace(/:nth-(of-type|child)\(\d+\)/g, ':nth-$1(n)')
    .replace(/(\[data-testid="[^"\d]*)\d+([^"]*"\])/g, '$1*$2')
    .trim();
}

const CONTRAST_PAIR = /\((#[0-9a-f]{3,8}) on (#[0-9a-f]{3,8})/i;

/** `rule|normalised selector` — the dedupe key for a visual violation. A contrast violation
 *  keys on its colour pair instead: axe names the same caption by a different selector in
 *  each state, while "#747881 on #0b1220" is the one class a designer fixes once. */
export function visualSignature(rule: string, selector: string, detail = ''): string {
  if (rule === 'contrast') {
    const pair = CONTRAST_PAIR.exec(detail);
    if (pair) return `contrast|${pair[1].toLowerCase()} on ${pair[2].toLowerCase()}`;
  }
  return `${rule}|${normalizeSelector(selector)}`;
}

/** The dedupe key for an L1 failure: its invariant and the evidence with volatile parts
 *  (ids, counts, durations, query strings) stripped, so "hydration mismatch" is one class. */
export function l1Signature(invariant: string, evidence: string): string {
  const stable = evidence
    .split('\n')[0]
    .replace(/\(\+\d+ more\)/g, '')
    .replace(/\s\([^()]*:\d+\)\s*$/, '')
    .replace(/\?[^ )]*/g, '?…')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return `${invariant}|${stable}`;
}

/** The signature of an interactive element, for novelty: what the user would call it, not
 *  where it sits. `name` is the accessible name (or placeholder, or test id). */
export function elementSignature(subject: {
  tag: string;
  role: string | null;
  type: string | null;
  name: string;
  testId: string | null;
}): string {
  const kind =
    subject.role ?? (subject.tag === 'input' ? `input:${subject.type ?? 'text'}` : subject.tag);
  const label = subject.testId
    ? `[${subject.testId.replace(/\d+/g, '*')}]`
    : subject.name.replace(/\s+/g, ' ').replace(/\d+/g, '#').trim().slice(0, 48);
  return `${kind}:${label || '(unnamed)'}`;
}

/* ------------------------------------------------------------------------- */
/* The P1.3 baseline                                                          */
/* ------------------------------------------------------------------------- */

/** One finding line of the visual-matrix read (perfplus-l1v's FINDINGS block):
 *  `    - <surface> @<viewport> <theme> <state> <selector>: <detail> [<screenshot>]`. */
const BASELINE_FINDING_LINE = /^\s+- (.+?) @(\d+) (light|dark) (loaded|empty|error) (.+)$/;
const BASELINE_RULE_LINE = /^ {2}([a-z-]+): \d+$/;

/** The known `rule|selector` signatures of a FINDINGS block as the L1V lane prints it. The
 *  crawler must not re-report the 22 px shared icon button or the 4.41:1 captions row by row:
 *  anything in this set is counted, never a new FAIL row. */
export function parseBaselineSignatures(text: string): Set<string> {
  const known = new Set<string>();
  let rule: string | null = null;
  for (const line of text.split('\n')) {
    const ruleMatch = BASELINE_RULE_LINE.exec(line);
    if (ruleMatch) {
      rule = ruleMatch[1];
      continue;
    }
    if (!rule) continue;
    const finding = BASELINE_FINDING_LINE.exec(line);
    if (!finding) continue;
    const rest = finding[5];
    const split = rest.indexOf(': ');
    const selector = split === -1 ? rest : rest.slice(0, split);
    const detail = split === -1 ? '' : rest.slice(split + 2);
    known.add(visualSignature(rule, selector, detail));
  }
  return known;
}

/* ------------------------------------------------------------------------- */
/* Novelty-weighted picking                                                   */
/* ------------------------------------------------------------------------- */

export type Candidate<T> = { signature: string; item: T };

/** Picks one candidate, preferring signatures never clicked on this surface: an unseen
 *  signature weighs `NOVELTY_WEIGHT`, a seen one weighs 1. A control the user already pressed
 *  is still reachable (menus and tabs need re-pressing), just rarer. */
export const NOVELTY_WEIGHT = 8;

export function pickByNovelty<T>(
  rng: Rng,
  candidates: readonly Candidate<T>[],
  clicked: ReadonlySet<string>,
): Candidate<T> | null {
  if (candidates.length === 0) return null;
  const weights = candidates.map((c) => (clicked.has(c.signature) ? 1 : NOVELTY_WEIGHT));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/* ------------------------------------------------------------------------- */
/* Rows                                                                       */
/* ------------------------------------------------------------------------- */

export type CrawlFailRow = {
  surface: string;
  viewport: number;
  theme: 'light' | 'dark';
  seed: number;
  run: number;
  step: number;
  invariant: string;
  signature: string;
  detail: string;
  /** The signatures acted on, in order, up to and including the step that failed. */
  path: readonly string[];
  screenshot: string;
};

export function formatFailRow(row: CrawlFailRow): string {
  return `${row.surface} @${row.viewport} ${row.theme} seed=${row.seed} run=${row.run} step=${row.step} ${row.invariant} ${row.signature}: ${row.detail} — path: ${row.path.join(' → ') || '(landing)'} [${row.screenshot}]`;
}
