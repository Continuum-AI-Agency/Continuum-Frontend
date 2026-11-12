'use client';
import type {UiLocale} from '@/i18n/config';
import {useLocale} from 'next-intl';

import { useTranslations } from 'next-intl';

import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { cn } from '@/lib/utils';

import type { RotationEvent } from './types';

type AdSummary = {
  name: string;
  imageUrl: string | null;
  adSetName?: string | null;
  status?: string | null;
};

type CreativeSheetSummaryProps = {
  ad: AdSummary;
  latestSwap: RotationEvent | null;
  rotationCount: number;
  className?: string;
};

function formatOccurredAt(iso: string, uiLocale:UiLocale='en'): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString(uiLocale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function CreativeSheetSummary({
  ad,
  latestSwap,
  rotationCount,
  className,
}: CreativeSheetSummaryProps) {
const uiLocale=useLocale();
  const uiText = useTranslations('scale');
  return (
    <div className={cn('flex gap-3', className)}>
      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted/50">
        {ad.imageUrl ? (
          <ChatMediaThumb
            media={{ id: ad.name, url: ad.imageUrl, kind: 'image', name: ad.name }}
            fallbackSeed={ad.name}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xs text-muted-foreground">
            {uiText('no_preview_4b8bacd')}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{ad.name}</div>
        {ad.adSetName ? (
          <div className="truncate text-xs text-muted-foreground">{ad.adSetName}</div>
        ) : null}
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{uiText.rich('sentence_9c1c946410f0', { count: rotationCount })}</span>
          {latestSwap ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {uiText.rich('sentence_2cdaaa2e0070', {
                  v0: formatOccurredAt(latestSwap.occurredAt, uiLocale),
                })}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
