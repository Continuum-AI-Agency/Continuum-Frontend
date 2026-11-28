'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { useUiErrorMessage } from '@/i18n/errors';
import { formatDecimal } from '@/lib/format/decimal';

// Organic winners: the brand's own posts that beat their account's median — engagement rate ×2
// or reach ×3 — each one a candidate to run as an ad. "Run as ad" puts the ORIGINAL post into a
// chosen ad set PAUSED (its likes and comments come with it) and can also queue variations of it
// into the Optimizer's creative queue. Nothing here goes live; activation stays in Ads Manager or
// the Optimizer.

import type { OrganicWinner, PromoteOrganicWinnerResponse } from '@continuum/contracts';
import { Loader2, Megaphone } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOrganicWinners, usePromoteWinner, usePromotionAdsets } from '@/hooks/useOrganicWinners';

const MEDIA_LABEL: Record<string, string> = {
  VIDEO: 'Reel',
  IMAGE: 'Image',
  CAROUSEL_ALBUM: 'Carousel',
};

const times = (value: number | null, locale: UiLocale) =>
  value == null ? '—' : `${formatDecimal(value, 1, locale)}×`;

function adStatusLine(
  ad: PromoteOrganicWinnerResponse['ad'],
  translate: ReturnType<typeof useTranslations<'organic'>>,
): string {
  switch (ad.status) {
    case 'created':
      return translate('promotionAdCreated', { id: ad.adId });
    case 'already_promoted':
      return translate('promotionAlreadyRuns');
    case 'ineligible':
      return translate('promotionIneligible');
    case 'refused':
      return translate('promotionRefused');
  }
}

function variationsStatusLine(
  variations: PromoteOrganicWinnerResponse['variations'],
  translate: ReturnType<typeof useTranslations<'organic'>>,
): string | null {
  switch (variations.status) {
    case 'not_requested':
      return null;
    case 'queued':
      return variations.publishesToMeta
        ? translate('promotionVariationsQueued')
        : translate('promotionVariationsLibrary');
    case 'failed':
      return translate('promotionVariationsFailed');
  }
}

function PromoteDialog({
  brandId,
  winner,
  onClose,
}: {
  brandId: string;
  winner: OrganicWinner;
  onClose: () => void;
}) {
  const uiText = useTranslations('organic');
  const formatUiError = useUiErrorMessage();
  const adsets = usePromotionAdsets(brandId, true);
  const promote = usePromoteWinner(brandId);
  const [adsetId, setAdsetId] = React.useState('');
  const [makeVariations, setMakeVariations] = React.useState(true);
  const refused = adsets.data?.refused;

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-primary" aria-hidden="true" />
            {uiText('run_this_post_as_an_ad_346946e')}
          </DialogTitle>
          <DialogDescription>
            {uiText('the_original_post_runs_as_a_paused_ad_in_the__20012a3')}
          </DialogDescription>
        </DialogHeader>

        {promote.data ? (
          <div className="space-y-2 text-sm" data-testid="organic-winner-promote-result">
            <p>{adStatusLine(promote.data.ad, uiText)}</p>
            {variationsStatusLine(promote.data.variations, uiText) ? (
              <p className="text-muted-foreground">
                {variationsStatusLine(promote.data.variations, uiText)}
              </p>
            ) : null}
          </div>
        ) : adsets.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {uiText('loading_ad_sets_6efe89e')}
          </div>
        ) : refused ? (
          <p className="text-sm text-muted-foreground">
            {uiText('this_brand_is_connected_with_instagram_only_c_b6c2d4c')}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="organic-winner-adset"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {uiText('ad_set_639a64f')}
              </label>
              <select
                id="organic-winner-adset"
                value={adsetId}
                onChange={(event) => setAdsetId(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{uiText('choose_an_ad_set_337ee51')}</option>
                {(adsets.data?.adsets ?? []).map((adset) => (
                  <option key={adset.id} value={adset.id}>
                    {adset.campaignName ? `${adset.campaignName} · ` : ''}
                    {adset.name} ({adset.status.toLowerCase()})
                  </option>
                ))}
              </select>
              {adsets.isError ? (
                <span className="block text-xs text-destructive">
                  {uiText('could_not_load_ad_sets_from_meta_try_again_in_678dae1')}
                </span>
              ) : null}
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Checkbox
                id="organic-winner-variations"
                checked={makeVariations}
                onCheckedChange={(checked) => setMakeVariations(checked === true)}
                className="mt-0.5"
              />
              <label htmlFor="organic-winner-variations">
                {uiText('alsoMakeVariations')}
                <span className="block text-xs text-muted-foreground">
                  {uiText('new_creatives_built_from_this_post_s_hook_for_cba2acd')}
                </span>
              </label>
            </div>
            {promote.isError ? (
              <p className="text-xs text-destructive">{formatUiError(promote.error)}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {promote.data || refused ? (
            <Button onClick={onClose}>{uiText('done_11a6767')}</Button>
          ) : (
            <Button
              disabled={!adsetId || promote.isPending}
              onClick={() => promote.mutate({ mediaId: winner.mediaId, adsetId, makeVariations })}
            >
              {uiText.rich('sentence_7b7ec520d080', {
                v0: () =>
                  promote.isPending ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  ) : null,
              })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WinnerRow({ winner, onPromote }: { winner: OrganicWinner; onPromote: () => void }) {
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
  const running = winner.promotion !== null;
  const title =
    winner.hookText ??
    `${uiText('contentKindLabel', { kind: (winner.mediaType ?? '').toLowerCase() })} ${winner.mediaId}`;
  return (
    <tr className="border-t border-subtle" data-testid="organic-winner-row">
      <td className="py-2 pr-3 text-xs text-muted-foreground">
        {uiText('contentKindLabel', { kind: (winner.mediaType ?? '').toLowerCase() })}
        {winner.trial ? (
          <span
            className="block text-2xs font-medium text-primary"
            title={winner.trial.verdict?.reason}
          >
            {uiText('trial_winner_5bea711')}
          </span>
        ) : null}
      </td>
      <td className="max-w-80 py-2 pr-3">
        {winner.permalink ? (
          <a
            href={winner.permalink}
            target="_blank"
            rel="noreferrer"
            className="block truncate hover:underline"
          >
            {title}
          </a>
        ) : (
          <span className="block truncate">{title}</span>
        )}
        {winner.contentFormat ? (
          <span className="text-2xs text-muted-foreground">
            {winner.contentFormat.replace(/_/g, ' ')}
          </span>
        ) : null}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {times(winner.engagementRateLift, uiLocale)}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{times(winner.reachLift, uiLocale)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {winner.hookRate == null ? '—' : `${Math.round(winner.hookRate)}%`}
      </td>
      <td className="py-2 text-right">
        {running ? (
          <span className="text-xs text-muted-foreground">
            {uiText.rich('sentence_f77f2229c83a', {
              hasVariations: winner.variationJobs.length > 0 ? 'yes' : 'no',
              count: winner.variationJobs.length,
            })}
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={onPromote}>
            {uiText('run_as_ad_848d175')}
          </Button>
        )}
      </td>
    </tr>
  );
}

export function OrganicWinnersSection({ brandId }: { brandId?: string }) {
  const uiText = useTranslations('organic');
  const winners = useOrganicWinners(brandId);
  const [promoting, setPromoting] = React.useState<OrganicWinner | null>(null);

  if (!brandId || !winners.data || winners.data.winners.length === 0) return null;
  const { thresholds, windowDays } = winners.data;

  return (
    <div className="rounded-lg border border-subtle bg-surface" data-testid="organic-winners">
      <div className="px-4 py-3">
        <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Megaphone className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {uiText('winners_to_run_as_ads_4e67ea4')}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {uiText.rich('sentence_6301c8d38cd3', {
            days: windowDays,
            engagement: thresholds.engagementRateLift,
            reach: thresholds.reachLift,
          })}
        </span>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-1.5 font-semibold">{uiText('type_baaddf7')}</th>
              <th className="pb-1.5 font-semibold">{uiText('post_a555462')}</th>
              <th className="pb-1.5 text-right font-semibold">{uiText('engagement_ea68771')}</th>
              <th className="pb-1.5 text-right font-semibold">{uiText('reach_2068b81')}</th>
              <th className="pb-1.5 text-right font-semibold">{uiText('hook_rate_bd1de47')}</th>
              <th className="pb-1.5" />
            </tr>
          </thead>
          <tbody>
            {winners.data.winners.map((winner) => (
              <WinnerRow
                key={winner.mediaId}
                winner={winner}
                onPromote={() => setPromoting(winner)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {promoting ? (
        <PromoteDialog brandId={brandId} winner={promoting} onClose={() => setPromoting(null)} />
      ) : null}
    </div>
  );
}
