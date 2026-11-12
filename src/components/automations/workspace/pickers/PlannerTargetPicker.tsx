'use client';
import { useTranslations } from 'next-intl';

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
import { ORGANIC_POST_PLATFORM_KEYS, POST_PLATFORMS } from '@/lib/organic/postPlatforms';
import { useOrganicPlatformAccountSource } from './defaultPickerSources';
import { isUnsetId, type PickerSource, RawIdFallbackField } from './pickerSource';

export type PlannerTarget = {
  platform: AutomationSocialPlatform;
  accountId: string | null;
};

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
  const uiText = useTranslations('automations');
  const platformFieldId = useId();
  const accountFieldId = useId();
  const { items, isLoading, isError } = useSource(brandId);
  const accountId = isUnsetId(value.accountId) ? null : (value.accountId as string);
  const accountOptions = items.find((item) => item.platform === value.platform)?.options ?? [];
  const degraded = isError || !brandId;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={platformFieldId}>{uiText('planner_platform_9fc99b2')}</Label>
        <Select
          value={value.platform}
          disabled={disabled}
          // An account belongs to one platform, so switching platforms clears it.
          onValueChange={(platform) =>
            onChange({
              platform: platform as AutomationSocialPlatform,
              accountId: null,
            })
          }
        >
          <SelectTrigger id={platformFieldId} aria-label={uiText('planner_platform_9fc99b2')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORGANIC_POST_PLATFORM_KEYS.map((platform) => (
              <SelectItem key={platform} value={platform}>
                {POST_PLATFORMS[platform].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {degraded ? (
        <RawIdFallbackField
          label={uiText('connected_account_id_032e336')}
          value={accountId}
          disabled={disabled}
          placeholder={uiText('connected_account_id_45a838d')}
          reason={brandId ? uiText('m_7b84bafbdd') : uiText('m_498bd9fe65')}
          onChange={(raw) =>
            onChange({
              platform: value.platform,
              accountId: raw.trim() || null,
            })
          }
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={accountFieldId}>{uiText('connected_account_3903f0e')}</Label>
          <Select
            value={accountId ?? ''}
            disabled={disabled || isLoading || accountOptions.length === 0}
            onValueChange={(next) => onChange({ platform: value.platform, accountId: next })}
          >
            <SelectTrigger id={accountFieldId} aria-label={uiText('connected_account_3903f0e')}>
              <SelectValue
                placeholder={
                  isLoading
                    ? uiText('loading_accounts_2494bdb')
                    : uiText('select_an_account_ba89783')
                }
              />
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
            <p className="text-xs leading-4 text-muted-foreground">
              {uiText('no_connected_accounts_for_this_platform_conne_5e840d5')}
            </p>
          ) : null}
          {accountId === null ? (
            <p className="text-xs leading-4 text-muted-foreground">
              {uiText('this_step_cannot_run_or_publish_until_an_acco_70189c0')}
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
