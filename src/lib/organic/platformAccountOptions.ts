// One derivation of "which connected account can this brand post to, per
// organic platform".
//
// The organic planner (RSC) and the automation action pickers both address a
// post by a (platform, accountId) PAIR, and they have to agree about which
// pairs exist — an automation that offers an account the planner would not
// publish to is a failed run, not a form error. So the mapping lives here and
// both call it.
//
// A connected platform is one the user linked personally OR one the brand has
// assigned accounts for; the brand assignment is authoritative for what can
// actually be published to.

import type { PlatformKey } from '@/components/onboarding/platforms';
import type { BrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import {
  ORGANIC_MVP_PLATFORM_KEYS,
  type OrganicPlatformKey,
  organicPlatformLabel,
} from './platforms';

export type OrganicAccountOption = {
  id: string;
  label: string;
};

export type OrganicPlatformAccounts = {
  platform: OrganicPlatformKey;
  label: string;
  connected: boolean;
  /** The DEFAULT account for the platform. Callers may point at any `options` entry. */
  accountId: string | null;
  options: OrganicAccountOption[];
};

export type OrganicConnectionState = {
  connected?: boolean | null;
  accountId?: string | null;
};

export type OrganicConnectionStates = Partial<
  Record<OrganicPlatformKey, OrganicConnectionState | undefined>
>;

/**
 * The platforms the organic publisher actually supports. Identical to the MVP
 * planner set by construction — the planner cannot schedule to a platform the
 * publisher cannot post to.
 */
export const ORGANIC_PUBLISH_PLATFORM_KEYS = ORGANIC_MVP_PLATFORM_KEYS;

type DeriveInput = {
  integrationSummary?: Partial<BrandIntegrationSummary> | null;
  /** Personal OAuth connections from onboarding state. Absent on client callers. */
  connections?: OrganicConnectionStates;
  platforms?: readonly OrganicPlatformKey[];
};

export function deriveOrganicPlatformAccounts({
  integrationSummary,
  connections,
  platforms = ORGANIC_MVP_PLATFORM_KEYS,
}: DeriveInput): OrganicPlatformAccounts[] {
  return platforms.map((platform) => {
    const connection = connections?.[platform];
    const summaryAccounts = integrationSummary?.[platform as PlatformKey]?.accounts ?? [];
    const options: OrganicAccountOption[] = summaryAccounts.map((account) => ({
      id: account.integrationAccountId,
      label: account.alias ?? account.name,
    }));

    return {
      platform,
      label: organicPlatformLabel(platform),
      connected: Boolean(connection?.connected) || options.length > 0,
      accountId: connection?.accountId ?? options[0]?.id ?? null,
      options,
    };
  });
}

export type OrganicPublishAccountOption = {
  platform: OrganicPlatformKey;
  platformLabel: string;
  accountId: string;
  label: string;
};

/**
 * Every (platform, accountId) pair the organic publisher can be pointed at,
 * flattened for a single combobox. Selecting one entry sets BOTH fields, which
 * is what makes an Instagram platform paired with a LinkedIn account id
 * unrepresentable.
 */
export function deriveOrganicPublishAccountOptions(
  integrationSummary?: Partial<BrandIntegrationSummary> | null,
): OrganicPublishAccountOption[] {
  return deriveOrganicPlatformAccounts({
    integrationSummary,
    platforms: ORGANIC_PUBLISH_PLATFORM_KEYS,
  }).flatMap((entry) =>
    entry.options.map((option) => ({
      platform: entry.platform,
      platformLabel: entry.label,
      accountId: option.id,
      label: option.label,
    })),
  );
}
