/**
 * `validateTemplateBlock` — the gate a templated answer passes before it ships.
 *
 * The Backend emits an `answer_template` block ONLY when this returns no violations; any
 * violation and the report is exactly the report it would have been without templates. The
 * rules are the ones that make "code places numbers" true on the wire: every ref resolves,
 * every figure names its source and window, money is in one currency, the template's own
 * spec holds, and the executive sentence never prints a figure whose value is missing.
 */

import { normalizeCurrencyCode } from '../../optimization/money';
import { type AnswerTemplatePayload, answerTemplatePayloadSchema } from './core';
import { figureRefsIn } from './figure';
import { TEMPLATE_SPECS } from './registry';

export const TEMPLATE_VIOLATION_RULES = [
  'payload_invalid',
  'duplicate_figure_id',
  'unresolved_ref',
  'figure_without_source',
  'figure_window_missing',
  'currency_inconsistent',
  'sentence_figure_missing_value',
] as const;
export type TemplateViolationRule = (typeof TEMPLATE_VIOLATION_RULES)[number];

export type TemplateViolation = { rule: TemplateViolationRule; message: string };

/** Every figure id the block points at from outside prose: charts, tables, item badges. */
const structuralRefsOf = (block: AnswerTemplatePayload): string[] => {
  const charts = [
    block.executive.hero_chart,
    ...block.justification.sections.map((section) => section.chart),
  ].filter((chart) => chart !== null);
  return [
    ...charts.flatMap((chart) => [
      ...chart.points.map((point) => point.figure_id),
      ...(chart.reference ? [chart.reference.figure_id] : []),
    ]),
    ...block.justification.sections.flatMap((section) => [
      ...(section.table?.rows.flatMap((row) => Object.values(row.cells)) ?? []),
      ...section.items.flatMap((item) => [
        ...(item.badge_figure_id ? [item.badge_figure_id] : []),
        ...item.detail_figure_ids,
      ]),
    ]),
  ];
};

/** Every prose field of the block — each may carry refs. */
const proseOf = (block: AnswerTemplatePayload): string[] => [
  block.executive.sentence,
  ...[
    block.executive.hero_chart,
    ...block.justification.sections.map((section) => section.chart),
  ].flatMap((chart) => (chart?.caption ? [chart.caption] : [])),
  ...block.justification.sections.flatMap((section) => [
    section.text,
    ...section.items.map((item) => item.text),
  ]),
];

const nonEmpty = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export function validateTemplateBlock(block: AnswerTemplatePayload): TemplateViolation[] {
  const out: TemplateViolation[] = [];

  // A block read off the wire (the golden grader, a persisted report) is typed but not
  // checked; the shared shape comes first so the rules below never dereference a hole.
  const shape = answerTemplatePayloadSchema.safeParse(block);
  if (!shape.success) {
    return shape.error.issues.map((issue) => ({
      rule: 'payload_invalid' as const,
      message: `${issue.path.join('.') || '(root)'} — ${issue.message}`,
    }));
  }

  const spec = TEMPLATE_SPECS[block.template_id];
  const parsed = spec.payloadSchema.safeParse(block);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      out.push({
        rule: 'payload_invalid',
        message: `${block.template_id}: ${issue.path.join('.') || '(root)'} — ${issue.message}`,
      });
    }
  }

  const ids = new Set<string>();
  for (const figure of block.figures) {
    if (ids.has(figure.id)) {
      out.push({ rule: 'duplicate_figure_id', message: `figure "${figure.id}" is declared twice` });
    }
    ids.add(figure.id);
    if (![figure.source.tool, figure.source.datasetId, figure.source.level].every(nonEmpty)) {
      out.push({
        rule: 'figure_without_source',
        message: `figure "${figure.id}" does not name the tool, dataset and level it was read from`,
      });
    }
    if (![figure.window.since, figure.window.until, figure.window.label].every(nonEmpty)) {
      out.push({
        rule: 'figure_window_missing',
        message: `figure "${figure.id}" does not state its window`,
      });
    }
  }

  const unresolved = new Set(
    [...proseOf(block).flatMap(figureRefsIn), ...structuralRefsOf(block)].filter(
      (ref) => !ids.has(ref),
    ),
  );
  for (const ref of unresolved) {
    out.push({ rule: 'unresolved_ref', message: `"{${ref}}" names no figure of this block` });
  }

  const currencies = new Set(
    block.figures
      .filter((figure) => figure.unit === 'money')
      .map((figure) => normalizeCurrencyCode(figure.currency) ?? 'unknown'),
  );
  if (currencies.size > 1) {
    out.push({
      rule: 'currency_inconsistent',
      message: `money figures are in ${[...currencies].join(' and ')}`,
    });
  }

  const byId = new Map(block.figures.map((figure) => [figure.id, figure]));
  for (const ref of new Set(figureRefsIn(block.executive.sentence))) {
    const figure = byId.get(ref);
    if (figure && (figure.value == null || !Number.isFinite(figure.value))) {
      out.push({
        rule: 'sentence_figure_missing_value',
        message: `the executive sentence prints "{${ref}}", which has no value`,
      });
    }
  }

  return out;
}
