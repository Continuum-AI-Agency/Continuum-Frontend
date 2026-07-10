'use client';

// Platform → separator → account selector for organic metrics.
// single: Account/Posts tab (one platform, one account).
// multi: Compare tab (many platforms, many accounts, color-coded).

import type { OrganicMetricPlatform } from '@continuum/contracts';
import * as React from 'react';
import { PlatformIcon } from '@/components/onboarding/PlatformIcons';
import {
  accountSeriesKey,
  assignSeriesColors,
  SERIES_COLORS,
} from '@/lib/organic/blendAccounts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export type ScopeAccount = {
  platform: OrganicMetricPlatform;
  integrationAccountId: string;
  name: string;
};

export type AccountsByPlatform = Record<OrganicMetricPlatform, ScopeAccount[]>;

const PLATFORM_ORDER: OrganicMetricPlatform[] = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
];

const PLATFORM_LABELS: Record<OrganicMetricPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
};

export type MetricsScopeSelectorProps = {
  accountsByPlatform: AccountsByPlatform;
  mode: 'single' | 'multi';
  /** single mode */
  platform?: OrganicMetricPlatform;
  onPlatformChange?: (platform: OrganicMetricPlatform) => void;
  accountId?: string | null;
  onAccountChange?: (accountId: string) => void;
  /** multi mode */
  selectedPlatforms?: OrganicMetricPlatform[];
  onSelectedPlatformsChange?: (platforms: OrganicMetricPlatform[]) => void;
  selectedAccountKeys?: string[];
  onSelectedAccountKeysChange?: (keys: string[]) => void;
  className?: string;
};

function connectedPlatforms(accountsByPlatform: AccountsByPlatform): OrganicMetricPlatform[] {
  return PLATFORM_ORDER.filter((p) => (accountsByPlatform[p]?.length ?? 0) > 0);
}

export function MetricsScopeSelector({
  accountsByPlatform,
  mode,
  platform,
  onPlatformChange,
  accountId,
  onAccountChange,
  selectedPlatforms = [],
  onSelectedPlatformsChange,
  selectedAccountKeys = [],
  onSelectedAccountKeysChange,
  className,
}: MetricsScopeSelectorProps) {
  const available = React.useMemo(
    () => connectedPlatforms(accountsByPlatform),
    [accountsByPlatform],
  );

  const activePlatforms: OrganicMetricPlatform[] =
    mode === 'single'
      ? platform
        ? [platform]
        : available.slice(0, 1)
      : selectedPlatforms.length > 0
        ? selectedPlatforms
        : available;

  const accountsForBar = React.useMemo(() => {
    const list: ScopeAccount[] = [];
    for (const p of activePlatforms) {
      for (const account of accountsByPlatform[p] ?? []) {
        list.push(account);
      }
    }
    return list;
  }, [accountsByPlatform, activePlatforms]);

  const colorByKey = React.useMemo(() => {
    const keys = accountsForBar.map((a) =>
      accountSeriesKey(a.platform, a.integrationAccountId),
    );
    return assignSeriesColors(keys);
  }, [accountsForBar]);

  const selectedKeySet = React.useMemo(
    () => new Set(selectedAccountKeys),
    [selectedAccountKeys],
  );

  const togglePlatformMulti = (p: OrganicMetricPlatform) => {
    if (!onSelectedPlatformsChange || !onSelectedAccountKeysChange) return;
    const has = selectedPlatforms.includes(p);
    if (has) {
      if (selectedPlatforms.length === 1) return;
      const nextPlatforms = selectedPlatforms.filter((x) => x !== p);
      onSelectedPlatformsChange(nextPlatforms);
      const allowed = new Set(
        nextPlatforms.flatMap((plat) =>
          (accountsByPlatform[plat] ?? []).map((a) =>
            accountSeriesKey(a.platform, a.integrationAccountId),
          ),
        ),
      );
      const nextKeys = selectedAccountKeys.filter((k) => allowed.has(k));
      onSelectedAccountKeysChange(
        nextKeys.length > 0
          ? nextKeys
          : nextPlatforms.flatMap((plat) =>
              (accountsByPlatform[plat] ?? []).map((a) =>
                accountSeriesKey(a.platform, a.integrationAccountId),
              ),
            ),
      );
    } else {
      const nextPlatforms = [...selectedPlatforms, p];
      onSelectedPlatformsChange(nextPlatforms);
      const added = (accountsByPlatform[p] ?? []).map((a) =>
        accountSeriesKey(a.platform, a.integrationAccountId),
      );
      onSelectedAccountKeysChange([...new Set([...selectedAccountKeys, ...added])]);
    }
  };

  const selectAllOnPlatform = (p: OrganicMetricPlatform) => {
    if (!onSelectedAccountKeysChange) return;
    const keys = (accountsByPlatform[p] ?? []).map((a) =>
      accountSeriesKey(a.platform, a.integrationAccountId),
    );
    if (mode === 'multi') {
      const without = selectedAccountKeys.filter((k) => !k.startsWith(`${p}:`));
      onSelectedAccountKeysChange([...without, ...keys]);
      if (onSelectedPlatformsChange && !selectedPlatforms.includes(p)) {
        onSelectedPlatformsChange([...selectedPlatforms, p]);
      }
    }
  };

  const toggleAccountMulti = (key: string) => {
    if (!onSelectedAccountKeysChange) return;
    if (selectedKeySet.has(key)) {
      if (selectedAccountKeys.length === 1) return;
      onSelectedAccountKeysChange(selectedAccountKeys.filter((k) => k !== key));
    } else {
      onSelectedAccountKeysChange([...selectedAccountKeys, key]);
    }
  };

  if (available.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No organic accounts connected.
      </div>
    );
  }

  return (
    <div
      className={cn('flex flex-col gap-2.5', className)}
      data-tour-id="metrics-scope-selector"
      data-mode={mode}
    >
      <div className="flex flex-wrap items-center gap-2" data-tour-id="metrics-scope-platforms">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">Platform</span>
        {available.map((p) => {
          const selected =
            mode === 'single' ? platform === p : selectedPlatforms.includes(p);
          const count = accountsByPlatform[p]?.length ?? 0;
          return (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={selected ? 'default' : 'outline'}
              className="h-8 gap-1.5 px-2.5 text-xs"
              data-tour-id={`scope-platform-${p}`}
              data-selected={selected ? 'true' : 'false'}
              onClick={() => {
                if (mode === 'single') onPlatformChange?.(p);
                else togglePlatformMulti(p);
              }}
            >
              <PlatformIcon platform={p} size={14} />
              {PLATFORM_LABELS[p]}
              {count > 1 ? (
                <Badge variant="secondary" className="h-4 px-1 text-2xs">
                  {count}
                </Badge>
              ) : null}
            </Button>
          );
        })}
      </div>

      <Separator data-tour-id="metrics-scope-separator" />

      <div className="flex flex-wrap items-center gap-2" data-tour-id="metrics-scope-accounts">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">Accounts</span>
        {accountsForBar.map((account, index) => {
          const key = accountSeriesKey(account.platform, account.integrationAccountId);
          const color = colorByKey.get(key) ?? SERIES_COLORS[index % SERIES_COLORS.length];
          const selected =
            mode === 'single'
              ? accountId === account.integrationAccountId
              : selectedKeySet.has(key);

          return (
            <button
              key={key}
              type="button"
              data-tour-id={`scope-account-${key}`}
              data-selected={selected ? 'true' : 'false'}
              onClick={() => {
                if (mode === 'single') onAccountChange?.(account.integrationAccountId);
                else toggleAccountMulti(key);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                selected
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border bg-background text-muted-foreground',
              )}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
              {activePlatforms.length > 1 ? (
                <PlatformIcon platform={account.platform} size={12} />
              ) : null}
              <span className="max-w-[12rem] truncate">{account.name}</span>
            </button>
          );
        })}

        {mode === 'multi' &&
          activePlatforms.map((p) => {
            const count = accountsByPlatform[p]?.length ?? 0;
            if (count < 2) return null;
            const allSelected = (accountsByPlatform[p] ?? []).every((a) =>
              selectedKeySet.has(accountSeriesKey(a.platform, a.integrationAccountId)),
            );
            return (
              <Button
                key={`all-${p}`}
                type="button"
                size="sm"
                variant={allSelected ? 'secondary' : 'ghost'}
                className="h-7 border border-dashed px-2 text-2xs"
                onClick={() => selectAllOnPlatform(p)}
              >
                All {PLATFORM_LABELS[p]}
              </Button>
            );
          })}
      </div>
    </div>
  );
}
