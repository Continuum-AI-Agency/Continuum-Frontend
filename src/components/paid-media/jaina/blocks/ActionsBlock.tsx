'use client';

// What to do, ranked — read as the product's own register rather than as a spreadsheet.
//
// This was a five-column table (priority · entity · action · size · evidence) with a red,
// an amber and a grey badge down its left edge. A table is the right shape for twenty rows
// a reader scans; it is the wrong shape for the two or three moves that CLOSE a report,
// because it puts every column at the same weight and asks the reader to find the point.
// The closing half of a report has exactly one job: say the number, then say the move.
//
// So each row leads with ONE figure — the evidence value, in the evidence's own unit — and
// follows it with ONE sentence: the entity, the move, its size. The comparator, when the
// model gave one, is the `from → to` of this surface: the only line allowed to widen the
// claim, and absent when the model widened nothing.
//
// The entity is NOT a link. `entity.level` and `entity.id` arrive resolved against the turn's
// own evidence (Backend `resolveBlockEntities`), so the row knows whether it is about a
// campaign, an ad set, an ad or the whole account — but nothing in this app addresses a
// Meta campaign or ad set by its id: the optimizer's URL state addresses a PORTFOLIO
// (`?optimizerView=portfolios&portfolio=…`) and an ad set only inside one. A link to a
// route that does not exist is the same defect as an account named where a campaign
// belongs, so the name is rendered plainly and the resolved level and id are carried on
// the element for the surface that can honestly use them.
//
// The "nothing is appended to the label" rule follows
// `optimizer/sections/account/candidateHeadline.tsx`. Those components are typed on
// `AccountCandidate` and an action row is not one, so the rule is mirrored here rather
// than imported — the same call `JustificationBlock` makes. `CalmRule`, which is generic, IS
// imported, so this surface breathes on the one rhythm every other surface breathes on.
// The sizes are the answer's own scale (`JAINA_TYPE`): every figure is a figure, and the
// rank a row carries is its position and `data-priority`, not a larger typeface.
//
// The block is the answer's "now what": a decision module on the primary tint, no border and
// no rule down the rows — the moves are separated by space, and each move's sentence is set
// semibold because it is the line the reader acts on.

import { CalmRule } from '@/components/paid-media/optimizer/sections/account/candidateHeadline';
import { formatValue } from '@/lib/jaina/formatValue';
import type { ActionsBlockV2 } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import { JAINA_TYPE } from '../reading';
import { BlockHeading } from './BlockHeading';
import { BlockSourcesFooter, CitationChips } from './citations';
import { JAINA_MODULE } from './modules';
import { InlineProse } from './prose';

type ActionsBlockProps = { block: ActionsBlockV2; isStreaming: boolean };
type ActionRow = ActionsBlockV2['rows'][number];

/** What the level reads as beside the name when the model gave no `kind` of its own. */
const LEVEL_LABEL: Record<NonNullable<ActionRow['entity']['level']>, string> = {
  account: 'account',
  campaign: 'campaign',
  adset: 'ad set',
  ad: 'ad',
};

/**
 * The parenthetical after the entity: the model's `kind` when it gave one, else the
 * resolved level. An account-wide move says so — "(account)" is the reader's cue that the
 * row is about the whole account and not a campaign the card failed to name.
 */
const entityKindLabel = (entity: ActionRow['entity']): string | null =>
  entity.kind ?? (entity.level ? LEVEL_LABEL[entity.level] : null);

/** A currency unit is a three-letter code; anything else is a plain number's unit. */
const isCurrencyCode = (unit: string | null): unit is string => !!unit && /^[A-Z]{3}$/.test(unit);

/**
 * The figure the row leads with, printed in the evidence's own unit.
 *
 * Nothing is appended: the metric name and the window are the LABEL beside it, and gluing a
 * unit onto a value the formatter already carried is how a screen ships "$88.40 USD".
 */
function evidenceFigure(evidence: ActionRow['evidence']): string {
  if (typeof evidence.value !== 'number') return evidence.value;
  return isCurrencyCode(evidence.unit)
    ? formatValue(evidence.value, 'currency', { currency: evidence.unit })
    : formatValue(evidence.value, 'number');
}

export default function ActionsBlock({ block }: ActionsBlockProps) {
  return (
    <section
      className={JAINA_MODULE.decision}
      data-jaina-module="decision"
      data-testid="actions-block"
    >
      <BlockHeading
        title={block.title}
        leading={<CalmRule play testId="actions-calm-rule" />}
        className="gap-2"
      />
      <ol className="space-y-3">
        {block.rows.map((row) => (
          <li
            data-priority={row.priority}
            data-testid="actions-row"
            key={`${row.priority}|${row.entity.id ?? row.entity.name}|${row.action}`}
          >
            <p
              className={cn(
                'flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground',
                JAINA_TYPE.table,
              )}
              data-testid="actions-figure"
            >
              <span className={cn(JAINA_TYPE.figure, 'text-foreground')}>
                {evidenceFigure(row.evidence)}
              </span>
              <span className="text-foreground">
                {row.evidence.metric} · {row.evidence.window}
              </span>
            </p>
            <p
              className={cn('mt-0.5 font-semibold text-foreground', JAINA_TYPE.body)}
              data-testid="actions-sentence"
            >
              <span
                className="font-semibold"
                data-entity-id={row.entity.id ?? undefined}
                data-entity-level={row.entity.level ?? undefined}
                data-testid="actions-entity"
              >
                {row.entity.name}
              </span>
              {entityKindLabel(row.entity) ? (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  ({entityKindLabel(row.entity)})
                </span>
              ) : null}
              {' — '}
              <InlineProse text={row.action} />
              {row.sizing ? (
                <span className="font-normal text-muted-foreground tabular-nums">
                  {' '}
                  · {row.sizing}
                </span>
              ) : null}
              <CitationChips citeIds={row.cite_ids} citations={block.citations} className="ml-1" />
            </p>
            {/* The `from → to` of this surface: shown only when the model actually named the
             *  thing it compared against. Printing a bare figure beside a null would be the
             *  card inventing the comparison the model declined to make. */}
            {row.evidence.comparator ? (
              <p
                className={cn('mt-0.5 text-muted-foreground tabular-nums', JAINA_TYPE.table)}
                data-testid="actions-comparator"
              >
                {row.evidence.comparator}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      <BlockSourcesFooter citations={block.citations} />
    </section>
  );
}
