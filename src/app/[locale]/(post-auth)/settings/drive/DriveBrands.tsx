'use client';
import { useTranslations } from 'next-intl';

// Settings → Drive "Brand drives": each brand's storage, free space and mount location at a
// glance in one SettingsRowList; a row opens to its full numbers and copyable locations.

import {
  type DriveQuota,
  type DriveWhoami,
  driveWhoamiSchema,
  storageQuotaLevel,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  formatGb,
  StorageQuotaMeterView,
  useDriveQuota,
} from '@/components/library/StorageQuotaMeter';
import {
  SettingsInfoHint,
  SettingsRow,
  SettingsRowList,
} from '@/components/settings/shell/SettingsRowList';
import { SettingsSection } from '@/components/settings/shell/SettingsSection';
import { buttonVariants } from '@/components/ui/button';
import { getApiBaseUrl } from '@/lib/api/config';
import { http } from '@/lib/api/http';
import { billingHref } from '@/lib/billing/productAccess';
import { cn } from '@/lib/utils';
import { CopyButton, DriveConnectSteps } from './DriveSections';

type DriveBrand = DriveWhoami['brands'][number];

/** Decimal units, matching the meter's GB, so a 40 MB brand does not read "0 GB". */
function formatStorage(bytes: number): string {
  return bytes >= 1e9 ? formatGb(bytes) : `${Math.round(bytes / 1e6)} MB`;
}

// Brand · storage meter · free · mount location · open — the at-a-glance columns of each row.
const DRIVE_COLUMNS = ['Brand', 'Storage', 'Free', 'Mount URL', ''] as const;
const DRIVE_GRID =
  'grid-cols-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_8.5rem]';

export function DriveBrands({ email }: { email: string }) {
  const tUi = useTranslations('settings');

  const whoami = useQuery({
    queryKey: ['drive', 'whoami'],
    queryFn: () =>
      http.request<DriveWhoami>({ path: '/drive/v1/whoami', schema: driveWhoamiSchema }),
    retry: false,
  });
  const [allowanceOpen, setAllowanceOpen] = useState(false);

  // "Upgrade storage" in the Library lands on #storage; answer the question it asked.
  useEffect(() => {
    if (window.location.hash === '#storage') setAllowanceOpen(true);
  }, []);

  return (
    <SettingsSection
      title={tUi('m_71d985edf7')}
      description={tUi('m_7bbcf7db16')}
      action={
        <div className="flex flex-wrap gap-1">
          <SettingsInfoHint
            label={tUi('m_64ec8dc538')}
            contentClassName="w-[min(44rem,calc(100vw-2rem))]"
          >
            <DriveConnectSteps email={email} />
          </SettingsInfoHint>
          <SettingsInfoHint
            label={tUi('m_56c063cdd6')}
            open={allowanceOpen}
            onOpenChange={setAllowanceOpen}
          >
            <StorageAllowanceExplainer />
          </SettingsInfoHint>
        </div>
      }
    >
      {whoami.isPending ? (
        <p className="text-sm text-muted-foreground">{tUi('m_330346b87b')}</p>
      ) : whoami.isError ? (
        <p className="text-sm text-muted-foreground">{tUi('m_8fa3d340d9')}</p>
      ) : whoami.data.brands.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tUi('m_af91861806')}</p>
      ) : (
        <SettingsRowList data-testid="drive-brand-list" grid={DRIVE_GRID} columns={DRIVE_COLUMNS}>
          {whoami.data.brands.map((brand) => (
            <DriveBrandRow
              key={brand.brandId}
              brand={brand}
              onUpgrade={() => setAllowanceOpen(true)}
            />
          ))}
        </SettingsRowList>
      )}
    </SettingsSection>
  );
}

function DriveBrandRow({ brand, onUpgrade }: { brand: DriveBrand; onUpgrade: () => void }) {
  const tUi = useTranslations('settings');

  const quota = useDriveQuota(brand.brandId);
  const mountUrl = `${getApiBaseUrl()}/dav/${encodeURIComponent(brand.folder)}/`;

  return (
    <SettingsRow
      data-brand-id={brand.brandId}
      title={brand.folder}
      subtitle={<span className="capitalize">{brand.role}</span>}
      cells={[
        quota.data ? (
          <StorageQuotaMeterView key="storage" quota={quota.data} onUpgrade={onUpgrade} />
        ) : (
          <p key="storage" className="text-xs text-muted-foreground">
            {quota.isError ? tUi('m_c629acfcb7') : tUi('m_89a0f23103')}
          </p>
        ),
        quota.data ? <FreeSpace key="free" quota={quota.data} /> : null,
        <div key="mount" className="flex min-w-0 items-center gap-1">
          <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {tUi('m_a3f3c63f66')}
            {brand.folder}/
          </code>
          <CopyButton value={mountUrl} label={tUi('m_8f7a76f225')} iconOnly />
        </div>,
      ]}
      actions={
        <Link
          href={`/library?brandId=${brand.brandId}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1')}
        >
          {tUi('m_bcb71c2dbd')}
          <ArrowUpRight aria-hidden />
        </Link>
      }
      detail={
        <>
          {quota.data ? <QuotaBreakdown quota={quota.data} /> : null}
          <LocationLine label={tUi('m_fd32b9a355')} value={mountUrl} testId="drive-mount-url" />
          <LocationLine label={tUi('m_04c2ef68c5')} value={`/${brand.folder}/`} />
        </>
      }
    />
  );
}

function FreeSpace({ quota }: { quota: DriveQuota }) {
  const tUi = useTranslations('settings');

  const { ratio } = storageQuotaLevel(quota);
  return (
    <div data-testid="drive-free-space">
      <p className="text-sm font-medium tabular-nums">{formatStorage(quota.availableBytes)}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {Math.min(100, Math.round(ratio * 100))}
        {tUi('m_3186a6f6e2')}
        {quota.reservedBytes > 0
          ? tUi('m_3ce05d2c46', { v0: String(formatStorage(quota.reservedBytes)) })
          : ''}
      </p>
    </div>
  );
}

function QuotaBreakdown({ quota }: { quota: DriveQuota }) {
  const tUi = useTranslations('settings');

  const stats = [
    { label: tUi('m_02c0e4a1da'), bytes: quota.usedBytes },
    { label: tUi('m_d577ddc762'), bytes: quota.reservedBytes },
    { label: tUi('m_75f527181b'), bytes: quota.availableBytes },
    { label: tUi('m_0fa0f7ae68'), bytes: quota.capacityBytes },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ label, bytes }) => (
        <div key={label} className="space-y-0.5">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm font-medium tabular-nums">{formatStorage(bytes)}</dd>
        </div>
      ))}
    </dl>
  );
}

function LocationLine({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code
          data-testid={testId}
          className="min-w-0 flex-1 break-all rounded-md border bg-background/40 px-2 py-1.5 font-mono text-xs"
        >
          {value}
        </code>
        <CopyButton value={value} label={label.toLowerCase()} />
      </div>
    </div>
  );
}

/**
 * How the allowance is set and raised, stated as it works today — see
 * docs/billing-library-storage-plan.md. Buying capacity is sold but not yet applied
 * automatically (no Stripe purchase has ever produced a capacity grant), and this says so.
 */
function StorageAllowanceExplainer() {
  const tUi = useTranslations('settings');

  return (
    <div data-testid="storage-allowance-explainer" className="space-y-2 text-sm">
      <h3 className="font-medium">{tUi('m_72de1d8d68')}</h3>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>{tUi('m_e7f17cbc00')}</li>
        <li>{tUi('m_1ed5de33b9')}</li>
        <li>{tUi('m_4b5ea31c8d')}</li>
        <li>{tUi('m_009d5c83d9')}</li>
        <li>{tUi('m_00981c4f53')}</li>
      </ul>
      <h3 className="font-medium">{tUi('m_1dda8cee38')}</h3>
      <p className="text-muted-foreground">
        {tUi('m_fd08bb0062')}{' '}
        <Link href={billingHref()} className="underline underline-offset-2">
          {tUi('m_abaec4522b')}
        </Link>
        {tUi('m_97e6d57339')}
      </p>
    </div>
  );
}
