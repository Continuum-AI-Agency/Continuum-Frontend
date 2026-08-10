'use client';

// Account scope selection for organic metrics.
// single: Overview / Post performance — one merged account combobox (pick platform+account together).
// multi: Compare — one multi-select combobox (checkbox rows grouped by platform, color-coded).

import type { OrganicMetricPlatform } from '@continuum/contracts';
import { Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { PlatformIcon } from '@/components/onboarding/PlatformIcons';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { accountSeriesKey, assignSeriesColors, SERIES_COLORS } from '@/lib/organic/blendAccounts';
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
  /** single mode: current platform+account and a combined setter */
  platform?: OrganicMetricPlatform;
  accountId?: string | null;
  onSelect?: (platform: OrganicMetricPlatform, accountId: string) => void;
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

function keyOf(account: ScopeAccount): string {
  return accountSeriesKey(account.platform, account.integrationAccountId);
}

function flattenAccounts(
  accountsByPlatform: AccountsByPlatform,
  platforms: OrganicMetricPlatform[],
): ScopeAccount[] {
  return platforms.flatMap((p) => accountsByPlatform[p] ?? []);
}

export function MetricsScopeSelector(props: MetricsScopeSelectorProps) {
  const { accountsByPlatform, mode, className } = props;
  const available = React.useMemo(
    () => connectedPlatforms(accountsByPlatform),
    [accountsByPlatform],
  );

  if (available.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No organic accounts connected.
      </div>
    );
  }

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      data-tour-id="metrics-scope-selector"
      data-mode={mode}
    >
      {mode === 'single' ? (
        <SingleAccountCombobox
          accountsByPlatform={accountsByPlatform}
          available={available}
          platform={props.platform}
          accountId={props.accountId ?? null}
          onSelect={props.onSelect}
        />
      ) : (
        <MultiAccountCombobox
          accountsByPlatform={accountsByPlatform}
          available={available}
          selectedAccountKeys={props.selectedAccountKeys ?? []}
          onSelectedAccountKeysChange={props.onSelectedAccountKeysChange}
          onSelectedPlatformsChange={props.onSelectedPlatformsChange}
        />
      )}
    </div>
  );
}

type SingleAccountComboboxProps = {
  accountsByPlatform: AccountsByPlatform;
  available: OrganicMetricPlatform[];
  platform?: OrganicMetricPlatform;
  accountId: string | null;
  onSelect?: (platform: OrganicMetricPlatform, accountId: string) => void;
};

function SingleAccountCombobox({
  accountsByPlatform,
  available,
  platform,
  accountId,
  onSelect,
}: SingleAccountComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(() => {
    if (!platform || !accountId) return null;
    return (
      (accountsByPlatform[platform] ?? []).find(
        (account) => account.integrationAccountId === accountId,
      ) ?? null
    );
  }, [accountsByPlatform, platform, accountId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            data-tour-id="metrics-scope-account-trigger"
            className="h-8 min-w-[12rem] max-w-[20rem] justify-between gap-2 px-2.5 text-xs font-normal"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {selected ? <PlatformIcon platform={selected.platform} size={14} /> : null}
              <span className="truncate">{selected ? selected.name : 'Select account'}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
          </Button>
        }
      />

      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search accounts…" className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>No accounts found.</CommandEmpty>
            {available.map((p) => (
              <CommandGroup key={p} heading={PLATFORM_LABELS[p]}>
                {(accountsByPlatform[p] ?? []).map((account) => {
                  const isSelected =
                    platform === account.platform && accountId === account.integrationAccountId;
                  return (
                    <CommandItem
                      key={keyOf(account)}
                      value={`${account.name} ${account.integrationAccountId}`}
                      keywords={[account.integrationAccountId, PLATFORM_LABELS[p]]}
                      onSelect={() => {
                        onSelect?.(account.platform, account.integrationAccountId);
                        setOpen(false);
                      }}
                      className="cursor-pointer gap-2"
                    >
                      <Check
                        className={cn(
                          'size-3.5 shrink-0',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-hidden
                      />
                      <PlatformIcon platform={account.platform} size={14} />
                      <span className="truncate text-xs">{account.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type MultiAccountComboboxProps = {
  accountsByPlatform: AccountsByPlatform;
  available: OrganicMetricPlatform[];
  selectedAccountKeys: string[];
  onSelectedAccountKeysChange?: (keys: string[]) => void;
  onSelectedPlatformsChange?: (platforms: OrganicMetricPlatform[]) => void;
};

function MultiAccountCombobox({
  accountsByPlatform,
  available,
  selectedAccountKeys,
  onSelectedAccountKeysChange,
  onSelectedPlatformsChange,
}: MultiAccountComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const allAccounts = React.useMemo(
    () => flattenAccounts(accountsByPlatform, available),
    [accountsByPlatform, available],
  );

  const colorByKey = React.useMemo(() => assignSeriesColors(allAccounts.map(keyOf)), [allAccounts]);

  const selectedKeySet = React.useMemo(() => new Set(selectedAccountKeys), [selectedAccountKeys]);

  // selectedPlatforms is derived: a platform is selected iff ≥1 of its accounts
  // is selected. Emitting both keeps OrganicCompareView's platform state in sync
  // without a separate platform control.
  const emit = React.useCallback(
    (nextKeys: string[]) => {
      onSelectedAccountKeysChange?.(nextKeys);
      const keySet = new Set(nextKeys);
      const nextPlatforms = available.filter((p) =>
        (accountsByPlatform[p] ?? []).some((account) => keySet.has(keyOf(account))),
      );
      onSelectedPlatformsChange?.(nextPlatforms);
    },
    [accountsByPlatform, available, onSelectedAccountKeysChange, onSelectedPlatformsChange],
  );

  const toggleAccount = (key: string) => {
    if (selectedKeySet.has(key)) {
      if (selectedAccountKeys.length === 1) return; // keep at least one
      emit(selectedAccountKeys.filter((k) => k !== key));
    } else {
      emit([...selectedAccountKeys, key]);
    }
  };

  const togglePlatformAll = (p: OrganicMetricPlatform, allOn: boolean) => {
    const keys = (accountsByPlatform[p] ?? []).map(keyOf);
    if (allOn) {
      const next = selectedAccountKeys.filter((k) => !keys.includes(k));
      if (next.length === 0) return; // keep at least one
      emit(next);
    } else {
      emit([...new Set([...selectedAccountKeys, ...keys])]);
    }
  };

  const count = selectedAccountKeys.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            data-tour-id="metrics-scope-accounts-trigger"
            className="h-8 min-w-[12rem] max-w-[24rem] justify-between gap-2 px-2.5 text-xs font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex -space-x-1" aria-hidden>
                {selectedAccountKeys.slice(0, 4).map((key, index) => (
                  <span
                    key={key}
                    className="size-2 rounded-full ring-1 ring-background"
                    style={{
                      background:
                        colorByKey.get(key) ?? SERIES_COLORS[index % SERIES_COLORS.length],
                    }}
                  />
                ))}
              </span>
              <span className="truncate">
                {count} {count === 1 ? 'account' : 'accounts'}
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
          </Button>
        }
      />

      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search accounts…" className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>No accounts found.</CommandEmpty>
            {available.map((p) => {
              const accounts = accountsByPlatform[p] ?? [];
              const allOn =
                accounts.length > 0 &&
                accounts.every((account) => selectedKeySet.has(keyOf(account)));
              return (
                <CommandGroup
                  key={p}
                  heading={
                    <span className="flex items-center gap-1.5">
                      <PlatformIcon platform={p} size={12} />
                      {PLATFORM_LABELS[p]}
                    </span>
                  }
                >
                  {accounts.length > 1 ? (
                    <CommandItem
                      value={`toggle all ${PLATFORM_LABELS[p]}`}
                      onSelect={() => togglePlatformAll(p, allOn)}
                      className="cursor-pointer gap-2 text-2xs text-muted-foreground"
                    >
                      <span className="size-4 shrink-0" aria-hidden />
                      {allOn
                        ? `Deselect all ${PLATFORM_LABELS[p]}`
                        : `Select all ${PLATFORM_LABELS[p]}`}
                    </CommandItem>
                  ) : null}
                  {accounts.map((account, index) => {
                    const key = keyOf(account);
                    const isSelected = selectedKeySet.has(key);
                    return (
                      <CommandItem
                        key={key}
                        value={`${account.name} ${account.integrationAccountId}`}
                        keywords={[account.integrationAccountId]}
                        onSelect={() => toggleAccount(key)}
                        className="cursor-pointer gap-2"
                      >
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input',
                          )}
                          aria-hidden
                        >
                          {isSelected ? <Check className="size-3" /> : null}
                        </span>
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            background:
                              colorByKey.get(key) ?? SERIES_COLORS[index % SERIES_COLORS.length],
                          }}
                          aria-hidden
                        />
                        <span className="truncate text-xs">{account.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
