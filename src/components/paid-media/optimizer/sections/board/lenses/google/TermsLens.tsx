'use client';

// G07 Search terms on the adaptive board: what the search-term spend buys, by intent — brand,
// competitor, wrong intent and the rest — as a treemap of each bucket's roots, competitors and
// themes, with every bucket's share and money beside it. A tile or a bucket lists its terms and
// takes them to Jaina as a question; nothing here writes (negatives go through the Optimizer's
// cards). At s the lens is its one figure over a thin bar of the four buckets.

import {
  type AdAccountBoardSlot,
  type BoardModuleSize,
  type GoogleSignalsRead,
  type PlatformCard,
  type TermsLensTakeawayFigure,
  termsLensTakeaway,
  termsLensTakeawayQuiet,
} from '@continuum/contracts';
import { motion, useReducedMotion } from 'motion/react';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../../../format';
import { useGoogleSignals } from '../../../google/googleReads';
import {
  CARDS_UNREAD,
  frameStateOf,
  googleLensRead,
  HATCH,
  isTile,
  LegendKey,
  LensBody,
  LensFigure,
  LensNote,
  type LensState,
  LensTakeaway,
  LensWindow,
  lensAll,
  MarkTip,
  pct,
  useGoogleCardsLens,
  useGoogleCustomer,
} from '../../../google/views/lensParts';
import { jainaTermsPrompt, type SearchTerm } from '../../../google/views/searchTermRoots';
import { windowRangeLabel } from '../../../platforms/googleAdsOverviewModel';
import { ModuleFrame } from '../../ModuleFrame';
import { BOARD_COLOR } from '../../palette';
import { BOARD_MODULE_TITLES } from '../../registry';
import type { BoardModuleProps } from '../../types';
import {
  type BucketFigure,
  buildTermsModel,
  type FlaggedBucket,
  squarify,
  TERM_BUCKET_LABEL,
  TERM_BUCKETS,
  type TermBucket,
  type TermsModel,
  type TermTile,
  termListsOf,
  termsOfSelection,
} from './termsModel';

const TEST_ID = 'board-module-terms';

/** One read for the terms and the profile that tells them apart: the edge infers the account's
 *  competitors from these same terms, so a profile read alone would name none. */
const TERMS_BLOCKS = ['profile', 'search_terms'] as const;

/** The board palette's three categorical slots, then gray with a texture for the money that
 *  buys no intent to purchase. */
const BUCKET_COLOR: Record<TermBucket, string> = {
  brand: BOARD_COLOR.search,
  competitor: BOARD_COLOR.pmax,
  rest: BOARD_COLOR.video,
  wrong_intent: BOARD_COLOR.mid,
};

const HEADLINE_CAPTION: Record<FlaggedBucket, string> = {
  brand: 'of search-term spend buys the brand',
  competitor: 'of search-term spend buys competitor searches',
  wrong_intent: 'of search-term spend has no intent to buy',
};

type ReadModel = Extract<TermsModel, { kind: 'read' }>;
type Selection = { bucket: TermBucket; groupKey: string | null; folded: boolean };
type Money = (value: number) => string;

export type TermsLensInputs = { read: GoogleSignalsRead; cards: PlatformCard[] | null };

export default function TermsLens({ ctx, slot }: BoardModuleProps) {
  const customer = useGoogleCustomer(ctx.brandId, ctx.adAccountId);
  const customerId = customer.status === 'ready' ? customer.data.customerId : '';
  const query = useGoogleSignals({ brandId: ctx.brandId, customerId, blocks: TERMS_BLOCKS });
  const cards = useGoogleCardsLens(ctx.brandId);
  const reads = lensAll(googleLensRead(query), cards);
  const state: LensState<TermsLensInputs> =
    customer.status !== 'ready'
      ? customer
      : reads.status === 'ready'
        ? { status: 'ready', data: { read: reads.data[0], cards: reads.data[1] } }
        : reads;
  const currency = ctx.currency ?? (customer.status === 'ready' ? customer.data.currency : null);
  return <TermsLensView currency={currency} slot={slot} state={state} />;
}

export function TermsLensView({
  slot,
  state,
  currency,
}: {
  slot: AdAccountBoardSlot;
  state: LensState<TermsLensInputs>;
  currency: string | null;
}) {
  const read = state.status === 'ready' ? state.data.read : null;
  const cards = state.status === 'ready' ? state.data.cards : null;
  // Vivo 47's terms are ~27k rows: the buckets are read once per answer, never per render.
  const model = useMemo(
    () =>
      read
        ? buildTermsModel(read, termListsOf(read.signals?.google?.profile, cards, CARDS_UNREAD))
        : null,
    [read, cards],
  );
  const accountCurrency = read?.signals?.currency ?? currency;
  return (
    <ModuleFrame
      action={
        <LensWindow
          range={model && model.kind !== 'unread' ? model.window : null}
          testId={TEST_ID}
        />
      }
      reason={slot.reason}
      size={slot.size}
      state={frameStateOf(state, model?.kind === 'read')}
      testId={TEST_ID}
      title={BOARD_MODULE_TITLES.terms}
    >
      <LensBody size={slot.size} state={state} testId={TEST_ID}>
        {() =>
          model ? (
            <TermsBody
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

function TermsBody({
  model,
  money,
  size,
}: {
  model: TermsModel;
  money: Money;
  size: BoardModuleSize;
}) {
  if (model.kind === 'unread') {
    return <LensNote testId="terms-unread">— {model.reason}</LensNote>;
  }
  if (model.kind === 'empty') {
    return (
      <LensNote testId="terms-empty">
        No search term spent in Google's last 30 complete days.
      </LensNote>
    );
  }
  if (isTile(size)) return <TermsTileBody model={model} money={money} />;
  return <TermsFullBody model={model} money={money} size={size} />;
}

function Headline({ model, money }: { model: ReadModel; money: Money }) {
  if (!model.headline) {
    return (
      <LensFigure
        caption={`on ${model.termCount.toLocaleString('en-US')} search terms`}
        testId="terms-headline"
        value={money(model.total)}
      />
    );
  }
  const lead = model.buckets[model.headline];
  return (
    <LensFigure
      caption={`${HEADLINE_CAPTION[model.headline]} · ${money(lead.spend)}`}
      testId="terms-headline"
      value={pct(lead.share)}
    />
  );
}

function TermsTileBody({ model, money }: { model: ReadModel; money: Money }) {
  return (
    <div className="space-y-2.5">
      <Headline model={model} money={money} />
      <BucketBar model={model} money={money} />
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
        {TERM_BUCKETS.filter((bucket) => model.buckets[bucket].spend > 0).map((bucket) => (
          <LegendKey color={BUCKET_COLOR[bucket]} hatched={bucket === 'wrong_intent'} key={bucket}>
            {TERM_BUCKET_LABEL[bucket]} {pct(model.buckets[bucket].share)}
          </LegendKey>
        ))}
      </div>
    </div>
  );
}

/** The four buckets as one thin bar: no text on it, every part in its readout. */
function BucketBar({ model, money }: { model: ReadModel; money: Money }) {
  const parts = TERM_BUCKETS.map((bucket) => model.buckets[bucket]).filter(
    (figure) => figure.spend > 0,
  );
  const reduce = useReducedMotion();
  return (
    <div
      aria-label={`Search-term spend by intent: ${parts
        .map((figure) => `${TERM_BUCKET_LABEL[figure.bucket]} ${pct(figure.share)}`)
        .join(', ')}`}
      className="flex h-2 w-full gap-0.5"
      data-testid="terms-bucket-bar"
      role="img"
    >
      {parts.map((figure) => (
        <motion.span
          animate={{ scaleX: 1 }}
          aria-hidden="true"
          className={cn(
            'block h-full origin-left rounded-full',
            figure.bucket === 'wrong_intent' && HATCH,
          )}
          initial={reduce ? false : { scaleX: 0 }}
          key={figure.bucket}
          style={{ backgroundColor: BUCKET_COLOR[figure.bucket], flexGrow: figure.spend }}
          title={`${TERM_BUCKET_LABEL[figure.bucket]} · ${pct(figure.share)} · ${money(figure.spend)}`}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}

function takeawayFigure(figure: BucketFigure, money: Money): TermsLensTakeawayFigure {
  return {
    bucket: figure.bucket as FlaggedBucket,
    share: pct(figure.share),
    money: money(figure.spend),
    converted: figure.conversions > 0,
  };
}

function Takeaway({ model, money }: { model: ReadModel; money: Money }) {
  const [lead, also] = model.flagged.map((bucket) => model.buckets[bucket]);
  return (
    <LensTakeaway testId="terms-takeaway">
      {lead
        ? termsLensTakeaway(takeawayFigure(lead, money), also ? takeawayFigure(also, money) : null)
        : termsLensTakeawayQuiet(money(model.total))}
    </LensTakeaway>
  );
}

function TermsFullBody({
  model,
  money,
  size,
}: {
  model: ReadModel;
  money: Money;
  size: BoardModuleSize;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const tall = size === 'l';
  const listsRoots = tall || size === 'w';
  const select = (next: Selection) =>
    setSelection((current) =>
      current &&
      current.bucket === next.bucket &&
      current.groupKey === next.groupKey &&
      current.folded === next.folded
        ? null
        : next,
    );
  return (
    <div className="@3xl/module:grid @3xl/module:grid-cols-5 @3xl/module:gap-4 space-y-3 @3xl/module:space-y-0">
      <div className="@3xl/module:col-span-3 min-w-0 space-y-3">
        <Headline model={model} money={money} />
        <Treemap
          height={tall ? 232 : 184}
          model={model}
          money={money}
          onSelect={select}
          selection={selection}
        />
      </div>
      <div className="@3xl/module:col-span-2 min-w-0 space-y-3">
        <BucketLegend model={model} money={money} onSelect={select} selection={selection} />
        {selection ? (
          <SelectedTerms model={model} money={money} selection={selection} />
        ) : listsRoots ? (
          <TopGroups model={model} money={money} />
        ) : (
          <LensNote>Tap a tile or a bucket to list its terms.</LensNote>
        )}
        <Takeaway model={model} money={money} />
        <LensNote testId="terms-scope">
          {windowRangeLabel(model.window.since, model.window.until)} · Google's last 30 complete
          days · {model.termCount.toLocaleString('en-US')} Search and Performance Max terms
        </LensNote>
      </div>
    </div>
  );
}

/** The box's measured width; null until a browser lays it out. */
function useBoxWidth<T extends HTMLElement>(): [RefObject<T | null>, number | null] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0) setWidth(box.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** The narrowest the treemap draws (a 390px screen less its gutters and the card's padding):
 *  labels are fitted to it until the box is measured, so none is ever clipped. */
const NARROWEST = 326;
/** A tile prints its name from this size, and its money below it from the second height. */
const LABEL_MIN = { w: 64, h: 24, hMoney: 42 };

function Treemap({
  model,
  money,
  height,
  selection,
  onSelect,
}: {
  model: ReadModel;
  money: Money;
  height: number;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const [ref, measured] = useBoxWidth<HTMLDivElement>();
  const width = measured ?? NARROWEST;
  const reduce = useReducedMotion();
  const rects = useMemo(
    () =>
      squarify(
        model.tiles.map((tile) => ({ ...tile, value: tile.spend })),
        width,
        height,
      ),
    [model.tiles, width, height],
  );
  return (
    <div className="relative w-full" data-testid="terms-treemap" ref={ref} style={{ height }}>
      {rects.map((rect, index) => {
        const tile: TermTile = rect;
        const tileSelection = {
          bucket: tile.bucket,
          groupKey: tile.groupKey,
          folded: tile.groupKey === null,
        };
        const selected =
          selection !== null &&
          selection.bucket === tile.bucket &&
          selection.groupKey === tile.groupKey &&
          selection.folded === tileSelection.folded;
        const dimmed = selection !== null && selection.bucket !== tile.bucket;
        const showLabel = rect.w >= LABEL_MIN.w && rect.h >= LABEL_MIN.h;
        const showMoney = showLabel && rect.h >= LABEL_MIN.hMoney;
        const share = tile.spend / model.total;
        const summary = `${tile.label} · ${TERM_BUCKET_LABEL[tile.bucket]} · ${pct(share)} · ${tile.termCount} ${tile.termCount === 1 ? 'term' : 'terms'} · ${tile.conversions.toLocaleString('en-US', { maximumFractionDigits: 1 })} conv.`;
        return (
          <MarkTip
            key={tile.id}
            label={summary}
            mark={
              <motion.button
                animate={{ opacity: dimmed ? 0.45 : 1, scale: 1 }}
                aria-label={`${money(tile.spend)}: ${summary}`}
                aria-pressed={selected}
                className={cn(
                  'absolute flex flex-col items-start justify-start gap-0.5 overflow-hidden rounded-md border-2 border-card p-1.5 text-left',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  tile.bucket === 'wrong_intent' ? cn(HATCH, 'text-foreground') : 'text-white',
                  selected && 'ring-2 ring-foreground ring-inset',
                )}
                data-bucket={tile.bucket}
                data-testid="terms-tile"
                initial={reduce ? false : { opacity: 0, scale: 0.94 }}
                onClick={() => onSelect(tileSelection)}
                style={{
                  left: `${(rect.x / width) * 100}%`,
                  top: `${(rect.y / height) * 100}%`,
                  width: `${(rect.w / width) * 100}%`,
                  height: `${(rect.h / height) * 100}%`,
                  backgroundColor: BUCKET_COLOR[tile.bucket],
                }}
                transition={{ duration: 0.35, delay: reduce ? 0 : index * 0.03 }}
                type="button"
              >
                {showLabel ? (
                  <span className="w-full truncate font-semibold text-xs leading-tight">
                    {tile.label}
                  </span>
                ) : null}
                {showMoney ? (
                  <span className="text-xs tabular-nums leading-tight opacity-90">
                    {money(tile.spend)}
                  </span>
                ) : null}
              </motion.button>
            }
            value={money(tile.spend)}
          />
        );
      })}
    </div>
  );
}

function BucketLegend({
  model,
  money,
  selection,
  onSelect,
}: {
  model: ReadModel;
  money: Money;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  return (
    <ul className="grid @sm/module:grid-cols-2 grid-cols-1 gap-1" data-testid="terms-legend">
      {TERM_BUCKETS.map((bucket) => {
        const figure = model.buckets[bucket];
        const selected =
          selection !== null &&
          selection.bucket === bucket &&
          selection.groupKey === null &&
          !selection.folded;
        if (figure.unknown) {
          return (
            <li
              className="min-w-0 px-1.5 py-1 text-muted-foreground text-xs"
              data-bucket={bucket}
              data-testid="terms-legend-unknown"
              key={bucket}
            >
              <span className="font-medium text-foreground">{TERM_BUCKET_LABEL[bucket]}</span> —{' '}
              {figure.unknown}
            </li>
          );
        }
        return (
          <li className="min-w-0" key={bucket}>
            <button
              aria-pressed={selected}
              className={cn(
                'hit-area flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs',
                'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent',
                selected && 'bg-muted',
              )}
              data-bucket={bucket}
              data-testid="terms-legend-bucket"
              disabled={figure.spend <= 0}
              onClick={() => onSelect({ bucket, groupKey: null, folded: false })}
              type="button"
            >
              <LegendKey color={BUCKET_COLOR[bucket]} hatched={bucket === 'wrong_intent'}>
                <span className="font-medium text-foreground">{TERM_BUCKET_LABEL[bucket]}</span>
              </LegendKey>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                <span className="font-medium text-foreground">{pct(figure.share)}</span> ·{' '}
                {money(figure.spend)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const LISTED = 6;

function TermRow({ term, money }: { term: SearchTerm; money: Money }) {
  return (
    <li className="flex min-w-0 items-baseline justify-between gap-3 py-1 text-xs">
      <span className="min-w-0 break-words text-foreground">{term.term}</span>
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {money(term.totals.spend)} ·{' '}
        {term.totals.conversions.toLocaleString('en-US', { maximumFractionDigits: 1 })} conv.
      </span>
    </li>
  );
}

function SelectedTerms({
  model,
  money,
  selection,
}: {
  model: ReadModel;
  money: Money;
  selection: Selection;
}) {
  const terms = termsOfSelection(model, selection);
  const spend = terms.reduce((sum, term) => sum + term.totals.spend, 0);
  const tile = model.tiles.find(
    (candidate) =>
      candidate.bucket === selection.bucket &&
      candidate.groupKey === selection.groupKey &&
      selection.groupKey !== null,
  );
  const title =
    tile?.label ??
    (selection.folded
      ? `${TERM_BUCKET_LABEL[selection.bucket]} · smaller groups`
      : TERM_BUCKET_LABEL[selection.bucket]);
  return (
    <section aria-label={`Terms in ${title}`} className="space-y-1" data-testid="terms-selected">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs">
        <LegendKey
          color={BUCKET_COLOR[selection.bucket]}
          hatched={selection.bucket === 'wrong_intent'}
        >
          <span className="font-semibold text-foreground">{title}</span>
        </LegendKey>
        <span className="text-muted-foreground tabular-nums">
          {terms.length.toLocaleString('en-US')} {terms.length === 1 ? 'term' : 'terms'} ·{' '}
          {money(spend)}
        </span>
      </p>
      <ul className="divide-y divide-border/60">
        {terms.slice(0, LISTED).map((term) => (
          <TermRow
            key={`${term.campaign_id}:${term.ad_group_id ?? 'pmax'}:${term.term}`}
            money={money}
            term={term}
          />
        ))}
      </ul>
      <p className="flex flex-wrap items-center gap-x-3 text-xs">
        {terms.length > LISTED ? (
          <span className="text-muted-foreground">
            The {LISTED} that spent most; {(terms.length - LISTED).toLocaleString('en-US')} more.
          </span>
        ) : null}
        <a
          className="hit-area text-primary-ink hover:underline"
          data-testid="terms-ask-jaina"
          href={jainaPromptHref(
            jainaTermsPrompt(
              terms.map((term) => term.term),
              model.window,
            ),
            'google_ads',
            { newConversation: true },
          )}
        >
          Ask Jaina about these
        </a>
      </p>
    </section>
  );
}

/** The groups that spent most, whatever their bucket: the roots, competitors and themes. */
function TopGroups({ model, money }: { model: ReadModel; money: Money }) {
  return (
    <section aria-label="Top roots" className="space-y-1" data-testid="terms-top-groups">
      <p className="font-medium text-muted-foreground text-xs">Top roots</p>
      <ul className="divide-y divide-border/60">
        {model.topGroups.map(({ bucket, group }) => (
          <li
            className="flex min-w-0 items-baseline justify-between gap-3 py-1 text-xs"
            key={`${bucket}:${group.key}`}
          >
            <LegendKey color={BUCKET_COLOR[bucket]} hatched={bucket === 'wrong_intent'}>
              <span className="text-foreground">{group.label}</span>{' '}
              <span className="text-muted-foreground">
                · {group.terms.length} {group.terms.length === 1 ? 'term' : 'terms'}
              </span>
            </LegendKey>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {money(group.spend)} · {pct(group.spend / model.total)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
