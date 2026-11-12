'use client';
import { useLocale, useLocale as useNumberLocale, type useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { resultWords } from '../../../account/overviewModel';
import { resultWordsUi } from './metaLensModel';

type ScaleCopy = ReturnType<typeof useTranslations<'scale'>>;

import { useTranslations as useBetaTranslations } from 'next-intl';

// Account structure (M15): campaign → ad set → ad as an icicle, each node as wide as its spend
// over the last 30 days and tinted by its cost against the goal, or by the portfolio holding it.
// An ad set a portfolio holds but Meta no longer serves is hatched. A campaign zooms on click:
// it takes the width, its ad sets the row below and their ads (read on zoom) the last row, every
// node gliding to its place. Small, it leads with the share of spend the portfolios hold over a
// bare two-row icicle.

import type { BoardModuleSize } from '@continuum/contracts';
import { AlertTriangleIcon, ChevronRightIcon } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  currencyColumnSuffix,
  formatCurrency,
  formatCurrencyInColumn,
} from '@/components/paid-media/optimizer/format';
import { useOptimizerAdAccounts } from '@/components/paid-media/optimizer/useOptimizerData';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { bareAccountId } from '@/lib/paid-media/accountId';
import { cn } from '@/lib/utils';
import { BOARD_COLOR } from '../../palette';
import type { BoardModuleProps } from '../../types';
import {
  ChartTip,
  frameStateOf,
  HATCH_STYLE,
  Headline,
  LegendItem,
  LegendRow,
  LensNote,
  leanFill,
  MetaFrame,
  PORTFOLIO_SLOT_COLORS,
  ReadNote,
  slotFill,
  Takeaway,
  useChartTip,
  useMeasuredWidth,
  WindowLine,
} from './MetaLensParts';
import { costLean, formatShare, type MetaRankRow, monthDayEn } from './metaLensModel';
import {
  type MetaReadState,
  useCampaignAds,
  useMetaRanking,
  usePortfolioRosters,
} from './metaReads';
import {
  buildStructure,
  type IcicleCell,
  type LostGroup,
  layoutIcicle,
  type StructureModel,
  type StructureNode,
} from './structureModel';

const TEST_ID = 'board-module-structure';
const ROW_HEIGHT = 44;
const SMALL_ROW_HEIGHT = 16;
const ROW_GAP = 4;
/** Below this width a node draws no label: its tooltip names it. */
const LABEL_MIN_PX = 44;

type StructureColor = 'goal' | 'portfolio';

export default function StructureMap({ ctx, slot }: BoardModuleProps) {
  const betaUiText = useBetaTranslations('scale');
  const uiLocale = useLocale();

  const campaigns = useMetaRanking(ctx.brandId, ctx.adAccountId, 'top_campaigns');
  const adsets = useMetaRanking(ctx.brandId, ctx.adAccountId, 'top_adsets');
  const { rosters } = usePortfolioRosters(ctx.portfolios);
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const ads = useCampaignAds(ctx.brandId, ctx.adAccountId, slot.size === 's' ? null : zoomedId);
  const accounts = useOptimizerAdAccounts(ctx.brandId);
  const rootName = useMemo(() => {
    const wanted = ctx.adAccountId ? bareAccountId(ctx.adAccountId) : null;
    const account = accounts.data.find((row) => bareAccountId(row.account_id) === wanted);
    return account?.name ?? 'Meta account';
  }, [accounts.data, ctx.adAccountId]);
  const model = useMemo(() => {
    if (campaigns.status !== 'ready' || adsets.status === 'loading') return null;
    return buildStructure({
      campaigns: campaigns.data,
      adsets: adsets.status === 'ready' ? adsets.data : [],
      adsetsRead: adsets.status === 'ready',
      portfolios: ctx.portfolios,
      rosters,
      rootName,
    });
  }, [campaigns, adsets, ctx.portfolios, rosters, rootName]);
  const waiting =
    campaigns.status !== 'ready' ? campaigns : adsets.status === 'loading' ? adsets : null;
  // Still reading while the rosters are on their way too: the portfolios land on the icicle and in
  // its takeaway. A failed ad set read still draws the campaigns, and says it failed.
  const state =
    rosters == null && campaigns.status === 'ready'
      ? 'loading'
      : frameStateOf(
          waiting?.status ?? (adsets.status === 'error' ? 'error' : 'ready'),
          model != null,
        );
  return (
    <MetaFrame slot={slot} state={state} testId={TEST_ID} title={betaUiText('beta_c55a0320f3b1')}>
      {waiting ? (
        <ReadNote size={slot.size} state={waiting} testId={TEST_ID} what="campaigns" />
      ) : model ? (
        <StructureView
          ads={ads}
          currency={ctx.currency}
          model={model}
          onZoom={setZoomedId}
          size={slot.size}
          zoomedId={zoomedId}
        />
      ) : (
        <LensNote testId={`${TEST_ID}-empty`}>{betaUiText('beta_57b869c75f73')}</LensNote>
      )}
    </MetaFrame>
  );
}

function slotOf(model: StructureModel, portfolioId: string | null): number | null {
  if (!portfolioId) return null;
  return model.portfolios.find((portfolio) => portfolio.id === portfolioId)?.slot ?? null;
}

function fillOf(node: StructureNode, color: StructureColor, model: StructureModel): CSSProperties {
  if (node.lost) return HATCH_STYLE;
  if (node.level === 'root' || node.level === 'rest') return { background: 'var(--muted)' };
  if (color === 'portfolio') {
    if (node.level === 'campaign') return { background: 'var(--muted)' };
    const slot = slotOf(model, node.portfolioId);
    return { background: slot != null ? slotFill(slot) : BOARD_COLOR.mid };
  }
  return {
    background:
      node.costPerResult != null
        ? leanFill(costLean(node.costPerResult, model.reference?.value ?? null))
        : BOARD_COLOR.mid,
  };
}

function figureLine(
  node: StructureNode,
  model: StructureModel,
  currency: string | null,
  t: ScaleCopy,
  locale: UiLocale,
): string {
  const spend = formatCurrencyInColumn(node.spend, currency, locale);
  const words = model.result ? resultWords(model.result.kind, model.result.en.one, t) : null;
  if (!words || node.level === 'rest') return spend;
  if (node.costPerResult != null)
    return `${spend} · ${t('metaPerResult', { amount: formatCurrencyInColumn(node.costPerResult, currency, locale), result: words.one })}`;
  return node.results === 0 ? t('metaNoResult', { amount: spend, result: words.many }) : spend;
}

function NodeTip({
  node,
  model,
  currency,
}: {
  node: StructureNode;
  model: StructureModel;
  currency: string | null;
}) {
  const t = useBetaTranslations('scale');
  const locale = useLocale();
  const portfolio = node.portfolioId
    ? model.portfolios.find((candidate) => candidate.id === node.portfolioId)
    : undefined;
  const words = model.result ? resultWords(model.result.kind, model.result.en.one, t) : null;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">{node.name}</span>
      <span>
        {t('metaOfSpend', {
          amount: formatCurrency(node.spend, currency, locale),
          share: formatShare(model.totalSpend > 0 ? node.spend / model.totalSpend : null),
        })}
      </span>
      {words && node.results != null ? (
        <span>
          {t('metaResultCount', {
            count: node.results,
            result: node.results === 1 ? words.one : words.many,
            cost:
              node.costPerResult != null
                ? t('metaEach', {
                    amount: formatCurrency(node.costPerResult, currency, locale),
                  })
                : '',
          })}
        </span>
      ) : null}
      {portfolio ? <span>{t('metaInPortfolio', { name: portfolio.name })}</span> : null}
      {node.lost ? (
        <span>
          {t('metaLost', {
            date: node.lostSince
              ? t('metaOnDate', { date: monthDayEn(node.lostSince, locale) })
              : '',
          })}
        </span>
      ) : null}
    </span>
  );
}

export function StructureView({
  model,
  size,
  currency,
  zoomedId,
  onZoom,
  ads,
}: {
  model: StructureModel;
  size: BoardModuleSize;
  currency: string | null;
  /** The campaign zoomed into, or null for the whole account. */
  zoomedId: string | null;
  onZoom: (campaignId: string | null) => void;
  /** The zoomed campaign's ads. */
  ads: MetaReadState<MetaRankRow[]>;
}) {
  if (size === 's') return <StructureSmall model={model} />;
  return (
    <StructureFull
      ads={ads}
      currency={currency}
      model={model}
      onZoom={onZoom}
      zoomedId={zoomedId}
    />
  );
}

function lostText(group: LostGroup): string {
  return `${group.count} ${group.count === 1 ? 'ad set' : 'ad sets'} of ${group.portfolioName} lost${group.since ? ` on ${monthDayEn(group.since)}` : ''}`;
}

function lostLine(model: StructureModel): string | null {
  const lost = model.lost[0];
  return lost ? lostText(lost) : null;
}

function StructureSmall({ model }: { model: StructureModel }) {
  const betaUiText = useBetaTranslations('scale');
  const uiLocale = useLocale();

  const cells = layoutIcicle(model, null, null).filter((cell) => cell.row > 0);
  const lost = lostLine(model);
  return (
    <div className="flex flex-col gap-3">
      {model.managedShare != null ? (
        <Headline
          caption={betaUiText('beta_62c471288ef9')}
          figure={formatShare(model.managedShare)}
          testId={`${TEST_ID}-headline`}
        />
      ) : (
        <Headline
          caption={betaUiText('beta_dc1841789d99', {
            value0: String(model.adsetCount),
          })}
          figure={String(model.campaigns.length)}
          testId={`${TEST_ID}-headline`}
        />
      )}
      <WindowLine testId={TEST_ID} />
      <div
        aria-hidden="true"
        className="relative w-full"
        style={{ height: 2 * SMALL_ROW_HEIGHT + ROW_GAP }}
      >
        {cells.map((cell) => (
          <span
            className="absolute rounded-[3px] border border-card"
            key={cell.node.id}
            style={{
              left: `${cell.x}%`,
              width: `${cell.w}%`,
              top: (cell.row - 1) * (SMALL_ROW_HEIGHT + ROW_GAP),
              height: SMALL_ROW_HEIGHT,
              ...fillOf(cell.node, 'goal', model),
            }}
          />
        ))}
      </div>
      {lost ? (
        <p className="flex items-start gap-1.5 text-xs" data-testid={`${TEST_ID}-lost`}>
          <AlertTriangleIcon
            aria-hidden="true"
            className="mt-0.5 size-3 shrink-0 text-destructive-ink"
          />
          {lost}
        </p>
      ) : null}
    </div>
  );
}

function StructureFull({
  model,
  currency,
  zoomedId,
  onZoom,
  ads,
}: {
  model: StructureModel;
  currency: string | null;
  zoomedId: string | null;
  onZoom: (campaignId: string | null) => void;
  ads: MetaReadState<MetaRankRow[]>;
}) {
  const numberLocale = useNumberLocale();

  const betaUiText = useBetaTranslations('scale');
  const uiLocale = useLocale();

  const reduce = useReducedMotion();
  const [color, setColor] = useState<StructureColor>('goal');
  const host = useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(host, 560);
  const { tip, show, hide } = useChartTip(host);
  const focused = zoomedId
    ? model.campaigns.find((campaign) => campaign.id === zoomedId)
    : undefined;
  const cells = useMemo(
    () => layoutIcicle(model, focused?.id ?? null, ads.status === 'ready' ? ads.data : null),
    [model, focused, ads],
  );
  const words = model.result ? resultWordsUi(model.result.kind, betaUiText) : null;
  const spring = reduce
    ? { duration: 0 }
    : { type: 'spring' as const, visualDuration: 0.5, bounce: 0.12 };
  const held = model.portfolios.filter((portfolio) => portfolio.slot != null);

  // A node keeps its element across zooms, so it glides to its new place instead of being
  // replaced: a campaign is always a button (disabled while it is collapsed), the rest are marks.
  const node = (cell: IcicleCell) => {
    const { node: entity } = cell;
    const wide = (cell.w / 100) * width >= LABEL_MIN_PX;
    const isCampaign = entity.level === 'campaign';
    const zoomIn = isCampaign && !focused;
    const enabled = cell.visible && isCampaign;
    const content = wide ? (
      <>
        <span className="block truncate font-medium text-foreground text-xs">{entity.name}</span>
        <span className="block truncate text-foreground/75 text-xs tabular-nums">
          {figureLine(entity, model, currency, betaUiText, uiLocale)}
        </span>
      </>
    ) : null;
    const tipOf = () => <NodeTip node={entity} model={model} currency={currency} />;
    const common = {
      animate: {
        left: `${cell.x}%`,
        width: `${cell.w}%`,
        top: cell.row * (ROW_HEIGHT + ROW_GAP),
        opacity: cell.visible ? 1 : 0,
      },
      'aria-hidden': cell.visible ? undefined : true,
      className: cn(
        'absolute overflow-hidden rounded-md border-2 border-card px-1.5 py-1 text-left outline-none transition-[background-color] duration-300 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        entity.lost && 'border-muted-foreground/50 border-dashed',
        enabled ? 'cursor-pointer' : 'cursor-default',
        !cell.visible && 'pointer-events-none',
      ),
      'data-level': entity.level,
      'data-lost': entity.lost ? 'true' : undefined,
      'data-testid': `${TEST_ID}-node`,
      exit: { opacity: 0 },
      initial: reduce ? false : { opacity: 0, top: cell.row * (ROW_HEIGHT + ROW_GAP) + 6 },
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (cell.visible) show(event, tipOf());
      },
      onPointerLeave: hide,
      style: { height: ROW_HEIGHT, ...fillOf(entity, color, model) },
      transition: spring,
    };
    if (isCampaign) {
      return (
        <motion.button
          key={entity.id}
          {...common}
          aria-label={
            zoomIn
              ? betaUiText('beta_4937d563e410', { value0: String(entity.name) })
              : betaUiText('beta_f8d6db405654', { value0: String(entity.name) })
          }
          disabled={!enabled}
          onBlur={hide}
          onClick={() => {
            hide();
            onZoom(zoomIn ? entity.id : null);
          }}
          onFocus={(event: FocusEvent<HTMLElement>) => show(event, tipOf())}
          tabIndex={enabled ? 0 : -1}
          type="button"
        >
          {content}
        </motion.button>
      );
    }
    return (
      <motion.div
        key={entity.id}
        {...common}
        aria-label={cell.visible ? entity.name : undefined}
        role={cell.visible ? 'img' : undefined}
      >
        {content}
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {focused ? (
          <nav
            aria-label={betaUiText('beta_658e90e68e9b')}
            className="flex min-w-0 items-center gap-1 text-xs"
          >
            <button
              className="shrink-0 rounded px-1 text-primary-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onZoom(null)}
              type="button"
            >
              {model.root.name}
            </button>
            <ChevronRightIcon
              aria-hidden="true"
              className="size-3 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 truncate font-medium" title={focused.name}>
              {focused.name}
            </span>
          </nav>
        ) : (
          <WindowLine
            detail={`width: spend${currencyColumnSuffix(currency)} · tap a campaign to zoom`}
            testId={TEST_ID}
          />
        )}
        {model.portfolios.some((portfolio) => portfolio.slot != null) ? (
          <ToggleGroup
            aria-label={betaUiText('beta_428fd39706af')}
            onValueChange={(value) => {
              const next: string = value;
              if (next === 'goal' || next === 'portfolio') setColor(next);
            }}
            size="sm"
            type="single"
            value={color}
            variant="outline"
          >
            <ToggleGroupItem className="h-7 px-2 text-xs" value="goal">
              {betaUiText('beta_597a6ce24b62')}
            </ToggleGroupItem>
            <ToggleGroupItem className="h-7 px-2 text-xs" value="portfolio">
              {betaUiText('beta_24221568890f')}
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </div>
      <div
        className="relative w-full overflow-hidden"
        data-testid={`${TEST_ID}-icicle`}
        ref={host}
        style={{ height: 3 * ROW_HEIGHT + 2 * ROW_GAP }}
      >
        <AnimatePresence>{cells.map(node)}</AnimatePresence>
        {focused && ads.status === 'loading' ? (
          <div
            aria-hidden="true"
            className="skeleton-glint absolute inset-x-0 rounded-md"
            data-slot="skeleton"
            style={{ top: 2 * (ROW_HEIGHT + ROW_GAP), height: ROW_HEIGHT }}
          />
        ) : null}
        <ChartTip tip={tip} />
      </div>
      {focused && ads.status === 'error' ? (
        <LensNote testId={`${TEST_ID}-ads-error`}>
          {betaUiText('beta_81388c13f09b')}{' '}
          <button className="text-primary-ink underline" onClick={ads.retry} type="button">
            {betaUiText('beta_942087cc2d41')}
          </button>
        </LensNote>
      ) : null}
      {focused && ads.status === 'ready' && ads.data.length === 0 ? (
        <LensNote>{betaUiText('beta_7442a7b529ed')}</LensNote>
      ) : null}
      <LegendRow>
        {color === 'goal' ? (
          <>
            <LegendItem
              label={
                model.reference
                  ? betaUiText('beta_24c0b49d39b2', {
                      value0: model.reference.kind,
                      value1: formatCurrency(model.reference.value, currency, numberLocale),
                      value2: words?.one ?? betaUiText('metaResultSingle'),
                    })
                  : betaUiText('beta_40dd1aaf25e3')
              }
              variant="ramp"
            />
            <LegendItem
              color={BOARD_COLOR.mid}
              label={betaUiText('beta_fe2d4d48edab', {
                value0: String(words?.many ?? betaUiText('metaResults')),
              })}
            />
          </>
        ) : (
          <>
            {held.map((portfolio) => (
              <LegendItem
                color={PORTFOLIO_SLOT_COLORS[portfolio.slot ?? 0]}
                key={portfolio.id}
                label={portfolio.name}
              />
            ))}
            <LegendItem color={BOARD_COLOR.mid} label={betaUiText('beta_9210f29c9f40')} />
          </>
        )}
        <LegendItem label={betaUiText('beta_8fa5deb8845b')} variant="hatch" />
      </LegendRow>
      {model.lost.map((group) => (
        <p
          className="flex items-start gap-1.5 text-xs"
          data-testid={`${TEST_ID}-lost`}
          key={group.portfolioId}
        >
          <AlertTriangleIcon
            aria-hidden="true"
            className="mt-0.5 size-3 shrink-0 text-destructive-ink"
          />
          <span>
            {lostText(group)}
            {group.unseen.length > 0
              ? betaUiText('beta_57961e87bd07', {
                  value0: String(group.unseen.join(', ')),
                })
              : ''}
          </span>
        </p>
      ))}
      <Takeaway testId={`${TEST_ID}-takeaway`} text={model.takeaway} />
    </div>
  );
}
