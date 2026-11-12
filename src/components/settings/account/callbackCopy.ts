import type { useTranslations } from 'next-intl';

const keys = {
  'Connected, but no Google Ads accounts were found.': 'm_5ee3c9a5d8',
  'Connected, but no YouTube channel is owned by this Google account. If your channel is a Brand Account, reconnect and pick it at the Google account chooser.':
    'm_8640a406f4',
  "Connected, but we could not load your YouTube channels. We'll retry on the next sync.":
    'm_42db83697a',
  "Connected, but some Meta accounts may be missing. We'll keep trying to load them.":
    'm_efee455b09',
  'Integration connected.': 'm_2a491fc94f',
  'You cancelled the connection.': 'm_ef41547622',
  'This app is not approved for the permissions it asked for. Contact support.': 'm_099de33d79',
  'The provider did not return an authorization code.': 'm_955fd90b07',
  'Connection failed.': 'm_4b8425c313',
} as const;
/** Input is built-in callback guidance selected from stable provider codes. */
export function integrationCallbackCopy(
  source: string,
  t: ReturnType<typeof useTranslations<'settings'>>,
): string {
  return Object.hasOwn(keys, source) ? t(keys[source as keyof typeof keys]) : t('m_4b8425c313');
}
