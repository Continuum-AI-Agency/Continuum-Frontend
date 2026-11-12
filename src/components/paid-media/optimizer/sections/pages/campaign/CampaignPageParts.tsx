'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The campaign page's header (G11): what kind of campaign it is, whether it serves, its budget
// and the portfolio it answers to; its figures as tiles, each written; and, for a campaign that
// serves on Search, where its auctions went as one thin bar with every share written beside it.

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { HeroFigure } from '../../../components/HeroFigure';
import { formatCurrency } from '../../../format';
import { statusWords } from '../../google/CampaignExplorer';
import type { CampaignView } from '../../google/campaignExplorerModel';
import { BandText, FigureText, Missing } from '../../google/GoogleSection';
import {
  type AuctionSlice,
  campaignKind,
  KIND_COLOR,
  type KpiTile,
  kindLabel,
  shareText,
} from './campaignPageModel';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** The type as a quiet chip: its board colour on a dot, the words in the foreground. */
export function CampaignTypeChip({ channelType }: { channelType: string | null }) {
  const kind = campaignKind(channelType);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium text-foreground text-xs"
      data-kind={kind}
      data-testid="campaign-type-chip"
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ background: KIND_COLOR[kind] }}
      />
      {kindLabel(kind)}
    </span>
  );
}

export function CampaignHeader({
  campaign,
  currency,
}: {
  campaign: CampaignView;
  currency: string | null;
}) {
  const betaUiText = useBetaTranslations('scale');

  const status = statusWords(campaign.status);
  const serving = campaign.status.value === 'ENABLED';
  return (
    <div className="space-y-2" data-testid="campaign-header">
      <div className="flex flex-wrap items-center gap-2">
        <CampaignTypeChip channelType={campaign.channelType} />
        {status ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-xs',
              serving ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
            )}
            data-testid="campaign-status"
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 rounded-full',
                serving ? 'bg-success' : 'bg-muted-foreground',
              )}
            />
            {status}
          </span>
        ) : null}
        <span className="ml-auto font-mono text-muted-foreground text-xs tabular-nums">
          <FigureText
            figure={campaign.budgetPerDay}
            format={(value) => `${formatCurrency(value, currency)} / day`}
          />
        </span>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
        {campaign.goal ? (
          <>
            <span data-testid="campaign-portfolio">{campaign.goal.portfolioName}</span>
            <BandText band={campaign.band} />
          </>
        ) : (
          <span data-testid="campaign-portfolio">{betaUiText('beta_9210f29c9f40')}</span>
        )}
      </p>
    </div>
  );
}

/** The figures a campaign of this type is read by, two to a row, each written. */
export function CampaignKpiTiles({ tiles }: { tiles: readonly KpiTile[] }) {
  const reduce = useReducedMotion();
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3" data-testid="campaign-kpis">
      {tiles.map((tile, index) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="min-w-0"
          data-kpi={tile.key}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          key={tile.key}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: index * 0.04 }}
        >
          <dt className="text-muted-foreground text-xs">{tile.label}</dt>
          <dd className="truncate">
            {tile.figure.reason === null ? (
              <HeroFigure kind="tile">{tile.figure.value}</HeroFigure>
            ) : (
              <Missing reason={tile.figure.reason} />
            )}
          </dd>
        </motion.div>
      ))}
    </dl>
  );
}

/** Where the Search auctions went, as one bar with each share written in the legend. */
export function AuctionShareBar({ slices }: { slices: readonly AuctionSlice[] }) {
  const betaUiText = useBetaTranslations('scale');

  const reduce = useReducedMotion();
  return (
    <section className="space-y-1.5" data-testid="campaign-auction">
      <h4 className="font-semibold text-foreground text-xs">{betaUiText('beta_994c8bd5c2bd')}</h4>
      <div
        aria-label={slices.map((slice) => `${slice.label} ${shareText(slice.share)}`).join(', ')}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
      >
        {slices.map((slice, index) => (
          <motion.span
            animate={{ scaleX: 1 }}
            className="block h-full origin-left"
            data-slice={slice.key}
            initial={reduce ? false : { scaleX: 0 }}
            key={slice.key}
            style={{
              width: `${Math.max(0, slice.share) * 100}%`,
              background: slice.color,
              opacity: slice.key === 'unread' ? 0.5 : 1,
            }}
            transition={{
              duration: 0.6,
              ease: EASE_OUT,
              delay: 0.1 + index * 0.06,
            }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
        {slices.map((slice) => (
          <li className="inline-flex items-center gap-1.5" key={slice.key}>
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: slice.color }}
            />
            {slice.label}{' '}
            <span className="font-medium text-foreground tabular-nums">
              {shareText(slice.share)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
