import type { useTranslations as ScaleTranslationHook } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

// Paid setup diagnostics (IMP-010 / BUG-003 / BUG-004). Derives the connect →
// permission → assign → sync journey from the honest signals a blocked paid
// surface actually has: how many ad accounts are selectable for the platform,
// the shared FreshnessMeta view-model, and whether the account load failed or
// timed out. Each blocker carries the exact CTA to fix it. Pure and
// data-agnostic so the presentational panel and the Jaina concierge share one
// source of truth and it stays unit-testable.

import type { FreshnessMeta } from '@continuum/contracts';

import type { BrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';

export type PaidSetupStepStatus = 'done' | 'action_required' | 'attention' | 'pending';
export type PaidSetupStepId = 'connection' | 'permission' | 'assignment' | 'sync';

export type PaidSetupCta =
  | { kind: 'link'; label: string; href: string }
  | { kind: 'retry'; label: string };

export interface PaidSetupStep {
  id: PaidSetupStepId;
  label: string;
  description: string;
  status: PaidSetupStepStatus;
  cta?: PaidSetupCta;
}

export interface PaidSetupInput {
  platform: PaidMediaPlatform;
  // Ad accounts selectable for this platform. In a blocked state this is
  // typically 0 — a positive count means the selector would have auto-picked.
  availableAccountCount: number;
  freshness?: FreshnessMeta | null;
  // The account load failed or timed out (integration query error / selector
  // timeout). Surfaced as a permission/session blocker with a retry.
  loadError?: boolean;
}

// Connections and brand assignment both live on the same Settings surface.
export const PAID_SETUP_CONNECT_HREF = '/settings?section=integrations';

function providerLabel(platform: PaidMediaPlatform): string {
  if (platform === 'google-ads') return 'Google Ads';
  if (platform === 'dv360') return 'DV360';
  if (platform === 'linkedin') return 'LinkedIn Ads';
  return 'Meta Ads';
}

function platformSummaryKey(platform: PaidMediaPlatform): keyof BrandIntegrationSummary {
  if (platform === 'google-ads') return 'googleAds';
  if (platform === 'dv360') return 'dv360';
  if (platform === 'linkedin') return 'linkedin';
  return 'facebook';
}

// How many ad accounts are assigned to this brand for the given platform.
export function countPlatformAccounts(
  summary: BrandIntegrationSummary | undefined,
  platform: PaidMediaPlatform,
): number {
  if (!summary) return 0;
  return summary[platformSummaryKey(platform)]?.accounts?.length ?? 0;
}

function deriveSyncStep(
  input: PaidSetupInput,
  hasAccounts: boolean,
  uiTranslate?: ScaleCopy,
): PaidSetupStep {
  const freshness = input.freshness ?? null;

  if (freshness) {
    switch (freshness.status) {
      case 'error':
        return {
          id: 'sync',
          label: uiTranslate ? uiTranslate('last_sync_failed_d3f551a') : 'Last sync failed',
          description: uiTranslate
            ? uiTranslate('syncRetryGuidance')
            : (freshness.error ?? 'The last data sync failed. Retry to pull the latest campaigns.'),
          status: 'attention',
          cta: {
            kind: 'retry',
            label: uiTranslate ? uiTranslate('retry_sync_b6d7d34') : 'Retry sync',
          },
        };
      case 'stale':
        return {
          id: 'sync',
          label: uiTranslate ? uiTranslate('data_is_stale_ddca06f') : 'Data is stale',
          description: uiTranslate
            ? uiTranslate('campaign_data_is_older_than_expected_retry_to_4043f0b')
            : 'Campaign data is older than expected. Retry to refresh it.',
          status: 'attention',
          cta: {
            kind: 'retry',
            label: uiTranslate ? uiTranslate('retry_sync_b6d7d34') : 'Retry sync',
          },
        };
      case 'syncing':
        return {
          id: 'sync',
          label: uiTranslate
            ? uiTranslate('syncing_campaign_data_8d628bd')
            : 'Syncing campaign data',
          description: uiTranslate
            ? uiTranslate('we_re_pulling_the_latest_campaigns_and_spend__d212f63')
            : "We're pulling the latest campaigns and spend now.",
          status: 'pending',
        };
      case 'never':
        return {
          id: 'sync',
          label: uiTranslate ? uiTranslate('sync_campaign_data_a9698e3') : 'Sync campaign data',
          description: uiTranslate
            ? uiTranslate('no_sync_has_run_yet_it_starts_automatically_o_bd64973')
            : 'No sync has run yet. It starts automatically once an ad account is assigned.',
          status: 'pending',
        };
      case 'fresh':
        return {
          id: 'sync',
          label: uiTranslate ? uiTranslate('data_is_up_to_date_bdad57c') : 'Data is up to date',
          description: uiTranslate
            ? uiTranslate('campaign_data_is_fresh_38f2a97')
            : 'Campaign data is fresh.',
          status: 'done',
        };
    }
  }

  return hasAccounts
    ? {
        id: 'sync',
        label: uiTranslate ? uiTranslate('data_is_up_to_date_bdad57c') : 'Data is up to date',
        description: uiTranslate
          ? uiTranslate('campaign_data_is_ready_62ac612')
          : 'Campaign data is ready.',
        status: 'done',
      }
    : {
        id: 'sync',
        label: uiTranslate ? uiTranslate('sync_campaign_data_a9698e3') : 'Sync campaign data',
        description: uiTranslate
          ? uiTranslate('sync_starts_automatically_once_an_ad_account__848d5ec')
          : 'Sync starts automatically once an ad account is assigned.',
        status: 'pending',
      };
}

export function derivePaidSetupSteps(
  input: PaidSetupInput,
  uiTranslate?: ScaleCopy,
): PaidSetupStep[] {
  const provider = providerLabel(input.platform);
  const hasAccounts = input.availableAccountCount > 0;
  const loadError = input.loadError === true;

  const connection: PaidSetupStep = hasAccounts
    ? {
        id: 'connection',
        label: uiTranslate
          ? uiTranslate('helper_619954ff6a11', { v0: provider })
          : `${provider} connected`,
        description: uiTranslate
          ? uiTranslate('helper_142f8757e99b', { v0: provider })
          : `A ${provider} account is linked to Continuum.`,
        status: 'done',
      }
    : {
        id: 'connection',
        label: uiTranslate
          ? uiTranslate('helper_9db2ba6d8968', { v0: provider })
          : `Connect ${provider}`,
        description: uiTranslate
          ? uiTranslate('helper_14977b7d3858', { v0: provider })
          : `Link your ${provider} account so Continuum can read campaigns and spend.`,
        status: 'action_required',
        cta: {
          kind: 'link',
          label: uiTranslate
            ? uiTranslate('helper_9db2ba6d8968', { v0: provider })
            : `Connect ${provider}`,
          href: PAID_SETUP_CONNECT_HREF,
        },
      };

  const permission: PaidSetupStep = loadError
    ? {
        id: 'permission',
        label: uiTranslate
          ? uiTranslate('confirm_ad_account_access_09c9631')
          : 'Confirm ad account access',
        description: uiTranslate
          ? uiTranslate('we_couldn_t_confirm_ad_account_access_this_is_bbc1afd')
          : "We couldn't confirm ad account access — this is usually a permissions or session issue. Reconnect, then retry.",
        status: 'attention',
        cta: { kind: 'retry', label: uiTranslate ? uiTranslate('retry_942087c') : 'Retry' },
      }
    : hasAccounts
      ? {
          id: 'permission',
          label: uiTranslate
            ? uiTranslate('ad_account_access_granted_c398870')
            : 'Ad account access granted',
          description: uiTranslate
            ? uiTranslate('continuum_has_permission_to_read_this_ad_acco_ca82264')
            : 'Continuum has permission to read this ad account.',
          status: 'done',
        }
      : {
          id: 'permission',
          label: uiTranslate
            ? uiTranslate('grant_ad_account_access_6f0f31f')
            : 'Grant ad account access',
          description: uiTranslate
            ? uiTranslate('helper_36c939982c54', { v0: provider })
            : `Approve ads read and manage permissions when connecting ${provider}.`,
          status: 'pending',
        };

  const assignment: PaidSetupStep = hasAccounts
    ? {
        id: 'assignment',
        label: uiTranslate
          ? uiTranslate('ad_account_assigned_to_brand_9d06ef6')
          : 'Ad account assigned to brand',
        description: uiTranslate
          ? uiTranslate('this_ad_account_is_assigned_to_the_active_bra_166e06e')
          : 'This ad account is assigned to the active brand.',
        status: 'done',
      }
    : {
        id: 'assignment',
        label: uiTranslate
          ? uiTranslate('assign_an_ad_account_to_this_brand_0da359f')
          : 'Assign an ad account to this brand',
        description: uiTranslate
          ? uiTranslate('after_connecting_assign_the_ad_account_to_thi_ee465e6')
          : 'After connecting, assign the ad account to this brand so it appears in the selector.',
        status: 'pending',
        cta: {
          kind: 'link',
          label: uiTranslate ? uiTranslate('assign_account_1467ed6') : 'Assign account',
          href: PAID_SETUP_CONNECT_HREF,
        },
      };

  return [connection, permission, assignment, deriveSyncStep(input, hasAccounts, uiTranslate)];
}

// True when any step still needs the user. The selector auto-picks an account
// whenever one is available, so a blocked surface is exactly `some !== "done"`.
export function isPaidSetupBlocked(steps: PaidSetupStep[]): boolean {
  return steps.some((step) => step.status !== 'done');
}
