'use client';

import type { OrganicWinner, PromoteOrganicWinnerResponse } from '@continuum/contracts';
// "Run as ad" from the Home, on the existing promote route (POST /api/organic/winners/promote via
// usePromoteWinner): the ORIGINAL post goes into the chosen ad set as a PAUSED ad. Nothing goes
// live. Variations stay with the full winners table on the Organic page; the Home makes only the
// ad. The Organic page's own dialog (OrganicWinnersSection) is not exported, hence this compact
// one over the same two hooks.
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Spinner } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePromoteWinner, usePromotionAdsets } from '@/hooks/useOrganicWinners';

function resultLine(
  ad: PromoteOrganicWinnerResponse['ad'],
  uiText: ReturnType<typeof useTranslations<'dashboard'>>,
): string {
  switch (ad.status) {
    case 'created':
      return uiText('paused_ad_created_adid_turn_it_on_in_ads_mana_154374f', { adId: ad.adId });
    case 'already_promoted':
      return uiText('this_post_already_runs_as_an_ad_no_second_ad__e79603c');
    case 'ineligible':
    case 'refused':
      return ad.reason;
  }
}

export function PromoteWinnerDialog({
  brandId,
  winner,
  onClose,
}: {
  brandId: string;
  winner: OrganicWinner;
  onClose: () => void;
}) {
  const uiText = useTranslations('dashboard');
  const adsets = usePromotionAdsets(brandId, true);
  const promote = usePromoteWinner(brandId);
  const [adsetId, setAdsetId] = useState('');
  const refused = adsets.data?.refused;
  const done = Boolean(promote.data) || Boolean(refused);

  return (
    <Dialog onOpenChange={(open) => (open ? null : onClose())} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{uiText('run_this_post_as_a_paused_ad_25d956a')}</DialogTitle>
          <DialogDescription>
            {uiText('the_original_post_runs_in_the_ad_set_you_choo_3de92fa')}
          </DialogDescription>
        </DialogHeader>

        {promote.data ? (
          <p className="text-sm" data-testid="flywheel-promote-result">
            {resultLine(promote.data.ad, uiText)}
          </p>
        ) : adsets.isLoading ? (
          <p className="flex items-center gap-2 text-muted-foreground text-xs">
            <Spinner aria-hidden="true" className="size-3 animate-spin" />{' '}
            {uiText('loading_ad_sets_6efe89e')}
          </p>
        ) : refused ? (
          <p className="text-muted-foreground text-sm">
            {uiText('this_brand_is_connected_with_instagram_only_c_b6c2d4c')}
          </p>
        ) : (
          <div className="space-y-1.5">
            <label
              className="font-semibold text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="flywheel-promote-adset"
            >
              {uiText('ad_set_639a64f')}
            </label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              id="flywheel-promote-adset"
              onChange={(event) => setAdsetId(event.target.value)}
              value={adsetId}
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
              <span className="block text-destructive text-xs">
                {uiText('could_not_load_ad_sets_from_meta_try_again_in_678dae1')}
              </span>
            ) : null}
            {promote.isError ? (
              <span className="block text-destructive text-xs">{promote.error?.message}</span>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={onClose}>{uiText('done_11a6767')}</Button>
          ) : (
            <Button
              disabled={!adsetId || promote.isPending}
              onClick={() =>
                promote.mutate({ mediaId: winner.mediaId, adsetId, makeVariations: false })
              }
            >
              {promote.isPending ? (
                <Spinner aria-hidden="true" className="size-3 animate-spin" />
              ) : null}
              {uiText('create_paused_ad_fc58d2d')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
