/**
 * The TEXT shape of a Jaina answer, as a function: one executive sentence that answers the
 * question, and a justification under it that is longer than the answer, says how it was
 * measured, and relates at least two metrics. The figures carry their own gates
 * (`groundingViolationsOf`, `validateTemplateBlock`); nothing checked the words around them,
 * so an answer could ship three paragraphs as its "executive", or a one-line justification
 * that never said which window it read, and every gate stayed green.
 *
 * What the reader sees is what is graded. With an `answer_template` block, the reader sees
 * the block's `executive.sentence` (refs rendered) and its sections — the report's
 * `executive_summary` is hidden behind it — so that sentence is the executive. Without one,
 * the executive is `executive_summary` and the justification is the prose under it.
 *
 * Pure and deterministic, no model: the Backend records the verdict as run events and the
 * golden grader turns it into soft failures, from the same function. Violation messages
 * carry counts and figure ids only — never the client's prose — because the Backend writes
 * them to a durable table.
 */

import { stripProseMarks } from './jaina-report';
import {
  figureRefsIn,
  formatFigure,
  renderFigureRefs,
  type TemplateFigure,
} from './jaina-templates/figure';

export const ANSWER_SHAPE_CODES = [
  'answer_missing',
  'executive_not_one_sentence',
  'justification_missing',
  'justification_not_longer',
  'justification_no_procedure',
  'justification_no_relation',
  'sentence_figure_unjustified',
  'sentence_direction_contradicts',
] as const;
export type AnswerShapeCode = (typeof ANSWER_SHAPE_CODES)[number];

export type AnswerShapeViolation = {
  code: AnswerShapeCode;
  /** The template block the rule read, or null for the report's own summary and prose. */
  block_id: string | null;
  message: string;
};

/** Justification floor: longer than twice the answer, and never under this many words. */
export const JUSTIFICATION_MIN_WORDS = 30;

// ---------------------------------------------------------------------------
// Loose readers — the grader hands in transcript JSON, the Backend a parsed report
// ---------------------------------------------------------------------------

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');

// ---------------------------------------------------------------------------
// Placeholders — what the orchestrator ships when it has no answer
// ---------------------------------------------------------------------------

/** The literal summaries the orchestrator falls back to (`DEFAULT_SYNTHESIS_SUMMARY`, the tool-fallback default). */
export const ANSWER_PLACEHOLDERS = [
  'Synthesis summary unavailable.',
  'Analysis complete.',
] as const;

const foldPlaceholder = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/[.\s]+$/u, '');
const PLACEHOLDERS = new Set(ANSWER_PLACEHOLDERS.map(foldPlaceholder));

export const isPlaceholderAnswer = (text: string): boolean =>
  PLACEHOLDERS.has(foldPlaceholder(text));

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

/** Unicode-aware whole-word alternation: JS `\b` treats "subió" as ending before the "ó". */
const wordsPattern = (alternatives: ReadonlyArray<string>, flags = 'iu'): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, flags);

// Spans whose punctuation never ends a sentence. Each is masked (length kept) before the
// boundary scan, so a sentence is always a slice of the original text.
const PROTECTED_SPANS: ReadonlyArray<RegExp> = [
  // Prose marks: `[risk: 0.90 ROAS vs. 1.2]` — the whole mark is one unit.
  /\[(?:risk|watch|positive|neutral|window):[^[\]\n]*\]/giu,
  // Figure refs: `{cpr_1}`.
  /\{[a-z][a-z0-9_]*\}/gu,
  // Decimals, with either separator: 32.19, 1,7.
  /\d[.,]\d/gu,
  // Ellipses: "…" and "...".
  /…|\.{2,}/gu,
  // Abbreviations a sentence carries mid-flow.
  /(?<![\p{L}])(?:vs|etc|p\.\s?ej|e\.g|i\.e|aprox|approx|prom|máx|mín|max|min|núm|sr|sra|dr|dra)\./giu,
];

const SENTENCE_END = /[.!?]/u;
/** What may sit between a sentence's end mark and the whitespace: closing quotes, brackets, bold. */
const CLOSERS = /["'”’)\]*]/u;
/** What a new sentence may open with: a capital, a Spanish opener, a digit, bold, a mark or a ref. */
const OPENER = /[\p{Lu}¿¡\d*[{"“'(]/u;

const maskedOf = (text: string): string =>
  PROTECTED_SPANS.reduce(
    (masked, pattern) =>
      masked.replace(new RegExp(pattern.source, pattern.flags), (span) => 'x'.repeat(span.length)),
    text,
  );

const hasLetter = (text: string): boolean => /\p{L}/u.test(text);

/**
 * The text's sentences, each an exact trimmed slice of the input. A boundary is `.`, `!`
 * or `?` (plus any closing quote, bracket or bold) followed by whitespace and a sentence
 * opener, or a blank line. A period inside a prose mark, a ref, a decimal, an ellipsis or a
 * known abbreviation ("vs.", "p. ej.", "etc.") is not one. A fragment with no letter (a list
 * number "1.") joins the sentence after it.
 */
export function splitSentences(text: string): string[] {
  const masked = maskedOf(text);
  const cuts: number[] = [];
  for (let i = 0; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === '\n') {
      let j = i + 1;
      while (j < masked.length && /[ \t]/u.test(masked[j])) j += 1;
      if (masked[j] === '\n') cuts.push(i);
      continue;
    }
    if (!SENTENCE_END.test(ch)) continue;
    let end = i + 1;
    while (end < masked.length && CLOSERS.test(masked[end])) end += 1;
    let next = end;
    while (next < masked.length && /\s/u.test(masked[next])) next += 1;
    if (next === masked.length) continue;
    if (next > end && OPENER.test(text[next])) cuts.push(end);
  }
  const pieces: string[] = [];
  let start = 0;
  for (const cut of [...cuts, text.length]) {
    const piece = text.slice(start, cut).trim();
    if (piece.length > 0) pieces.push(piece);
    start = cut;
  }
  const sentences: string[] = [];
  let carry = '';
  for (const piece of pieces) {
    const joined = carry ? `${carry} ${piece}` : piece;
    if (hasLetter(piece)) {
      sentences.push(joined);
      carry = '';
    } else {
      carry = joined;
    }
  }
  if (carry) {
    if (sentences.length > 0) sentences[sentences.length - 1] += ` ${carry}`;
    else if (hasLetter(carry)) sentences.push(carry);
  }
  return sentences;
}

/** Plain words: prose marks unwrapped, bold and heading syntax dropped. */
export const wordCount = (text: string): number =>
  stripProseMarks(text)
    .replace(/[*#_`]/gu, ' ')
    .split(/\s+/u)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;

// ---------------------------------------------------------------------------
// Metrics — the vocabulary a "relation" is stated in
// ---------------------------------------------------------------------------

const METRIC_WORDS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  [
    'cost_per_result',
    ['cost per \\p{L}+', 'costo por \\p{L}+', 'coste por \\p{L}+', 'cpa', 'cpr', 'cpl'],
  ],
  ['conversion_rate', ['conversion rate', 'tasa de conversi[oó]n']],
  ['ctr', ['ctr', 'click-through rate', 'tasa de clics']],
  ['cpc', ['cpc']],
  ['cpm', ['cpm']],
  ['roas', ['roas', 'return on ad spend', 'retorno']],
  ['revenue', ['revenue', 'ingresos?', 'ventas', 'sales', 'valor de compra', 'purchase value']],
  [
    'spend',
    [
      'spend',
      'spent',
      'spending',
      'gastos?',
      'gast[oó]',
      'gastaron',
      'inversi[oó]n',
      'invertido',
      'invested',
    ],
  ],
  ['purchases', ['purchases?', 'compras?', 'compr[oó]']],
  ['leads', ['leads?', 'prospectos?', 'registros?']],
  ['clicks', ['clicks?', 'clics?']],
  ['impressions', ['impressions?', 'impresiones']],
  ['reach', ['reach', 'alcance']],
  ['frequency', ['frequency', 'frecuencia']],
  ['conversions', ['conversions?', 'conversiones', 'conversi[oó]n']],
  ['results', ['results?', 'resultados?']],
  ['budget', ['budgets?', 'presupuestos?']],
  ['messages', ['messages', 'mensajes', 'conversations', 'conversaciones']],
];

const METRIC_PATTERNS = METRIC_WORDS.map(
  ([metric, words]) => [metric, wordsPattern(words, 'giu')] as const,
);

/** The distinct metrics a text names, in order of first mention; a multiword name counts once. */
export function metricsNamedIn(text: string): string[] {
  let rest = stripProseMarks(text);
  const firstAt = new Map<string, number>();
  for (const [metric, pattern] of METRIC_PATTERNS) {
    rest = rest.replace(new RegExp(pattern.source, pattern.flags), (match, offset: number) => {
      if (!firstAt.has(metric) || (firstAt.get(metric) ?? 0) > offset) firstAt.set(metric, offset);
      return ' '.repeat(match.length);
    });
  }
  return [...firstAt.entries()].sort((a, b) => a[1] - b[1]).map(([metric]) => metric);
}

// ---------------------------------------------------------------------------
// Procedure cues — the window it read, and where the numbers came from
// ---------------------------------------------------------------------------

const WINDOW_PATTERN = wordsPattern([
  '(?:last|past|previous) \\d+ days',
  '[uú]ltimos \\d+ d[ií]as',
  '(?:this|last|previous|prior) (?:week|month|year|quarter)',
  'week before',
  'month to date',
  'este (?:mes|año|trimestre)',
  'esta semana',
  'semana (?:pasada|anterior)',
  'mes (?:pasado|anterior)',
  'lo que va del mes',
  'yesterday',
  'ayer',
  'today',
  'hoy',
  'last_\\d+d',
  'this_month',
  'last_month',
  '\\d{4}-\\d{2}-\\d{2}',
  '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.? \\d{1,2}',
  '\\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)',
  'del \\d{1,2} al \\d{1,2}',
]);

const WINDOW_MARK = /\[window:/iu;

const SOURCE_PATTERN = wordsPattern([
  'seg[uú]n',
  'de acuerdo con',
  'meta ads',
  '(?:de|en|from|in|on) meta',
  'ads manager',
  'administrador de anuncios',
  'api',
  'le[ií]mos',
  'leemos',
  'medimos',
  'medid[oa]s?',
  'calculad[oa]s?',
  'calculamos',
  'calculated',
  'computed',
  'we (?:read|measured|pulled|compared)',
  'read from',
  'measured',
  'dividid[oa]s?',
  'divided',
  'sumamos',
  'summed',
  'sum of',
  'suma de',
  'reported by',
  'reportad[oa]s? por',
  'fuente',
  'source',
  'data from',
  'datos de',
]);

// ---------------------------------------------------------------------------
// Direction words — what the sentence claims moved, and which way
// ---------------------------------------------------------------------------

type Direction = 'up' | 'down' | 'better' | 'worse';

const DIRECTION_PATTERNS: Record<Direction, RegExp> = {
  up: wordsPattern([
    'sub(?:i[oó]|e|en|ieron)',
    'aument(?:[oó]|a|an|aron)',
    'crec(?:i[oó]|e|en|ieron)',
    '(?:se )?increment(?:[oó]|a|an|aron)',
    'increased?',
    'increases',
    'rose',
    'rises?',
    'grew',
    'grows?',
    'went up',
    'up by',
  ]),
  down: wordsPattern([
    'baj(?:[oó]|a|an|aron)',
    'ca(?:y[oó]|e|en|yeron)',
    'disminu(?:y[oó]|ye|yen|yeron)',
    'descendi[oó]',
    'se redujo',
    'decreased?',
    'decreases',
    'fell',
    'falls?',
    'dropped',
    'drops?',
    'declined?',
    'went down',
    'down by',
  ]),
  better: wordsPattern(['mejor(?:es)?', 'mejor[oó]', 'better', 'best', 'improved?', 'improves']),
  worse: wordsPattern(['peor(?:es)?', 'empeor[oó]', 'worse', 'worst', 'worsened']),
};

const directionsIn = (text: string): Set<Direction> => {
  const found = new Set<Direction>();
  for (const direction of Object.keys(DIRECTION_PATTERNS) as Direction[]) {
    if (DIRECTION_PATTERNS[direction].test(text)) found.add(direction);
  }
  // Both ways at once ("spend rose while results fell") names two movements, not a claim
  // this rule can hold to one sign.
  if (found.has('up') && found.has('down')) {
    found.delete('up');
    found.delete('down');
  }
  if (found.has('better') && found.has('worse')) {
    found.delete('better');
    found.delete('worse');
  }
  return found;
};

// ---------------------------------------------------------------------------
// The texts a report shows
// ---------------------------------------------------------------------------

export type AnswerTexts = {
  /** True when an `answer_template` block carries the answer. */
  template: boolean;
  templateBlockId: string | null;
  /** The executive as the reader sees it (template refs rendered). */
  executive: string;
  /** The justification texts, in reading order. */
  justification: string[];
};

const figuresOf = (block: Record<string, unknown>): TemplateFigure[] =>
  arrayOf(block.figures).flatMap((raw) => {
    const figure = recordOf(raw);
    if (typeof figure.id !== 'string') return [];
    return [
      {
        ...(figure as unknown as TemplateFigure),
        value: typeof figure.value === 'number' ? figure.value : null,
        currency: typeof figure.currency === 'string' ? figure.currency : null,
        derivation: typeof figure.derivation === 'string' ? figure.derivation : null,
      },
    ];
  });

const templateBlockOf = (blocks: readonly unknown[]): Record<string, unknown> | null => {
  for (const raw of blocks) {
    const block = recordOf(raw);
    if (block.category === 'answer_template') return block;
  }
  return null;
};

const sectionsOf = (block: Record<string, unknown>): Record<string, unknown>[] =>
  arrayOf(recordOf(block.justification).sections).map(recordOf);

const renderRefs = (text: string, figures: ReadonlyArray<TemplateFigure>): string =>
  renderFigureRefs(text, figures, formatFigure, { onUnresolved: 'mark' }).text;

/** A narrative body with the executive it repeats taken out (the prose block opens with it). */
const withoutExecutive = (body: string, executive: string): string => {
  const head = executive.trim().replace(/…$/u, '').trim();
  if (head.length === 0) return body.trim();
  const at = body.indexOf(head);
  if (at < 0) return body.trim();
  return `${body.slice(0, at)}${body.slice(at + head.length)}`.trim();
};

/**
 * An item as the reader sees it: its title (a campaign's name, over a step) drawn above its
 * text. A text that already names its title is not given it twice.
 */
const underItemTitle = (title: string, text: string): string => {
  const name = title.trim();
  if (!name || text.toLowerCase().includes(name.toLowerCase())) return text;
  return `${name}: ${text}`;
};

/** The executive and the justification the reader sees — the grader's judge reads these too. */
export function answerTextsOf(report: unknown): AnswerTexts {
  const rec = recordOf(report);
  const blocks = arrayOf(rec.blocks);
  const template = templateBlockOf(blocks);
  if (template) {
    const figures = figuresOf(template);
    const justification: string[] = [];
    for (const section of sectionsOf(template)) {
      const text = stringOf(section.text);
      if (text.trim()) justification.push(renderRefs(text, figures));
      for (const item of arrayOf(section.items).map(recordOf)) {
        const itemText = renderRefs(stringOf(item.text), figures).trim();
        if (itemText) justification.push(underItemTitle(stringOf(item.title), itemText));
      }
    }
    return {
      template: true,
      templateBlockId: typeof template.block_id === 'string' ? template.block_id : null,
      executive: renderRefs(stringOf(recordOf(template.executive).sentence), figures).trim(),
      justification,
    };
  }
  const executive = stringOf(rec.executive_summary).trim();
  const justification: string[] = [];
  for (const block of blocks.map(recordOf)) {
    switch (block.category) {
      case 'narrative': {
        const body = withoutExecutive(stringOf(block.body), executive);
        if (body) justification.push(body);
        break;
      }
      case 'insight_list':
        for (const item of arrayOf(block.items).map(recordOf)) {
          for (const text of [stringOf(item.rationale), stringOf(item.impact)]) {
            if (text.trim()) justification.push(text.trim());
          }
        }
        break;
      case 'data_scope':
        for (const note of arrayOf(block.notes))
          if (stringOf(note).trim()) justification.push(stringOf(note).trim());
        break;
      case 'survey':
        if (stringOf(block.used).trim()) justification.push(stringOf(block.used).trim());
        break;
      default:
        break;
    }
  }
  return { template: false, templateBlockId: null, executive, justification };
}

// ---------------------------------------------------------------------------
// Template figure citations
// ---------------------------------------------------------------------------

/** Every figure id a section shows: refs in its text, chart and table, and its items. */
const sectionFigureIds = (section: Record<string, unknown>): Set<string> => {
  const ids = new Set<string>(figureRefsIn(stringOf(section.text)));
  const chart = recordOf(section.chart);
  for (const point of arrayOf(chart.points).map(recordOf)) ids.add(stringOf(point.figure_id));
  const reference = recordOf(chart.reference);
  if (reference.figure_id) ids.add(stringOf(reference.figure_id));
  for (const ref of figureRefsIn(stringOf(chart.caption))) ids.add(ref);
  for (const row of arrayOf(recordOf(section.table).rows).map(recordOf)) {
    for (const cell of Object.values(recordOf(row.cells))) ids.add(stringOf(cell));
  }
  for (const item of arrayOf(section.items).map(recordOf)) {
    if (item.badge_figure_id) ids.add(stringOf(item.badge_figure_id));
    for (const id of arrayOf(item.detail_figure_ids)) ids.add(stringOf(id));
    for (const ref of figureRefsIn(stringOf(item.text))) ids.add(ref);
  }
  ids.delete('');
  return ids;
};

/** The one figure a derivation restates: `spend_share_1` (an alias) or `|results_change|` (its size). */
const RESTATED_ID = /^\|?\s*([a-z][a-z0-9_]*)\s*\|?$/u;

const restatedIdOf = (derivation: string | null): string | null => {
  const text = (derivation ?? '').trim();
  const match = RESTATED_ID.exec(text);
  if (!match) return null;
  const bars = (text.startsWith('|') ? 1 : 0) + (text.endsWith('|') ? 1 : 0);
  return bars === 0 || bars === 2 ? match[1] : null;
};

/**
 * The figure ids the reader can see below the sentence: every id a section cites, plus every
 * figure that only restates one of them — an alias (`over_spend_share` = `spend_share_1`) or
 * a size (`step_abs_1` = `|step_1|`) — when its value is that figure's value, so the same
 * number stands in the justification. A derivation that computes (`|a − b|`) shows nothing:
 * the reader would have to do the arithmetic.
 */
const justifiedFigureIds = (
  cited: ReadonlySet<string>,
  figures: ReadonlyArray<TemplateFigure>,
): Set<string> => {
  const byId = new Map(figures.map((figure) => [figure.id, figure]));
  const shown = new Set(cited);
  let grew = true;
  while (grew) {
    grew = false;
    for (const figure of figures) {
      if (shown.has(figure.id)) continue;
      const target = byId.get(restatedIdOf(figure.derivation) ?? '');
      if (!target || !shown.has(target.id)) continue;
      if (figure.value === null || target.value === null) continue;
      if (Math.abs(figure.value) !== Math.abs(target.value)) continue;
      shown.add(figure.id);
      grew = true;
    }
  }
  return shown;
};

// ---------------------------------------------------------------------------
// Direction against figures
// ---------------------------------------------------------------------------

const DELTA_ID = /(?:^|_)(?:change|delta|gap|diff)(?:_|$)/u;
const RANKED_ID = /^(.+)_(\d+)$/u;
const COST_ID = /(?:^|_)(?:cpr|cpa|cpc|cpm|cpl|cost)(?:_|$)/u;
const COST_LABEL = /cost|costo|coste/iu;

/** A delta whose sign is kept (an `|x|` derivation or an `_abs` id has thrown it away). */
const isSignedDelta = (figure: TemplateFigure): boolean =>
  DELTA_ID.test(figure.id) &&
  !/(?:^|_)abs(?:_|$)/u.test(figure.id) &&
  !(figure.derivation ?? '').trim().startsWith('|');

const lowerIsBetter = (
  figure: TemplateFigure,
  heroLowerIsBetterIds: ReadonlySet<string>,
): boolean =>
  heroLowerIsBetterIds.has(figure.id) || COST_ID.test(figure.id) || COST_LABEL.test(figure.label);

type Verdict = 'agree' | 'contradict' | 'neutral';

const deltaVerdict = (
  direction: Direction,
  figure: TemplateFigure,
  lowerBetter: boolean,
): Verdict => {
  const value = figure.value;
  if (value === null || !Number.isFinite(value) || value === 0) return 'neutral';
  const rising = value > 0;
  if (direction === 'up') return rising ? 'agree' : 'contradict';
  if (direction === 'down') return rising ? 'contradict' : 'agree';
  const improving = lowerBetter ? !rising : rising;
  if (direction === 'better') return improving ? 'agree' : 'contradict';
  return improving ? 'contradict' : 'agree';
};

/** "Best"/"worst" against a ranked family (`cpr_1`, `cpr_2`, …): contradicted only at the opposite extreme. */
const rankVerdict = (
  direction: Direction,
  figure: TemplateFigure,
  family: ReadonlyArray<TemplateFigure>,
  lowerBetter: boolean,
): Verdict => {
  if (direction !== 'better' && direction !== 'worse') return 'neutral';
  const values = family.flatMap((member) =>
    member.value !== null && Number.isFinite(member.value) ? [member.value] : [],
  );
  if (figure.value === null || values.length < 2) return 'neutral';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) return 'neutral';
  const best = lowerBetter ? lo : hi;
  const worst = lowerBetter ? hi : lo;
  if (direction === 'better') {
    if (figure.value === best) return 'agree';
    return figure.value === worst ? 'contradict' : 'neutral';
  }
  if (figure.value === worst) return 'agree';
  return figure.value === best ? 'contradict' : 'neutral';
};

const templateDirectionContradicts = (
  sentence: string,
  rendered: string,
  template: Record<string, unknown>,
  figures: ReadonlyArray<TemplateFigure>,
): boolean => {
  const directions = directionsIn(stripProseMarks(rendered));
  if (directions.size === 0) return false;
  const byId = new Map(figures.map((figure) => [figure.id, figure]));
  const hero = recordOf(recordOf(template.executive).hero_chart);
  const heroLowerIsBetterIds = new Set<string>(
    hero.lower_is_better === true
      ? arrayOf(hero.points).map((point) => stringOf(recordOf(point).figure_id))
      : [],
  );
  const cited = figureRefsIn(sentence).flatMap((id) => {
    const figure = byId.get(id);
    return figure ? [figure] : [];
  });
  for (const direction of directions) {
    const verdicts: Verdict[] = cited.map((figure) => {
      const lowerBetter = lowerIsBetter(figure, heroLowerIsBetterIds);
      if (isSignedDelta(figure)) return deltaVerdict(direction, figure, lowerBetter);
      const ranked = RANKED_ID.exec(figure.id);
      if (!ranked || DELTA_ID.test(figure.id)) return 'neutral';
      const family = figures.filter((member) => RANKED_ID.exec(member.id)?.[1] === ranked[1]);
      if (family.length < 2) return 'neutral';
      const familyLowerBetter = family.some((member) =>
        lowerIsBetter(member, heroLowerIsBetterIds),
      );
      return rankVerdict(direction, figure, family, familyLowerBetter);
    });
    if (verdicts.includes('contradict') && !verdicts.includes('agree')) return true;
  }
  return false;
};

const SIGNED_PERCENT = /(?<![\p{L}\p{N}])([+\-−])\s?\d+(?:[.,]\d+)?\s?%/gu;

/** A prose executive: a direction word against the explicit sign of the percent it states. */
const proseDirectionContradicts = (executive: string): boolean => {
  const text = stripProseMarks(executive);
  const directions = directionsIn(text);
  const up = directions.has('up');
  const down = directions.has('down');
  if (!up && !down) return false;
  const signs = [...text.matchAll(SIGNED_PERCENT)].map((match) => (match[1] === '+' ? 1 : -1));
  if (signs.length === 0) return false;
  if (up) return signs.every((sign) => sign < 0);
  return signs.every((sign) => sign > 0);
};

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/**
 * Every way the answer's text misses its shape. Empty is a well-shaped answer. Messages
 * carry counts and figure ids, never the answer's words.
 */
export function answerShapeOf(report: unknown): AnswerShapeViolation[] {
  const rec = recordOf(report);
  const blocks = arrayOf(rec.blocks);
  const texts = answerTextsOf(report);
  const template = texts.template ? templateBlockOf(blocks) : null;
  const blockId = texts.templateBlockId;
  const out: AnswerShapeViolation[] = [];
  const add = (code: AnswerShapeCode, message: string): void => {
    out.push({ code, block_id: blockId, message });
  };

  const answered = texts.executive.length > 0 && !isPlaceholderAnswer(texts.executive);
  if (!answered) {
    add(
      'answer_missing',
      texts.executive.length === 0
        ? 'The answer is empty.'
        : 'The answer is a placeholder, not an answer.',
    );
  }
  const executiveSentences = answered ? splitSentences(texts.executive) : [];
  if (answered && executiveSentences.length > 1) {
    add(
      'executive_not_one_sentence',
      `The executive answer runs to ${executiveSentences.length} sentences; it is one.`,
    );
  }

  const justificationText = texts.justification.join('\n\n');
  const justificationSentences = texts.justification.flatMap(splitSentences);
  const justificationWords = texts.justification.reduce((sum, text) => sum + wordCount(text), 0);

  if (justificationWords === 0) {
    add('justification_missing', 'No justification follows the answer.');
  } else {
    const executiveWords = answered ? wordCount(texts.executive) : 0;
    const floor = Math.max(2 * executiveWords, JUSTIFICATION_MIN_WORDS);
    if (justificationWords <= floor || justificationSentences.length < 2) {
      add(
        'justification_not_longer',
        `The justification has ${justificationWords} words in ${justificationSentences.length} sentences; it needs more than ${floor} words in at least 2.`,
      );
    }

    if (template) {
      const figures = figuresOf(template);
      const sections = sectionsOf(template);
      const measured = sections.find((section) => section.kind === 'measured');
      if (!measured || sectionFigureIds(measured).size === 0) {
        add(
          'justification_no_procedure',
          'The "measured" section cites no figure, so the reader cannot see what was read.',
        );
      }
      const cited = new Set(sections.flatMap((section) => [...sectionFigureIds(section)]));
      const derived = figures.some((figure) => cited.has(figure.id) && figure.derivation !== null);
      const related = justificationSentences.some(
        (sentence) => metricsNamedIn(sentence).length >= 2,
      );
      if (!derived && !related) {
        add(
          'justification_no_relation',
          'No section cites a derived figure and no sentence relates two metrics.',
        );
      }
    } else {
      const windowStated =
        blocks.some((block) => recordOf(block).category === 'data_scope') ||
        WINDOW_MARK.test(`${texts.executive}\n${justificationText}`) ||
        WINDOW_PATTERN.test(`${texts.executive}\n${justificationText}`);
      const sourced = SOURCE_PATTERN.test(justificationText);
      if (!windowStated && !sourced) {
        add(
          'justification_no_procedure',
          'The justification states no window and no source or derivation.',
        );
      }
      if (!justificationSentences.some((sentence) => metricsNamedIn(sentence).length >= 2)) {
        add('justification_no_relation', 'No justification sentence relates two metrics.');
      }
    }
  }

  if (template && answered) {
    const sentence = stringOf(recordOf(template.executive).sentence);
    const figures = figuresOf(template);
    const shown = justifiedFigureIds(
      new Set(sectionsOf(template).flatMap((section) => [...sectionFigureIds(section)])),
      figures,
    );
    const unjustified = [...new Set(figureRefsIn(sentence))].filter((ref) => !shown.has(ref));
    if (unjustified.length > 0) {
      add(
        'sentence_figure_unjustified',
        `The sentence cites ${unjustified.map((ref) => `{${ref}}`).join(', ')}, which no section, table, chart or item shows.`,
      );
    }
    if (templateDirectionContradicts(sentence, texts.executive, template, figures)) {
      add(
        'sentence_direction_contradicts',
        'A direction word in the sentence disagrees with the sign or rank of the figure it cites.',
      );
    }
  } else if (answered && proseDirectionContradicts(texts.executive)) {
    add(
      'sentence_direction_contradicts',
      'A direction word in the answer disagrees with the sign of the change it states.',
    );
  }
  return out;
}
