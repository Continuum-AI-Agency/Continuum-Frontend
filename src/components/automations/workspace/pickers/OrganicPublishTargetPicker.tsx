'use client';

// The single connected account a "Publish organic" step posts to.
//
// `platform` and `accountId` are ONE choice here, not two fields. Independently
// editable, they let a workflow store `platform: 'instagram'` with a LinkedIn
// account id — a pairing nothing on the client rejects and the publisher fails
// on at run time. Every entry in this list is a real (platform, account) pair
// derived from the brand's assigned integration accounts, so the invalid
// pairing is simply not expressible.

import type { AutomationSocialPlatform } from '@continuum/contracts';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { OrganicPublishAccountOption } from '@/lib/organic/platformAccountOptions';
import { ORGANIC_PUBLISH_PLATFORM_KEYS } from '@/lib/organic/platformAccountOptions';
import { organicPlatformLabel } from '@/lib/organic/platforms';
import { cn } from '@/lib/utils';
import { useOrganicPublishAccountSource } from './defaultPickerSources';
import { isUnsetId, type PickerSource, RawIdFallbackField } from './pickerSource';

export type OrganicPublishTarget = {
  platform: AutomationSocialPlatform;
  accountId: string;
};

export function OrganicPublishTargetPicker({
  brandId,
  value,
  disabled,
  onChange,
  useSource = useOrganicPublishAccountSource,
}: {
  brandId?: string;
  value: OrganicPublishTarget;
  disabled: boolean;
  onChange: (next: OrganicPublishTarget) => void;
  useSource?: PickerSource<OrganicPublishAccountOption>;
}) {
  const [open, setOpen] = useState(false);
  const platformFieldId = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const accountId = isUnsetId(value.accountId) ? null : value.accountId;

  const groups = useMemo(() => {
    return ORGANIC_PUBLISH_PLATFORM_KEYS.map((platform) => ({
      platform,
      label: organicPlatformLabel(platform),
      options: items.filter((item) => item.platform === platform),
    })).filter((group) => group.options.length > 0);
  }, [items]);

  const selected = accountId
    ? items.find((item) => item.accountId === accountId && item.platform === value.platform)
    : undefined;

  // An outage must never make a stored target uneditable, and it must never
  // silently rewrite it either — so both halves of the pair stay editable, as
  // the plain fields they were before this picker existed.
  if (isError || !brandId) {
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={platformFieldId}>Publish platform</Label>
          <Select
            value={value.platform}
            disabled={disabled}
            onValueChange={(platform) =>
              onChange({
                platform: platform as AutomationSocialPlatform,
                accountId: value.accountId,
              })
            }
          >
            <SelectTrigger id={platformFieldId} aria-label="Publish platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORGANIC_PUBLISH_PLATFORM_KEYS.map((platform) => (
                <SelectItem key={platform} value={platform}>
                  {organicPlatformLabel(platform)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <RawIdFallbackField
          label="Connected account ID"
          value={accountId}
          disabled={disabled}
          placeholder="Connected account id"
          reason={
            brandId
              ? 'Connected accounts could not be loaded. The stored target stays editable here — check that the platform matches the account.'
              : 'No brand is in scope, so connected accounts cannot be listed.'
          }
          onChange={(raw) => onChange({ platform: value.platform, accountId: raw })}
        />
      </>
    );
  }

  const triggerLabel = isLoading
    ? 'Loading accounts…'
    : selected
      ? `${selected.platformLabel} · ${selected.label}`
      : accountId
        ? `Unavailable account (${accountId})`
        : 'Select a connected account';

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Publish target</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-label="Publish target"
              aria-expanded={open}
              disabled={disabled || isLoading || items.length === 0}
              className="w-full justify-between font-normal"
            >
              <span className="truncate">{triggerLabel}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </Button>
          }
        />
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search connected accounts..." className="h-9 text-xs" />
            <CommandList>
              <CommandEmpty>No connected accounts found.</CommandEmpty>
              {groups.map((group) => (
                <CommandGroup key={group.platform} heading={group.label}>
                  {group.options.map((option) => {
                    const isSelected =
                      option.accountId === accountId && option.platform === value.platform;
                    return (
                      <CommandItem
                        key={`${option.platform}:${option.accountId}`}
                        value={`${group.label} ${option.label} ${option.accountId}`}
                        keywords={[option.accountId]}
                        className="cursor-pointer"
                        // Platform AND account move together — that is the point.
                        onSelect={() => {
                          onChange({ platform: option.platform, accountId: option.accountId });
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-1.5 h-3.5 w-3.5',
                            isSelected ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate text-xs">{option.label}</span>
                        <span className="ml-auto truncate text-2xs text-muted-foreground">
                          {option.accountId}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {!isLoading && items.length === 0 ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          This brand has no connected Instagram, Facebook, or LinkedIn account to publish to.
        </p>
      ) : (
        <p className="text-[11px] leading-4 text-muted-foreground">
          Choosing an account sets the platform with it, so the two can never disagree.
        </p>
      )}
    </div>
  );
}
