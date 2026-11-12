'use client';

// "Run as ad" from the Home, on the existing promote route (POST /api/organic/winners/promote via
// usePromoteWinner): the ORIGINAL post goes into the chosen ad set as a PAUSED ad. Nothing goes
// live. Variations stay with the full winners table on the Organic page; the Home makes only the
// ad. The Organic page's own dialog (OrganicWinnersSection) is not exported, hence this compact
// one over the same two hooks.
import type { OrganicWinner, PromoteOrganicWinnerResponse } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useTranslations as useBetaTranslations } from 'next-intl';
import { useState } from 'react';
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

function resultLine(ad: PromoteOrganicWinnerResponse['ad']): string {
  switch (ad.status) {
    case 'created':
      return `Paused ad created (${ad.adId}). Turn it on in Ads Manager or the Optimizer.`;
    case 'already_promoted':
      return 'This post already runs as an ad — no second ad was made.';
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
  const betaUiText = useBetaTranslations('dashboard');

  const adsets = usePromotionAdsets(brandId, true);
  const promote = usePromoteWinner(brandId);
  const [adsetId, setAdsetId] = useState('');
  const refused = adsets.data?.refused;
  const done = Boolean(promote.data) || Boolean(refused);

  return (
    <Dialog onOpenChange={(open) => (open ? null : onClose())} open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{betaUiText('beta_25d956a86e8c')}</DialogTitle>
          <DialogDescription>{betaUiText('beta_3de92facc9e0')}</DialogDescription>
        </DialogHeader>

        {promote.data ? (
          <p className="text-sm" data-testid="flywheel-promote-result">
            {resultLine(promote.data.ad)}
          </p>
        ) : adsets.isLoading ? (
          <p className="flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 aria-hidden="true" className="size-3 animate-spin" />{' '}
            {betaUiText('beta_6efe89e5d13a')}
          </p>
        ) : refused ? (
          <p className="text-muted-foreground text-sm">{betaUiText('beta_b6c2d4c79171')}</p>
        ) : (
          <div className="space-y-1.5">
            <label
              className="font-semibold text-muted-foreground text-xs uppercase tracking-wide"
              htmlFor="flywheel-promote-adset"
            >
              {betaUiText('beta_639a64f7a788')}
            </label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              id="flywheel-promote-adset"
              onChange={(event) => setAdsetId(event.target.value)}
              value={adsetId}
            >
              <option value="">{betaUiText('beta_337ee5150f48')}</option>
              {(adsets.data?.adsets ?? []).map((adset) => (
                <option key={adset.id} value={adset.id}>
                  {adset.campaignName ? `${adset.campaignName} · ` : ''}
                  {adset.name} ({adset.status.toLowerCase()})
                </option>
              ))}
            </select>
            {adsets.isError ? (
              <span className="block text-destructive text-xs">
                {betaUiText('beta_678dae1524d5')}
              </span>
            ) : null}
            {promote.isError ? (
              <span className="block text-destructive text-xs">{promote.error?.message}</span>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button onClick={onClose}>{betaUiText('beta_11a6767d5674')}</Button>
          ) : (
            <Button
              disabled={!adsetId || promote.isPending}
              onClick={() =>
                promote.mutate({
                  mediaId: winner.mediaId,
                  adsetId,
                  makeVariations: false,
                })
              }
            >
              {promote.isPending ? (
                <Loader2 aria-hidden="true" className="size-3 animate-spin" />
              ) : null}
              {betaUiText('beta_fc58d2da14d1')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
