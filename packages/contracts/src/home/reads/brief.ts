// The Jaina Brief (H05): up to three sentences about the brand, each citing numbered figures,
// and every figure naming the stored source it was read from so a tap can open it.
//
//   goal         — the primary objective so far this period, against its target when one is
//                  set, otherwise against the same days of the previous period.
//   opportunity  — the Optimizer's top stored candidate, with the money it is worth per day.
//   change       — what moved: a portfolio's stored growth read against the window before it.
//
// Served by the Backend at HOME_READ_PATHS.brief: GET ?brandId=&locale=es|en. The brief speaks
// the account's language, Spanish by default, while the UI around it stays English.
//
// CITATION MARKER: every figure appears in its sentence's `text` as `${display}[${n}]` — the
// exact display string immediately followed by its number in square brackets, e.g.
// "Compras: 16[1] en lo que va del mes." `n` is global across the brief, 1-based and
// consecutive in reading order. A figure's direction lives in the words around it ("22%[4]
// menos"), never in a minus sign inside `display`; `value` keeps the sign.
//
// `basis` names the composer. 'deterministic_v1' is written by code from stored figures with
// no model; a model-written brief can replace it behind this same contract.

import { z } from 'zod';
import { homeObjectiveSchema } from '../objectives';
import { homeReadEnvelopeSchema, homeReadSourceSchema } from './envelope';

export const HOME_BRIEF_BASIS = 'deterministic_v1';

export const homeBriefLocaleSchema = z.enum(['es', 'en']);
export type HomeBriefLocale = z.infer<typeof homeBriefLocaleSchema>;

/** The `locale` query value as the brief will speak it: Spanish unless English was asked for. */
export function homeBriefLocaleOf(raw: string | undefined): HomeBriefLocale {
  return raw === 'en' ? 'en' : 'es';
}

/** How a figure is printed in its sentence. */
export function homeBriefCitation(display: string, n: number): string {
  return `${display}[${n}]`;
}

export const homeBriefFigureUnitSchema = z.enum(['count', 'currency', 'ratio', 'percent']);
export type HomeBriefFigureUnit = z.infer<typeof homeBriefFigureUnitSchema>;

export const homeBriefFigureSchema = z
  .object({
    /** 1-based, global across the brief, in reading order. */
    n: z.number().int().positive(),
    /** What the figure is, for the tooltip and the source panel. */
    label: z.string().min(1).max(120),
    /** The figure as read, signed, in display units (a percent is 22 for 22%, never 0.22). */
    value: z.number().finite(),
    unit: homeBriefFigureUnitSchema,
    /** ISO 4217 for a money figure; null for anything else. */
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    /** Exactly the string printed in the sentence, before the marker. */
    display: z.string().min(1).max(48),
    /**
     * The field of the source the value was read from (`purchases`, `impact_per_day`,
     * `growth.deltas.results`), so the figure can be re-read from `source` and checked.
     */
    field: z.string().min(1).max(80),
    source: homeReadSourceSchema,
  })
  .superRefine((figure, ctx) => {
    if (figure.unit === 'currency' && !figure.currency) {
      ctx.addIssue({ code: 'custom', message: 'A money figure names its currency.' });
    }
    if (figure.unit !== 'currency' && figure.currency) {
      ctx.addIssue({ code: 'custom', message: 'Only a money figure carries a currency.' });
    }
  });
export type HomeBriefFigure = z.infer<typeof homeBriefFigureSchema>;

export const homeBriefSentenceIdSchema = z.enum(['goal', 'opportunity', 'change']);
export type HomeBriefSentenceId = z.infer<typeof homeBriefSentenceIdSchema>;

export const homeBriefSentenceSchema = z
  .object({
    id: homeBriefSentenceIdSchema,
    text: z.string().min(1).max(400),
    /** At least one: a sentence with no honest figure is left out, never written bare. */
    figures: z.array(homeBriefFigureSchema).min(1),
  })
  .superRefine((sentence, ctx) => {
    for (const figure of sentence.figures) {
      if (!sentence.text.includes(homeBriefCitation(figure.display, figure.n))) {
        ctx.addIssue({
          code: 'custom',
          message: `Figure ${figure.n} is not printed as "${homeBriefCitation(figure.display, figure.n)}".`,
        });
      }
    }
  });
export type HomeBriefSentence = z.infer<typeof homeBriefSentenceSchema>;

export const homeBriefDataSchema = z
  .object({
    basis: z.literal(HOME_BRIEF_BASIS),
    locale: homeBriefLocaleSchema,
    /** The objective the goal sentence speaks about; null when there is no goal sentence. */
    objective: homeObjectiveSchema.pick({ id: true, label: true, metric: true }).nullable(),
    sentences: z.array(homeBriefSentenceSchema).min(1).max(3),
  })
  .superRefine((brief, ctx) => {
    const ids = brief.sentences.map((sentence) => sentence.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'Each sentence kind appears at most once.' });
    }
    const numbers = brief.sentences.flatMap((sentence) =>
      sentence.figures.map((figure) => figure.n),
    );
    if (numbers.some((n, index) => n !== index + 1)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Figures are numbered 1..n across the brief, in order.',
      });
    }
  });
export type HomeBriefData = z.infer<typeof homeBriefDataSchema>;

export const homeBriefReadSchema = homeReadEnvelopeSchema(homeBriefDataSchema);
export type HomeBriefRead = z.infer<typeof homeBriefReadSchema>;
