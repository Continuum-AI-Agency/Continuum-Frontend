'use client';

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

const times = (value: number | null) => (value == null ? '—' : `${value.toFixed(1)}×`);

function adStatusLine(ad: PromoteOrganicWinnerResponse['ad']): string {
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

function variationsStatusLine(
  variations: PromoteOrganicWinnerResponse['variations'],
): string | null {
  switch (variations.status) {
    case 'not_requested':
      return null;
    case 'queued':
      return variations.publishesToMeta
        ? 'Variations queued. Approve them in the Optimizer to publish beside this ad set’s ads.'
        : 'Variations queued. This ad set has no synced ad to publish beside, so they land in the Library.';
    case 'failed':
      return variations.reason;
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
            Run this post as an ad
          </DialogTitle>
          <DialogDescription>
            The original post runs as a paused ad in the ad set you choose, likes and comments
            included. Nothing goes live until you turn it on.
          </DialogDescription>
        </DialogHeader>

        {promote.data ? (
          <div className="space-y-2 text-sm" data-testid="organic-winner-promote-result">
            <p>{adStatusLine(promote.data.ad)}</p>
            {variationsStatusLine(promote.data.variations) ? (
              <p className="text-muted-foreground">
                {variationsStatusLine(promote.data.variations)}
              </p>
            ) : null}
          </div>
        ) : adsets.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Loading ad sets…
          </div>
        ) : refused ? (
          <p className="text-sm text-muted-foreground">
            This brand is connected with Instagram only. Connect with Facebook to run posts as ads.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="organic-winner-adset"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Ad set
              </label>
              <select
                id="organic-winner-adset"
                value={adsetId}
                onChange={(event) => setAdsetId(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Choose an ad set…</option>
                {(adsets.data?.adsets ?? []).map((adset) => (
                  <option key={adset.id} value={adset.id}>
                    {adset.campaignName ? `${adset.campaignName} · ` : ''}
                    {adset.name} ({adset.status.toLowerCase()})
                  </option>
                ))}
              </select>
              {adsets.isError ? (
                <span className="block text-xs text-destructive">
                  Could not load ad sets from Meta. Try again in a moment.
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
                Also make variations
                <span className="block text-xs text-muted-foreground">
                  New creatives built from this post’s hook, format and numbers, queued in the
                  Optimizer for your approval.
                </span>
              </label>
            </div>
            {promote.isError ? (
              <p className="text-xs text-destructive">{promote.error.message}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {promote.data || refused ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <Button
              disabled={!adsetId || promote.isPending}
              onClick={() => promote.mutate({ mediaId: winner.mediaId, adsetId, makeVariations })}
            >
              {promote.isPending ? (
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              ) : null}
              Create paused ad
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WinnerRow({ winner, onPromote }: { winner: OrganicWinner; onPromote: () => void }) {
  const running = winner.promotion !== null;
  const title =
    winner.hookText ?? `${MEDIA_LABEL[winner.mediaType ?? ''] ?? 'Post'} ${winner.mediaId}`;
  return (
    <tr className="border-t border-subtle" data-testid="organic-winner-row">
      <td className="py-2 pr-3 text-xs text-muted-foreground">
        {MEDIA_LABEL[winner.mediaType ?? ''] ?? 'Post'}
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
      <td className="py-2 pr-3 text-right tabular-nums">{times(winner.engagementRateLift)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{times(winner.reachLift)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {winner.hookRate == null ? '—' : `${Math.round(winner.hookRate)}%`}
      </td>
      <td className="py-2 text-right">
        {running ? (
          <span className="text-xs text-muted-foreground">
            Running as ad
            {winner.variationJobs.length > 0
              ? ` · ${winner.variationJobs.length} variation jobs`
              : ''}
          </span>
        ) : (
          <Button size="sm" variant="outline" onClick={onPromote}>
            Run as ad
          </Button>
        )}
      </td>
    </tr>
  );
}

export function OrganicWinnersSection({ brandId }: { brandId?: string }) {
  const winners = useOrganicWinners(brandId);
  const [promoting, setPromoting] = React.useState<OrganicWinner | null>(null);

  if (!brandId || !winners.data || winners.data.winners.length === 0) return null;
  const { thresholds, windowDays } = winners.data;

  return (
    <div className="rounded-lg border border-subtle bg-surface" data-testid="organic-winners">
      <div className="px-4 py-3">
        <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Megaphone className="size-4 shrink-0 text-primary" aria-hidden="true" />
          Winners to run as ads
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Your posts from the last {windowDays} days at {thresholds.engagementRateLift}× their
          account’s median engagement rate or {thresholds.reachLift}× its median reach
        </span>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-1.5 font-semibold">Type</th>
              <th className="pb-1.5 font-semibold">Post</th>
              <th className="pb-1.5 text-right font-semibold">Engagement</th>
              <th className="pb-1.5 text-right font-semibold">Reach</th>
              <th className="pb-1.5 text-right font-semibold">Hook rate</th>
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
