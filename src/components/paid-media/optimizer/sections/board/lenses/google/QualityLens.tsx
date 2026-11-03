'use client';

// G08 Quality Score on the adaptive board: where the keyword spend sits on Google's 1–10 scale,
// the share at Quality Score ≤ 3 marked over its bars, and how Google rates that spend on its
// three components (expected CTR, ad relevance, landing page) — the one that is below average
// names the fix. Read-only; a low-score keyword's action is the Optimizer's G11 card. At s the
// lens is its one figure over the ten bars.

import {
  type AdAccountBoardSlot,
  type BoardModuleSize,
  type GoogleKeywordQualityRead,
  qualityLensTakeaway,
} from '@continuum/contracts';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { formatCurrency } from '../../../../format';
import { useGoogleKeywordQuality } from '../../../google/googleReads';
import {
  daysIn,
  frameStateOf,
  googleLensRead,
  isTile,
  LENS_WINDOW_DAYS,
  LegendKey,
  LensBody,
  LensFigure,
  LensNote,
  type LensState,
  LensTakeaway,
  LensWindow,
  MarkTip,
  pct,
  useGoogleCustomer,
} from '../../../google/views/lensParts';
import { completeDaysWindow, windowRangeLabel } from '../../../platforms/googleAdsOverviewModel';
import { ModuleFrame } from '../../ModuleFrame';
import { BOARD_COLOR } from '../../palette';
import { BOARD_MODULE_TITLES } from '../../registry';
import type { BoardModuleProps } from '../../types';
import {
  buildQualityLens,
  type ComponentSplit,
  LOW_QS_MAX,
  type LowKeyword,
  QS_COMPONENT_LABEL,
  QS_COMPONENTS,
  type QualityLensModel,
  RATING_LABEL,
  RATINGS,
  type Rating,
} from './qualityModel';

const TEST_ID = 'board-module-quality';

type ReadModel = Extract<QualityLensModel, { kind: 'read' }>;
type Money = (value: number) => string;

/** The low scores take the diverging pair's bad pole; every other score is Search, where every
 *  keyword lives. */
const BAR_COLOR = { low: BOARD_COLOR.above, rest: BOARD_COLOR.search } as const;

/** Google's ratings on the diverging pair: below average is the bad pole, above the good. */
const RATING_COLOR: Record<Rating, string> = {
  BELOW_AVERAGE: BOARD_COLOR.above,
  AVERAGE: BOARD_COLOR.mid,
  ABOVE_AVERAGE: BOARD_COLOR.below,
};

const RATING_LETTER: Record<(typeof QS_COMPONENTS)[number], string> = {
  expected_ctr: 'C',
  ad_relevance: 'R',
  landing_page: 'L',
};

export default function QualityLens({ ctx, slot }: BoardModuleProps) {
  const customer = useGoogleCustomer(ctx.brandId, ctx.adAccountId);
  const customerId = customer.status === 'ready' ? customer.data.customerId : '';
  const window = completeDaysWindow(LENS_WINDOW_DAYS);
  const query = useGoogleKeywordQuality({ brandId: ctx.brandId, customerId, window });
  const read = googleLensRead(query);
  const state: LensState<GoogleKeywordQualityRead> = customer.status !== 'ready' ? customer : read;
  const currency = ctx.currency ?? (customer.status === 'ready' ? customer.data.currency : null);
  return <QualityLensView currency={currency} slot={slot} state={state} />;
}

export function QualityLensView({
  slot,
  state,
  currency,
}: {
  slot: AdAccountBoardSlot;
  state: LensState<GoogleKeywordQualityRead>;
  currency: string | null;
}) {
  const read = state.status === 'ready' ? state.data : null;
  const model = useMemo(() => (read ? buildQualityLens(read) : null), [read]);
  const accountCurrency = read?.currency ?? currency;
  return (
    <ModuleFrame
      action={<LensWindow range={model?.window ?? null} testId={TEST_ID} />}
      reason={slot.reason}
      size={slot.size}
      state={frameStateOf(state, model?.kind === 'read')}
      testId={TEST_ID}
      title={BOARD_MODULE_TITLES.quality}
    >
      <LensBody size={slot.size} state={state} testId={TEST_ID}>
        {() =>
          model ? (
            <QualityBody
              model={model}
              money={(value) => formatCurrency(value, accountCurrency)}
              size={slot.size}
            />
          ) : null
        }
      </LensBody>
    </ModuleFrame>
  );
}

function QualityBody({
  model,
  money,
  size,
}: {
  model: QualityLensModel;
  money: Money;
  size: BoardModuleSize;
}) {
  if (model.kind === 'empty') {
    return (
      <LensNote testId="quality-empty">
        No keyword spent in this window. Performance Max, Display and Video campaigns have no
        keywords.
      </LensNote>
    );
  }
  const headline = (
    <LensFigure
      caption={`of keyword spend at Quality Score ≤ ${LOW_QS_MAX} · ${money(model.low.spend)}`}
      testId="quality-headline"
      value={pct(model.low.share)}
    />
  );
  if (isTile(size)) {
    return (
      <div className="space-y-2.5">
        {headline}
        <Histogram height={52} model={model} money={money} tile />
      </div>
    );
  }
  return (
    <div className="@3xl/module:grid @3xl/module:grid-cols-2 @3xl/module:gap-4 space-y-3 @3xl/module:space-y-0">
      <div className="min-w-0 space-y-3">
        {headline}
        <Histogram height={size === 'l' ? 150 : 124} model={model} money={money} />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
          <LegendKey color={BAR_COLOR.low}>QS 1–{LOW_QS_MAX}: every click costs more</LegendKey>
          <LegendKey color={BAR_COLOR.rest}>QS {LOW_QS_MAX + 1}–10</LegendKey>
          {model.unscored.keywords > 0 ? (
            <span data-testid="quality-unscored">
              Unscored: {money(model.unscored.spend)} on {model.unscored.keywords}{' '}
              {model.unscored.keywords === 1 ? 'keyword' : 'keywords'}
            </span>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        <Components model={model} />
        {size === 'l' || size === 'w' ? <LowestKeywords model={model} money={money} /> : null}
        <LensTakeaway testId="quality-takeaway">
          {qualityLensTakeaway({
            share: pct(model.low.share),
            money: money(model.low.spend),
            keywords: model.low.keywords,
            weakest: model.weakest
              ? { component: model.weakest.component, share: pct(model.weakest.share) }
              : null,
          })}
        </LensTakeaway>
        <LensNote testId="quality-scope">
          {windowRangeLabel(model.window.since, model.window.until)} · {daysIn(model.window)}{' '}
          complete days · the {model.total} keywords that spent most · {model.scored} scored
          {model.average === null ? '' : ` · average Quality Score ${model.average.toFixed(1)}`}
        </LensNote>
      </div>
    </div>
  );
}

/** Spend by Quality Score, one column per score: the low ones in the bad pole, bracketed. */
function Histogram({
  model,
  money,
  height,
  tile = false,
}: {
  model: ReadModel;
  money: Money;
  height: number;
  tile?: boolean;
}) {
  const reduce = useReducedMotion();
  const top = Math.max(...model.histogram.map((bucket) => bucket.spend), 1);
  const bracket = tile ? 0 : 20;
  const label = model.histogram
    .filter((bucket) => bucket.keywords > 0)
    .map((bucket) => `QS ${bucket.score}: ${money(bucket.spend)}`)
    .join('; ');
  return (
    <div className="space-y-1">
      <figure
        aria-label={`Keyword spend by Quality Score. ${label}`}
        className="relative m-0 w-full"
        data-testid="quality-histogram"
        style={{ height }}
      >
        {tile ? null : (
          <div
            className="absolute top-0 left-0 flex flex-col"
            data-testid="quality-low-bracket"
            style={{ width: `${(LOW_QS_MAX / 10) * 100}%` }}
          >
            <span className="whitespace-nowrap font-medium text-foreground text-xs leading-none">
              QS ≤ {LOW_QS_MAX} · {pct(model.low.share)}
            </span>
            <span
              aria-hidden="true"
              className="mt-1 h-1.5 rounded-t-sm border-foreground/40 border-x border-t"
            />
          </div>
        )}
        <div
          className="absolute right-0 bottom-0 left-0 grid grid-cols-10 items-end gap-0.5 border-border border-b"
          style={{ top: bracket }}
        >
          {model.histogram.map((bucket, index) => {
            const low = bucket.score <= LOW_QS_MAX;
            const share = bucket.spend / model.keywordSpend;
            const readout = `Quality Score ${bucket.score} · ${bucket.keywords} ${bucket.keywords === 1 ? 'keyword' : 'keywords'} · ${pct(share)} of keyword spend`;
            if (bucket.spend <= 0) {
              return (
                <div
                  aria-hidden="true"
                  className="h-full"
                  data-score={bucket.score}
                  data-testid="quality-bar-empty"
                  key={bucket.score}
                />
              );
            }
            return (
              <div className="flex h-full items-end justify-center" key={bucket.score}>
                <MarkTip
                  label={readout}
                  mark={
                    <motion.button
                      animate={{ scaleY: 1 }}
                      aria-label={`${money(bucket.spend)}: ${readout}`}
                      className="hit-area w-full max-w-6 origin-bottom rounded-t-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-low={low}
                      data-score={bucket.score}
                      data-testid="quality-bar"
                      initial={reduce ? false : { scaleY: 0 }}
                      style={{
                        height: `${Math.max(3, (bucket.spend / top) * 100)}%`,
                        backgroundColor: low ? BAR_COLOR.low : BAR_COLOR.rest,
                      }}
                      transition={{
                        duration: 0.5,
                        delay: reduce ? 0 : index * 0.04,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      type="button"
                    />
                  }
                  value={money(bucket.spend)}
                />
              </div>
            );
          })}
        </div>
      </figure>
      {tile ? null : (
        <ol
          aria-hidden="true"
          className="grid grid-cols-10 gap-0.5 text-center text-muted-foreground text-xs tabular-nums"
        >
          {model.histogram.map((bucket) => (
            <li key={bucket.score}>{bucket.score}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ComponentRow({ split }: { split: ComponentSplit }) {
  const reduce = useReducedMotion();
  const label = QS_COMPONENT_LABEL[split.component];
  if (split.rated <= 0) {
    return (
      <li className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 text-xs">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">Not rated by Google yet</span>
      </li>
    );
  }
  const below = split.spend.BELOW_AVERAGE / split.rated;
  return (
    <li
      className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs"
      data-component={split.component}
      data-testid="quality-component"
    >
      <span className="truncate text-foreground">{label}</span>
      <span
        aria-label={`${label}: ${RATINGS.map((rating) => `${RATING_LABEL[rating]} ${pct(split.spend[rating] / split.rated)}`).join(', ')}`}
        className="flex h-2 w-full gap-0.5"
        role="img"
      >
        {RATINGS.filter((rating) => split.spend[rating] > 0).map((rating) => (
          <motion.span
            animate={{ scaleX: 1 }}
            aria-hidden="true"
            className="block h-full origin-left rounded-full"
            initial={reduce ? false : { scaleX: 0 }}
            key={rating}
            style={{ backgroundColor: RATING_COLOR[rating], flexGrow: split.spend[rating] }}
            title={`${RATING_LABEL[rating]} · ${pct(split.spend[rating] / split.rated)}`}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </span>
      <span className="whitespace-nowrap text-right text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">{pct(below)}</span> below
      </span>
    </li>
  );
}

/** How Google rates the low-score spend on its three components; all keywords when none is low. */
function Components({ model }: { model: ReadModel }) {
  const low = model.low.keywords > 0;
  const splits = low ? model.lowComponents : model.components;
  return (
    <section
      aria-label="Quality Score components"
      className="space-y-1.5"
      data-testid="quality-components"
    >
      <p className="font-medium text-muted-foreground text-xs">
        {low
          ? `The QS ≤ ${LOW_QS_MAX} spend, as Google rates each component`
          : 'The keyword spend, as Google rates each component'}
      </p>
      <ul className="space-y-1.5">
        {splits.map((split) => (
          <ComponentRow key={split.component} split={split} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
        {RATINGS.map((rating) => (
          <LegendKey color={RATING_COLOR[rating]} key={rating}>
            {RATING_LABEL[rating]}
          </LegendKey>
        ))}
      </div>
    </section>
  );
}

const CHIP_TONE: Record<Rating, string> = {
  BELOW_AVERAGE: `color-mix(in srgb, ${BOARD_COLOR.above} 22%, transparent)`,
  AVERAGE: 'var(--muted)',
  ABOVE_AVERAGE: `color-mix(in srgb, ${BOARD_COLOR.below} 22%, transparent)`,
};

function RatingChips({ keyword }: { keyword: LowKeyword }) {
  return (
    <span className="inline-flex gap-0.5">
      {QS_COMPONENTS.map((component) => {
        const rating = keyword.ratings[component];
        const text = `${QS_COMPONENT_LABEL[component]}: ${rating ? RATING_LABEL[rating] : 'not rated'}`;
        return (
          <span
            aria-label={text}
            className="inline-grid size-5 place-items-center rounded font-medium font-mono text-foreground text-xs"
            key={component}
            role="img"
            style={{ backgroundColor: rating ? CHIP_TONE[rating] : 'transparent' }}
            title={text}
          >
            {RATING_LETTER[component]}
          </span>
        );
      })}
    </span>
  );
}

function LowestKeywords({ model, money }: { model: ReadModel; money: Money }) {
  if (model.lowest.length === 0) return null;
  return (
    <section aria-label="Low-score keywords" className="space-y-1" data-testid="quality-lowest">
      <p className="font-medium text-muted-foreground text-xs">
        The QS ≤ {LOW_QS_MAX} keywords that spent most · C R L = expected CTR, ad relevance, landing
        page
      </p>
      <ul className="divide-y divide-border/60">
        {model.lowest.map((keyword) => (
          <li
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-1 text-xs"
            data-testid="quality-low-keyword"
            key={keyword.id}
          >
            <span className="min-w-0 break-words text-foreground">{keyword.keyword}</span>
            <RatingChips keyword={keyword} />
            <span className="text-right text-muted-foreground tabular-nums">
              <span className="font-medium text-foreground">QS {keyword.score}</span> ·{' '}
              {money(keyword.spend)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
