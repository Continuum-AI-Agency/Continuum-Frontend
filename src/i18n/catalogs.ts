import 'server-only';
import type { AbstractIntlMessages } from 'next-intl';
import { cache } from 'react';
import type { UiLocale } from './config';

export const messageNamespaces = [
  'common',
  'navigation',
  'auth',
  'settings',
  'onboarding',
  'organic',
  'scale',
  'library',
  'forge',
  'studio',
  'automations',
  'admin',
  'dashboard',
  'public',
  'competitor',
] as const;
export type MessageNamespace = (typeof messageNamespaces)[number];

export const loadMessages = cache(async (locale: UiLocale): Promise<AbstractIntlMessages> => {
  const entries = await Promise.all(
    messageNamespaces.map(
      async (namespace) =>
        [namespace, (await import(`../../messages/${namespace}/${locale}.json`)).default] as const,
    ),
  );
  return Object.fromEntries(entries);
});
