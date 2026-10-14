/**
 * The SHAPE an ask wants its answer in: the format it names (a list, steps, a table, a
 * comparison, a chart, an explanation — or nothing, the direct answer) and the depth it asks
 * for (breve, estándar, profundo), plus whether it asks to go technical.
 *
 * Ramiro, 2026-10-13 (docs/perfplus-campaign/criteria-ramiro.md, "Jaina: formato y
 * profundidad de la respuesta"): Jaina answered every ask in one executive shape — a sentence,
 * a grid, the three-box justification — so a list ask got no list, a table or a comparison
 * was never made, "how do I seize this" got no steps, and "explain it in detail" did not go
 * long. The answer must come in the format and at the depth the question asks for.
 *
 * Deterministic and model-free, like `inferAskWindows` and `askLanguageOf`: a folded EN+ES
 * phrase table. The Backend plans and gates on it, the golden grader and the judge prompt
 * read the same verdict, so "the format honoured" means one thing everywhere.
 */

export const ANSWER_FORMATS = [
  'list',
  'steps',
  'table',
  'comparison',
  'chart',
  'explanation',
  'direct',
] as const;
export type AnswerFormat = (typeof ANSWER_FORMATS)[number];

export const ANSWER_DEPTHS = ['breve', 'estandar', 'profundo'] as const;
export type AnswerDepth = (typeof ANSWER_DEPTHS)[number];

export type AskShape = {
  format: AnswerFormat;
  depth: AnswerDepth;
  /** The ask wants the mechanics: the formula, the attribution, the setting, the method. */
  technical: boolean;
};

/** Lower case, accents off, whitespace collapsed: "Explícame" and "explicame" are one phrase. */
export const foldAsk = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();

/** Whole-phrase alternation over folded text (`\b` is ASCII-only, and the text is folded). */
const phrases = (alternatives: ReadonlyArray<string>): RegExp =>
  new RegExp(`(?<![a-z0-9_])(?:${alternatives.join('|')})(?![a-z0-9_])`, 'u');

const COUNT_WORD =
  '(?:\\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';

/**
 * The phrase table, in the order a conflict is settled: the container the ask names (steps, a
 * table, a chart) wins over the operation it names ("compáralas en una tabla" is a table), a
 * comparison over a list, and an explanation is what a why or "explain" ask wants when it named
 * no container.
 */
export const ASK_FORMAT_PHRASES: ReadonlyArray<readonly [AnswerFormat, RegExp]> = [
  [
    'steps',
    phrases([
      'paso a paso',
      'pasos?',
      'step[- ]by[- ]step',
      'steps?',
      'how (?:do|can|should|would) (?:i|we)',
      'how to',
      'walk me through',
      'guide me',
      'guia(?:me)?',
      'instrucciones',
      'checklist',
      'plan de accion',
      'action plan',
      'que (?:tengo|tenemos|hay) que hacer para',
      'what (?:do|should) (?:i|we) do to',
      'como (?:puedo|podemos|podria|podriamos|hago|hacemos|hacer|aprovecho|aprovechamos|aprovechar|configuro|configuramos|configurar|implemento|implementamos|implementar|escalo|escalamos|escalar|activo|activamos|activar|armo|armamos|armar|monto|montamos|montar|creo|creamos|crear|lanzo|lanzamos|lanzar|mejoro|mejoramos|mejorar|bajo|bajamos|bajar|subo|subimos|subir|reduzco|reducimos|reducir|optimizo|optimizamos|optimizar|corrijo|corregimos|corregir|arreglo|arreglamos|arreglar)',
    ]),
  ],
  [
    'table',
    phrases([
      'tablas?',
      'tables?',
      'tabular',
      'tabulated',
      'en columnas',
      'in columns',
      'spreadsheet',
      'hoja de calculo',
      'planilla',
      'cuadro comparativo',
      'en un cuadro',
    ]),
  ],
  [
    'chart',
    phrases([
      'graficas?',
      'graficos?',
      'graficame',
      'grafica(?:r|lo|la|los|las)',
      'charts?',
      'graphs?',
      'plot(?:ted)?',
      'visuali[sz]\\w*',
      'visual(?:mente)?',
      'curva',
    ]),
  ],
  [
    'comparison',
    phrases([
      'compar\\w*',
      'versus',
      'vs\\.?',
      'frente a',
      'side[- ]by[- ]side',
      'lado a lado',
      'diferencia entre',
      'difference between',
      'contra (?:eso|lo anterior|el (?:mes|ano|periodo|trimestre) (?:pasado|anterior)|la semana (?:pasada|anterior))',
      'against (?:last|the previous|the prior) (?:week|month|year|period|quarter)',
    ]),
  ],
  [
    'list',
    phrases([
      'lista(?:me|do|r)?',
      'list(?:ing)?',
      'enumera(?:me|r)?',
      'enumerate',
      'bullets?',
      'bullet points',
      'vinetas',
      'punto por punto',
      `(?:dame|dime|danos|give me|tell me|name|nombra|menciona|sugiereme|sugiere|suggest|propon|proponme|propose)(?: (?!top |bottom )[^ ]+){0,2}? ${COUNT_WORD} [a-z]+`,
    ]),
  ],
  [
    'explanation',
    phrases([
      'por que',
      'porque',
      'why',
      'explica(?:me|nos|r)?',
      'explain\\w*',
      'a que se debe',
      "what(?:'s| is| was) (?:driving|behind|causing)",
      'que (?:esta causando|explica|hay detras)',
      'cuentame',
      'describe(?:me)?',
      'detalla(?:me)?',
    ]),
  ],
];

const PROFUNDO = phrases([
  'en detalle',
  'con detalle',
  'detallad[oa]s?',
  'detalla(?:me)?',
  'a detalle',
  'al detalle',
  'explica(?:me|nos)?',
  'paso a paso',
  'step[- ]by[- ]step',
  'tecnic\\w*',
  'technical\\w*',
  'a fondo',
  'en profundidad',
  'profund\\w*',
  'in detail',
  'detailed',
  'deep[- ]?dive',
  'in[- ]depth',
  'thorough(?:ly)?',
  'exhaustiv\\w*',
  'walk me through',
  'long form',
  'largo',
  'extens[oa]',
]);

const BREVE = phrases([
  'rapido',
  'rapidito',
  'quick(?:ly)?',
  'en una (?:linea|frase|oracion|cifra|palabra)',
  'in (?:one|a single) (?:line|sentence|word|number)',
  'one line',
  'one sentence',
  'single line',
  'breve(?:mente)?',
  'briefly',
  'be brief',
  'in brief',
  'brief (?:answer|reply|summary|version)',
  'keep it (?:short|brief)',
  'short answer',
  'corto',
  'resumid[oa]',
  'en pocas palabras',
  'tl;?dr',
  'solo (?:el|la) (?:numero|cifra|total|dato)',
  'solo dame',
  'just (?:the|give me)',
  'only the (?:answer|number|figure)',
  'give only',
  'no caveats',
  'sin rodeos',
]);

const TECHNICAL = phrases([
  'tecnic\\w*',
  'technical\\w*',
  'metodolog\\w*',
  'methodolog\\w*',
  'formula',
  'como se calcula',
  'how (?:is|was|are|were) (?:it|this|that|they|[a-z]+) calculated',
  'under the hood',
  'por dentro',
  'a nivel de configuracion',
  'configuracion exacta',
  'exact settings?',
]);

/** The format the ask names, else `direct`. */
export const askFormatOf = (query: string): AnswerFormat => {
  const folded = foldAsk(query);
  for (const [format, pattern] of ASK_FORMAT_PHRASES) {
    if (pattern.test(folded)) return format;
  }
  return 'direct';
};

/**
 * The shape of the answer the ask wants. Depth is the ask's own word for it: a brevity marker
 * ("rápido", "en una línea", "one line, no caveats") wins, then a depth marker ("en detalle",
 * "explícame", "paso a paso", "técnico", "a fondo", "in detail", "deep dive"); a technical ask
 * is profundo. An ask that says neither is estándar.
 */
export const askShapeOf = (query: string): AskShape => {
  const folded = foldAsk(query);
  const technical = TECHNICAL.test(folded);
  const depth: AnswerDepth = BREVE.test(folded)
    ? 'breve'
    : technical || PROFUNDO.test(folded)
      ? 'profundo'
      : 'estandar';
  return { format: askFormatOf(query), depth, technical };
};

/**
 * The block category that carries a format. An explanation is prose (the narrative) and a
 * direct answer is the sentence: neither needs a block of its own.
 */
export const FORMAT_BLOCK_CATEGORY: Readonly<Record<AnswerFormat, string | null>> = {
  list: 'insight_list',
  steps: 'steps',
  table: 'data_table',
  comparison: 'comparison',
  chart: 'chart',
  explanation: null,
  direct: null,
};

const recordOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const contentOf = (block: Record<string, unknown>): number => {
  switch (block.category) {
    case 'insight_list':
    case 'steps':
      return Array.isArray(block.items) ? block.items.length : 0;
    case 'data_table':
      return Array.isArray(block.rows) ? block.rows.length : 0;
    case 'comparison':
      return Array.isArray(block.pairs) ? block.pairs.length : 0;
    case 'chart':
      return Array.isArray(block.data) ? block.data.length : 0;
    default:
      return 0;
  }
};

/** The `what_to_watch` closing list is an insight_list, but it is never the requested list. */
const WATCH_BLOCK_ID = 'what_to_watch';

/**
 * The block in `blocks` that delivers the requested format, or null. A list is two items at
 * least (one item is a sentence), a comparison is a pair, the others need any content. The
 * closing "what to watch" list never counts as the list the ask wanted.
 */
export const formatBlockOf = (
  blocks: ReadonlyArray<unknown>,
  format: AnswerFormat,
): Record<string, unknown> | null => {
  const category = FORMAT_BLOCK_CATEGORY[format];
  if (category === null) return null;
  const floor = format === 'list' ? 2 : 1;
  for (const raw of blocks) {
    const block = recordOf(raw);
    if (block.category !== category) continue;
    if (block.block_id === WATCH_BLOCK_ID) continue;
    if (contentOf(block) >= floor) return block;
  }
  return null;
};

/**
 * Whether a report carries the format its ask requested. An explanation is delivered by prose
 * of its own (a narrative block or a justification of two paragraphs); a direct answer always is.
 */
export const formatDelivered = (report: unknown, format: AnswerFormat): boolean => {
  if (format === 'direct') return true;
  const blocks = Array.isArray(recordOf(report).blocks)
    ? (recordOf(report).blocks as unknown[])
    : [];
  if (format === 'explanation') {
    return blocks.some((raw) => {
      const block = recordOf(raw);
      return (
        block.category === 'narrative' &&
        typeof block.body === 'string' &&
        block.body.trim().length > 0
      );
    });
  }
  return formatBlockOf(blocks, format) !== null;
};
