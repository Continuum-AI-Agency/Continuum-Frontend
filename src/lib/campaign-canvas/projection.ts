// The projected after of a Jaina proposal, as the strings and bars the companion canvas
// draws (`paid.live_change_preview` carrying `projection`). Pure: the component only lays
// these out. Every figure is read off the payload; nothing is computed here but percentages
// of a bar, so the canvas can never disagree with the chat's table, which reads the same
// dataset cells.

import {
  type ChangeProjection,
  formatMoney,
  type ProjectionEntity,
  type ProjectionFigures,
} from '@continuum/contracts';

export const PROJECTION_UNKNOWN = '—';
export const PROJECTION_NOT_PROJECTED = 'Not projected';

export type BeforeAfterText = { before: string; after: string };

export type ProjectionRowView = {
  id: string;
  name: string;
  changeLabel: string;
  action: ProjectionEntity['action'];
  spend: BeforeAfterText;
  results: BeforeAfterText & { range: string | null };
  cost: BeforeAfterText;
  share: BeforeAfterText;
  note: string | null;
};

const numberText = (value: number | null): string =>
  value === null
    ? PROJECTION_UNKNOWN
    : value.toLocaleString('en-US', { maximumFractionDigits: 1 });

const moneyText = (value: number | null, currency: string | null): string =>
  value === null ? PROJECTION_UNKNOWN : formatMoney(value, currency);

const shareText = (value: number | null): string =>
  value === null ? PROJECTION_UNKNOWN : `${Math.round(value * 1000) / 10}%`;

const rangeText = (entity: ProjectionEntity): string | null => {
  const range = entity.afterRange;
  if (!range || range.resultsLow === null || range.resultsHigh === null) return null;
  return `${numberText(range.resultsLow)} to ${numberText(range.resultsHigh)}`;
};

export const projectionRowsOf = (projection: ChangeProjection): ProjectionRowView[] =>
  projection.entities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    changeLabel: entity.changeLabel,
    action: entity.action,
    spend: {
      before: moneyText(entity.before.spend, projection.currency),
      after: moneyText(entity.after.spend, projection.currency),
    },
    results: {
      before: numberText(entity.before.results),
      after:
        entity.after.results === null ? PROJECTION_NOT_PROJECTED : numberText(entity.after.results),
      range: rangeText(entity),
    },
    cost: {
      before: moneyText(entity.before.costPerResult, projection.currency),
      after: moneyText(entity.after.costPerResult, projection.currency),
    },
    share: { before: shareText(entity.before.share), after: shareText(entity.after.share) },
    note: entity.note,
  }));

export type ProjectionBar = {
  id: string;
  label: string;
  before: number;
  after: number;
  beforePct: number;
  afterPct: number;
};

const percentOf = (value: number, max: number): number =>
  max > 0 ? Math.round((value / max) * 1000) / 10 : 0;

/** Results now vs after, one pair per entity; an entity with no projected after has no bar. */
export const projectionBarsOf = (projection: ChangeProjection): ProjectionBar[] => {
  const pairs = projection.entities.flatMap((entity) =>
    entity.before.results !== null && entity.after.results !== null
      ? [{ entity, before: entity.before.results, after: entity.after.results }]
      : [],
  );
  const max = Math.max(0, ...pairs.flatMap((pair) => [pair.before, pair.after]));
  return pairs.map(({ entity, before, after }) => ({
    id: entity.id,
    label: entity.name,
    before,
    after,
    beforePct: percentOf(before, max),
    afterPct: percentOf(after, max),
  }));
};

export const projectionWindowText = (projection: ChangeProjection): string => {
  const { since, until, days, label } = projection.window;
  const span = since && until ? `${since} to ${until}` : (label ?? 'the window read');
  return `${span} · ${days} days`;
};

const totalText = (figures: ProjectionFigures): string => numberText(figures.results);

/** One line over the table: the totals, or what stops the total from being stated. */
export const projectionHeadlineOf = (projection: ChangeProjection): string => {
  const { before, after, afterRange } = projection.totals;
  const label = projection.resultLabel.toLowerCase();
  if (after.results === null) {
    return `Projected ${label}: not projected for every entity, so no total is stated.`;
  }
  const range =
    afterRange && afterRange.resultsLow !== null && afterRange.resultsHigh !== null
      ? ` (${numberText(afterRange.resultsLow)} to ${numberText(afterRange.resultsHigh)})`
      : '';
  return `Projected ${label}: ${totalText(before)} now, ${totalText(after)}${range} after.`;
};
