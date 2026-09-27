'use client';

import { type DriveQuota, driveQuotaSchema, storageQuotaLevel } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { http } from '@/lib/api/http';
import { cn } from '@/lib/utils';

// The brand's Library storage allowance. Reserved bytes (uploads in flight) count as used,
// matching the Backend's ceiling, so the bar fills the moment an upload starts.

/** Where the allowance is explained and how to raise it — see DriveStorage. */
export const STORAGE_ALLOWANCE_HREF = '/settings/drive#storage';

function formatGb(bytes: number): string {
  return `${Number((bytes / 1e9).toFixed(1))} GB`;
}

export function StorageQuotaMeterView({ quota }: { quota: DriveQuota }) {
  const { level, ratio } = storageQuotaLevel(quota);
  const percent = Math.min(100, Math.round(ratio * 100));
  const heldBytes = quota.usedBytes + quota.reservedBytes;

  return (
    <div data-testid="storage-quota-meter" className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {formatGb(heldBytes)} of {formatGb(quota.capacityBytes)} used
      </p>
      <Progress
        value={percent}
        aria-label="Library storage used"
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
          {level === 'full' ? 'Library full — uploads are paused.' : `Library is ${percent}% full.`}{' '}
          <Link
            data-testid="storage-quota-upgrade"
            href={STORAGE_ALLOWANCE_HREF}
            className="font-medium underline underline-offset-2"
          >
            Upgrade storage
          </Link>
        </p>
      )}
    </div>
  );
}

export function StorageQuotaMeter({ brandId }: { brandId: string }) {
  const quota = useQuery({
    queryKey: ['drive-quota', brandId],
    queryFn: () =>
      http.request<DriveQuota>({
        path: `/drive/v1/quota?brandId=${encodeURIComponent(brandId)}`,
        schema: driveQuotaSchema,
      }),
    retry: false,
  });

  return quota.data ? <StorageQuotaMeterView quota={quota.data} /> : null;
}
