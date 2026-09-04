// One fallback label for a discovered integration asset that arrived without a
// name. Google refuses the Ads `descriptive_name` lookup on an unapproved
// developer token (DEVELOPER_TOKEN_NOT_APPROVED) or a deactivated customer
// (CUSTOMER_NOT_ENABLED), so every ads_customer row currently persists
// `name: null`. The three readers of that null used to disagree — one rendered
// the provider string, so several ad accounts became identical "google" rows;
// one rendered "Account"; one rendered a bare 10-digit customer id.

import { PLATFORMS, type PlatformKey } from '@/components/onboarding/platforms';
import { mapIntegrationTypeToPlatformKey } from '@/lib/integrations/platform';

const LABEL_BY_PLATFORM = new Map<PlatformKey, string>(
  PLATFORMS.map(({ key, label }) => [key, label]),
);

// Google prints customer ids as 123-456-7890 everywhere in its own UI; a bare
// digit run is unrecognizable next to a named account.
export function formatGoogleCustomerId(id: string): string {
  const digits = id.replace(/\D/g, '');
  if (digits.length !== 10) return id;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function assetFallbackLabel(
  type: string | null | undefined,
  externalId: string | null | undefined,
): string {
  const platformKey = mapIntegrationTypeToPlatformKey(type);
  const platform = platformKey ? (LABEL_BY_PLATFORM.get(platformKey) ?? null) : null;

  const trimmed = externalId?.trim() || null;
  const identifier =
    trimmed && platformKey === 'googleAds' ? formatGoogleCustomerId(trimmed) : trimmed;

  // No platform prefix: every surface that renders these rows already sits under
  // a platform tab or section header, and the switcher prints the external id
  // beside the title. The identifier is the only distinguishing part.
  return identifier ?? platform ?? 'Account';
}

export function resolveAssetLabel(asset: {
  name?: string | null;
  type?: string | null;
  external_id?: string | null;
}): string {
  return asset.name?.trim() || assetFallbackLabel(asset.type, asset.external_id);
}
