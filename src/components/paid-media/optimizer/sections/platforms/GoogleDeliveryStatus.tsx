'use client';
import { useTranslations as useBetaTranslations, useLocale } from 'next-intl';

// The first thing the Google tab says when Google shows no ad in the whole account: suspended or
// not delivering, since when, and the one place it is fixed. Absent otherwise — a block that
// fires every day is a block people learn to scroll past. The words are googleDeliveryStatusOf's.

import type { AccountCandidate } from '@continuum/contracts';
import { AlertTriangleIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as typeScale from '../../typeScale';
import { googleDeliveryStatusOf } from './googleDeliveryStatusModel';

export function GoogleDeliveryStatus({ cards }: { cards: readonly AccountCandidate[] }) {
  const betaUiText = useBetaTranslations('scale');

  const locale = useLocale();
  const status = googleDeliveryStatusOf(cards, betaUiText, locale);
  if (!status) return null;
  return (
    <section
      aria-label={betaUiText('beta_2d8453cb55b4')}
      className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3"
      data-testid="google-delivery-status"
      data-tone={status.tone}
      role="status"
    >
      <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn(typeScale.bodyLg, 'font-semibold text-foreground')}>{status.title}</p>
        <p className="text-muted-foreground text-sm">{status.detail}</p>
      </div>
      <a
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0')}
        href={status.href}
        rel="noreferrer"
        target="_blank"
      >
        {betaUiText('beta_013124925a61')}
      </a>
    </section>
  );
}
