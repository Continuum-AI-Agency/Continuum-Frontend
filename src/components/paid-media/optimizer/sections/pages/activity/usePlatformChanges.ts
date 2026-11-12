'use client';

// The changes the charted account's own change history saw, made outside Continuum: a person in
// Google Ads, Google's recommendations applying themselves, an automated rule. It is the same read
// (and the same cache entry) as the Google tab's recent changes. The API channel is left out:
// Continuum writes through it, and those writes are already listed with their undo. Meta keeps no
// change history this app reads, so a Meta account adds nothing here.

import { useLocale, useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { useMemo } from 'react';
import { changeHistoryWindow, changeLine } from '../../google/campaignExplorerModel';
import { useGoogleChangeHistory } from '../../google/googleReads';
import { type ActivityDay, dayKeyOf, type PlatformChange } from './activityModel';
import type { ChartAccount } from './useActivitySpend';

/** Continuum's own channel into Google Ads. */
const CONTINUUM_CHANNEL = 'GOOGLE_ADS_API';

export type PlatformChangesRead = {
  changes: PlatformChange[];
  failed: boolean;
  /** The platform cut its answer short (Google's row limit): some changes are unread. */
  truncated: boolean;
};

export function usePlatformChanges({
  brandId,
  account,
  days,
}: {
  brandId: string;
  account: ChartAccount | null;
  days: readonly ActivityDay[];
}): PlatformChangesRead {
  const t = useTranslations('scale');
  const locale = useLocale() as UiLocale;
  const range = useMemo(() => changeHistoryWindow(), []);
  const history = useGoogleChangeHistory({
    brandId,
    customerId: account?.platform === 'google_ads' ? account.id : '',
    window: range,
  });
  const changes = useMemo(() => {
    if (!history.data) return [];
    const inWindow = new Set(days.map((day) => day.key));
    return history.data.changes.flatMap((change): PlatformChange[] => {
      const day = dayKeyOf(change.at);
      if (change.clientType === CONTINUUM_CHANNEL || !day || !inWindow.has(day)) return [];
      return [changeLine(change, t, locale)];
    });
  }, [history.data, days, t, locale]);
  return {
    changes,
    failed: history.isError,
    truncated: history.data?.coverage.truncated === true,
  };
}
