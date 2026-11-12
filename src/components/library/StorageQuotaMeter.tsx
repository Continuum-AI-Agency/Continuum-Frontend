'use client';

import { type DriveQuota, driveQuotaSchema, storageQuotaLevel } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { Progress } from '@/components/ui/progress';
import type { UiLocale } from '@/i18n/config';
import { Link } from '@/i18n/navigation';
import { http } from '@/lib/api/http';
import { cn } from '@/lib/utils';

// The brand's Library storage allowance. Reserved bytes (uploads in flight) count as used,
// matching the Backend's ceiling, so the bar fills the moment an upload starts.

/** Where the allowance is explained and how to raise it — see DriveBrands. */
export const STORAGE_ALLOWANCE_HREF = '/settings/drive#storage';

export function formatGb(bytes: number, locale: UiLocale = 'en'): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: false }).format(Number((bytes / 1e9).toFixed(1)))} GB`;
}

/** `onUpgrade` lets a page that already holds the allowance explainer open it in place. */
export function StorageQuotaMeterView({
  quota,
  onUpgrade,
}: {
  quota: DriveQuota;
  onUpgrade?: () => void;
}) {
  const translateUi = useUiTranslations('library');
  const locale = useUiLocale();

  const { level, ratio } = storageQuotaLevel(quota);
  const percent = Math.min(100, Math.round(ratio * 100));
  const heldBytes = quota.usedBytes + quota.reservedBytes;

  return (
    <div data-testid="storage-quota-meter" className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {formatGb(heldBytes, locale)} {translateUi('of_28391d3b')}{' '}
        {formatGb(quota.capacityBytes, locale)} {translateUi('used_f8391613')}{' '}
      </p>
      <Progress
        value={percent}
        aria-label={translateUi('library_storage_used_65d1e45f')}
        className={cn(
          'h-1.5',
          level === 'warn' && '[&_[data-slot=progress-indicator]]:bg-warning',
          level === 'full' && '[&_[data-slot=progress-indicator]]:bg-destructive',
        )}
      />
      {level === 'ok' ? null : (
        <p
          data-testid="storage-quota-warning"
          role={level === 'full' ? 'alert' : 'status'}
          className={cn('text-xs', level === 'full' ? 'text-destructive' : 'text-warning')}
        >
          {level === 'full'
            ? translateUi('library_full_uploads_are_paused_762d8852')
            : translateUi('library_is_value0_full_c82d3da0', {
                value0: String(percent),
              })}{' '}
          <Link
            data-testid="storage-quota-upgrade"
            href={STORAGE_ALLOWANCE_HREF}
            onClick={onUpgrade}
            className="font-medium underline underline-offset-2"
          >
            {' '}
            {translateUi('upgrade_storage_7def8745')}{' '}
          </Link>
        </p>
      )}
    </div>
  );
}

export function useDriveQuota(brandId: string) {
  return useQuery({
    queryKey: ['drive-quota', brandId],
    queryFn: () =>
      http.request<DriveQuota>({
        path: `/drive/v1/quota?brandId=${encodeURIComponent(brandId)}`,
        schema: driveQuotaSchema,
      }),
    retry: false,
  });
}

export function StorageQuotaMeter({ brandId }: { brandId: string }) {
  const quota = useDriveQuota(brandId);
  return quota.data ? <StorageQuotaMeterView quota={quota.data} /> : null;
}
