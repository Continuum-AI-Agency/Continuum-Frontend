/**
 * Jaina answer-template figures — the one place a number in a templated answer comes from.
 *
 * The rule of the template system: THE MODEL CHOOSES WORDS, CODE PLACES NUMBERS. A figure is
 * composed on the Backend from a registered dataset (a real tool read of this turn), carries
 * the read it came from (`source`), the window it covers and, when it is computed, how
 * (`derivation`). Prose never holds a digit of its own: it holds `{figure_id}` refs, and a
 * ref becomes text only through `renderFigureRefs` + `formatFigure`, on either side of the
 * wire. A previous attempt let the model author figures and chart shapes, and numbers came
 * from memory instead of from the reads — refs are what make that impossible to repeat.
 *
 * Money is printed by the contracts' ONE money rule (`formatMoney`): an unknown currency is
 * a bare figure, never dollars.
 */

import { z } from 'zod';
import { formatMoney } from '../../optimization/money';

/** Lowercase snake id, so a ref reads `{cpr_best}` and never collides with prose braces. */
export const FIGURE_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
export const figureIdSchema = z.string().regex(FIGURE_ID_PATTERN);

/**
 * `money` in `currency`; `count` a whole number of things; `percent` a FRACTION (0.19 =
 * 19%) — declared once here so no renderer guesses a basis from the magnitude; `ratio` a
 * plain decimal (a pace of 1.12); `multiple` a "×" factor (ROAS); `days` a duration.
 */
export const FIGURE_UNITS = ['money', 'count', 'ratio', 'percent', 'multiple', 'days'] as const;
export const figureUnitSchema = z.enum(FIGURE_UNITS);
export type FigureUnit = z.infer<typeof figureUnitSchema>;

export const figureWindowSchema = z.object({
  since: z.string(),
  until: z.string(),
  /** The window in the reader's words: "este mes", "últimos 30 días". */
  label: z.string(),
});
export type FigureWindow = z.infer<typeof figureWindowSchema>;

// Emptiness is `validateTemplateBlock`'s rule (`figure_without_source`), not the schema's, so
// a block missing a source is named by that rule rather than lost in a parse error.
export const figureSourceSchema = z.object({
  /** The tool whose result the dataset was built from, e.g. `get_key_metrics`. */
  tool: z.string(),
  /** The registry dataset the value was read (or derived) from. */
  datasetId: z.string(),
  /** The Meta level the figure is about: account, campaign, adset, ad. */
  level: z.string(),
  entityId: z.string().nullable().default(null),
});
export type FigureSource = z.infer<typeof figureSourceSchema>;

export const templateFigureSchema = z.object({
  id: figureIdSchema,
  /** What the figure is, for a tooltip and for the narration brief: "Costo por compra · CAÑADAS". */
  label: z.string().min(1),
  value: z.number().nullable(),
  unit: figureUnitSchema,
  /** ISO code for money; null for every other unit and for money in an unknown currency. */
  currency: z.string().nullable(),
  window: figureWindowSchema,
  source: figureSourceSchema,
  /** How a computed figure was computed, in the dataset's terms: "spend / purchases". Null when read verbatim. */
  derivation: z.string().nullable().default(null),
});
export type TemplateFigure = z.infer<typeof templateFigureSchema>;

const COUNT_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const PERCENT_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const DECIMAL_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The printed form of a figure. A null or non-finite value prints "—", as money does. */
export function formatFigure(figure: Pick<TemplateFigure, 'value' | 'unit' | 'currency'>): string {
  const { value } = figure;
  if (value == null || !Number.isFinite(value)) return '—';
  switch (figure.unit) {
    case 'money':
      return formatMoney(value, figure.currency);
    case 'count':
      return COUNT_FORMAT.format(value);
    case 'percent':
      return `${PERCENT_FORMAT.format(value * 100)}%`;
    case 'ratio':
      return DECIMAL_FORMAT.format(value);
    case 'multiple':
      return `${DECIMAL_FORMAT.format(value)}×`;
    case 'days':
      return `${COUNT_FORMAT.format(value)} d`;
  }
}

// ---------------------------------------------------------------------------
// Refs — `{figure_id}` inside prose
// ---------------------------------------------------------------------------

const figureRefPattern = (): RegExp => /\{([a-z][a-z0-9_]*)\}/g;

/** Every ref a text carries, in order, duplicates kept. */
export function figureRefsIn(text: string): string[] {
  return [...text.matchAll(figureRefPattern())].map((match) => match[1]);
}

/** A text with every ref taken out — what is left is the model's own words. */
export function stripFigureRefs(text: string, replacement = ''): string {
  return text.replace(figureRefPattern(), replacement);
}

export type FigureRefSegment =
  | { kind: 'text'; text: string }
  | { kind: 'figure'; figure: TemplateFigure; text: string }
  | { kind: 'unresolved'; ref: string };

/**
 * A text split into prose and figures, for a renderer that must put each figure in its own
 * element (the Frontend's `data-figure-id` span). `text` on a figure segment is its printed
 * form under `formatter`.
 */
export function figureRefSegments(
  text: string,
  figures: ReadonlyArray<TemplateFigure>,
  formatter: (figure: TemplateFigure) => string = formatFigure,
): FigureRefSegment[] {
  const byId = new Map(figures.map((figure) => [figure.id, figure]));
  const segments: FigureRefSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(figureRefPattern())) {
    const at = match.index ?? 0;
    if (at > cursor) segments.push({ kind: 'text', text: text.slice(cursor, at) });
    const figure = byId.get(match[1]);
    segments.push(
      figure
        ? { kind: 'figure', figure, text: formatter(figure) }
        : { kind: 'unresolved', ref: match[1] },
    );
    cursor = at + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}

export class UnresolvedFigureRefError extends Error {
  constructor(readonly refs: string[]) {
    super(`Unresolved figure ref(s): ${refs.map((ref) => `{${ref}}`).join(', ')}`);
    this.name = 'UnresolvedFigureRefError';
  }
}

export type RenderFigureRefsOptions = {
  /**
   * `throw` (the default, and what tests use): an unknown ref is a bug in whoever wrote the
   * text, so it fails loudly. `mark`: a runtime renderer prints "—" in its place and reports
   * it in `unresolved`, so the caller can record the violation instead of crashing a report.
   */
  onUnresolved?: 'throw' | 'mark';
};

/** Prose with every ref replaced by its printed figure. */
export function renderFigureRefs(
  text: string,
  figures: ReadonlyArray<TemplateFigure>,
  formatter: (figure: TemplateFigure) => string = formatFigure,
  options: RenderFigureRefsOptions = {},
): { text: string; unresolved: string[] } {
  const segments = figureRefSegments(text, figures, formatter);
  const unresolved = segments.flatMap((segment) =>
    segment.kind === 'unresolved' ? [segment.ref] : [],
  );
  if (unresolved.length > 0 && (options.onUnresolved ?? 'throw') === 'throw') {
    throw new UnresolvedFigureRefError(unresolved);
  }
  const rendered = segments
    .map((segment) => (segment.kind === 'unresolved' ? '—' : segment.text))
    .join('');
  return { text: rendered, unresolved };
}
