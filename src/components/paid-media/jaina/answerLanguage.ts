// Which language a finished answer is in, so the labels around it can follow.
//
// One language per answer. The 2026-09-27 EasyFit summary was Spanish from the first word,
// and the Frontend headed its evidence "Justification · The data behind the answer" — the
// chrome was English because the chrome never asked. The Backend's `answerShape.ts` makes
// the same decision for the justification block's title (`justificationTitle`); this is the
// Frontend half, and it decides the same way: the report's own `language` when it states
// one, else the executive sentence itself.
//
// `language` cannot simply be trusted: `checkpointReportV2Schema` defaults it to `'en'`, so
// a report that never said which language it is in arrives saying English. A non-default
// value is a statement; the default is silence, and silence is read from the sentence.

import type { MetricRead } from '@continuum/contracts';

export type AnswerLanguage = 'es' | 'en';

/** The words the report's chrome is set in, per language, in the order they appear. */
export const SECTION_LABELS: Record<
  AnswerLanguage,
  {
    why: string;
    action: string;
    evidence: string;
    evidenceDetail: string;
    /** The three boxes of a J2 narrative, in reading order. */
    what: string;
    soWhat: string;
    nowWhat: string;
    /** Set before a tile's prior-period figure: "vs 24,214 · Sep 14–20". */
    versus: string;
  }
> = {
  es: {
    why: 'Por qué',
    action: 'Acción',
    evidence: 'Evidencia',
    evidenceDetail: 'Los datos detrás de la respuesta',
    what: 'Qué pasó',
    soWhat: 'Qué significa',
    nowWhat: 'Qué hacer',
    versus: 'vs',
  },
  en: {
    why: 'Why',
    action: 'Action',
    evidence: 'Evidence',
    evidenceDetail: 'The data behind the answer',
    what: 'What',
    soWhat: 'So what',
    nowWhat: 'Now what',
    versus: 'vs',
  },
};

/**
 * The one-word read of a metric against its target or its prior, in the answer's language.
 * The contract carries the read as a language-neutral key (`mejor` / `peor` / `igual` /
 * `sin_comparacion`, derived on the Backend); the word the reader sees follows the answer.
 */
export const METRIC_READ_LABEL: Record<AnswerLanguage, Record<MetricRead, string>> = {
  es: {
    mejor: 'mejor',
    peor: 'peor',
    igual: 'igual',
    sin_comparacion: 'sin comparación',
  },
  en: {
    mejor: 'better',
    peor: 'worse',
    igual: 'same',
    sin_comparacion: 'no comparison',
  },
};

const SPANISH_TAG = /^(?:es|spa|spanish|español)/iu;
const ENGLISH_TAG = /^(?:en|eng|english)/iu;

// Function words a Spanish sentence about an ad account cannot avoid, against their English
// counterparts. Accented vowels, ñ and the inverted marks settle it on their own — no
// English sentence carries them — so the word list is ASCII only, where `\b` is reliable.
const SPANISH_MARKS = /[¿¡áéíóúñ]/u;
const SPANISH_WORDS =
  /\b(?:el|la|los|las|del|una|por|para|con|que|cual|esta|este|semana|mes|gasto|cuenta|conversaciones|anuncios?|resultados)\b/giu;
const ENGLISH_WORDS =
  /\b(?:the|of|and|in|for|with|is|are|was|were|this|that|week|month|spend|campaigns?|account|conversations|ads?|results)\b/giu;

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

/** A small deterministic check on one sentence: Spanish marks, or more Spanish than English words. */
export function readsAsSpanish(text: string): boolean {
  const sentence = text.trim();
  if (sentence.length === 0) return false;
  if (SPANISH_MARKS.test(sentence)) return true;
  const spanish = count(sentence, SPANISH_WORDS);
  const english = count(sentence, ENGLISH_WORDS);
  return spanish >= 2 && spanish > english;
}

/**
 * The report's language when it states one other than the schema default, else the
 * language the executive sentence reads as. English is the floor: a report that states
 * nothing and says nothing is English, because the chrome has to say something.
 */
export function answerLanguage(report: {
  language?: string | null;
  executive_summary?: string | null;
}): AnswerLanguage {
  const declared = (report.language ?? '').trim();
  if (SPANISH_TAG.test(declared)) return 'es';
  if (declared && !ENGLISH_TAG.test(declared)) return 'en';
  return readsAsSpanish(report.executive_summary ?? '') ? 'es' : 'en';
}
