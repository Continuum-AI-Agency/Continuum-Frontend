'use client';

import type { MeteredUsageView } from '@continuum/billing-ui';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { formatShortDate } from './billingFormat';

type MeteredCreditsCardProps = {
  usage: MeteredUsageView;
  busy?: boolean;
  onBuyCredits: () => void;
};

export function MeteredCreditsCard({ usage, busy, onBuyCredits }: MeteredCreditsCardProps) {
  const bar = Math.min(100, Math.max(0, usage.utilizationPercent));
  const low =
    usage.health === 'low' ||
    usage.health === 'depleted' ||
    usage.health === 'unfunded' ||
    usage.creditsAvailable === 0;

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/60 bg-muted/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              AI Studio credits
            </CardTitle>
            <CardDescription>
              Usage-based generation fuel. Buy packs here; deterministic edits stay free.
            </CardDescription>
          </div>
          <Badge variant={low ? 'destructive' : 'secondary'}>{usage.healthLabel}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Left now" value={String(usage.creditsAvailable)} emphasize />
          <Stat label="Used 7d" value={String(usage.spent7Days)} />
          <Stat label="Used 30d" value={String(usage.spent30Days)} />
          <Stat
            label="Expiring soon"
            value={String(usage.creditsExpiringWithin30Days)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span>Balance vs starter pack ({usage.monthlyPackHint})</span>
            <span className="font-mono tabular-nums">{bar}%</span>
          </div>
          <Progress value={bar} className="h-2" aria-label="Credit balance relative to starter pack" />
          <p className="text-xs text-muted-foreground">
            {usage.nextExpirationAt
              ? `Next expiration ${formatShortDate(usage.nextExpirationAt)}`
              : 'No near-term expirations'}
            {usage.lastSpendAt ? ` · Last spend ${formatShortDate(usage.lastSpendAt)}` : ''}
          </p>
        </div>

        <Separator />

        <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Credits apply to model-backed Studio work (image, video, generative edit). Layout,
          crop, Library attach, and non-model exports do not spend credits.
        </div>
      </CardContent>

      <CardFooter className="justify-end gap-2 border-t border-border/60 bg-muted/10">
        <Button type="button" disabled={busy} onClick={onBuyCredits} className="gap-1.5">
          <Sparkles className="size-3.5" aria-hidden />
          Buy credits
        </Button>
      </CardFooter>
    </Card>
  );
}

function Stat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          emphasize
            ? 'mt-1 text-2xl font-semibold tabular-nums tracking-tight'
            : 'mt-1 text-lg font-semibold tabular-nums tracking-tight'
        }
      >
        {value}
      </p>
    </div>
  );
}
