'use client';

// Which platform an "Add to Planner" step files drafts under, and which
// connected account owns them.
//
// The two fields are edited together because an account belongs to exactly one
// platform: changing the platform drops an account id that no longer addresses
// anything, rather than leaving a stale pairing the adapter's preflight would
// reject at run time.
//
// Platforms the organic publisher does not support yet stay VISIBLE and
// disabled with the reason spelled out — hiding them reads as "this platform
// does not exist", which is a different and wrong answer.

import type { AutomationSocialPlatform } from '@continuum/contracts';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { OrganicPlatformAccounts } from '@/lib/organic/platformAccountOptions';
import { ORGANIC_MVP_PLATFORM_KEYS, ORGANIC_PLATFORMS } from '@/lib/organic/platforms';
import { useOrganicPlatformAccountSource } from './defaultPickerSources';
import { isUnsetId, type PickerSource, RawIdFallbackField } from './pickerSource';

export type PlannerTarget = {
  platform: AutomationSocialPlatform;
  accountId: string | null;
};

const SUPPORTED_PLATFORMS = new Set<string>(ORGANIC_MVP_PLATFORM_KEYS);

export function PlannerTargetPicker({
  brandId,
  value,
  disabled,
  onChange,
  useSource = useOrganicPlatformAccountSource,
}: {
  brandId?: string;
  value: PlannerTarget;
  disabled: boolean;
  onChange: (next: PlannerTarget) => void;
  useSource?: PickerSource<OrganicPlatformAccounts>;
}) {
  const platformFieldId = useId();
  const accountFieldId = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const accountId = isUnsetId(value.accountId) ? null : (value.accountId as string);
  const accountOptions = items.find((item) => item.platform === value.platform)?.options ?? [];
  const degraded = isError || !brandId;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={platformFieldId}>Planner platform</Label>
        <Select
          value={value.platform}
          disabled={disabled}
          // An account belongs to one platform, so switching platforms clears it.
          onValueChange={(platform) =>
            onChange({ platform: platform as AutomationSocialPlatform, accountId: null })
          }
        >
          <SelectTrigger id={platformFieldId} aria-label="Planner platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORGANIC_PLATFORMS.map((platform) => {
              const supported = SUPPORTED_PLATFORMS.has(platform.key);
              return (
                <SelectItem key={platform.key} value={platform.key} disabled={!supported}>
                  {supported ? platform.label : `${platform.label} — not supported yet`}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {degraded ? (
        <RawIdFallbackField
          label="Connected account ID"
          value={accountId}
          disabled={disabled}
          placeholder="Connected account id"
          reason={
            brandId
              ? 'Connected accounts could not be loaded. The stored account stays editable here.'
              : 'No brand is in scope, so connected accounts cannot be listed.'
          }
          onChange={(raw) => onChange({ platform: value.platform, accountId: raw.trim() || null })}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={accountFieldId}>Connected account</Label>
          <Select
            value={accountId ?? ''}
            disabled={disabled || isLoading || accountOptions.length === 0}
            onValueChange={(next) => onChange({ platform: value.platform, accountId: next })}
          >
            <SelectTrigger id={accountFieldId} aria-label="Connected account">
              <SelectValue placeholder={isLoading ? 'Loading accounts…' : 'Select an account'} />
            </SelectTrigger>
            <SelectContent>
              {accountOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isLoading && accountOptions.length === 0 ? (
            <p className="text-[11px] leading-4 text-muted-foreground">
              No connected accounts for this platform. Connect one in Settings first.
            </p>
          ) : null}
          {accountId === null ? (
            <p className="text-[11px] leading-4 text-muted-foreground">
              This step cannot run or publish until an account is chosen.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
