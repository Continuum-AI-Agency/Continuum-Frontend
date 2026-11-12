import { defineRouting } from 'next-intl/routing';
import { matchBrowserLocale } from './browserLocale';
import { defaultLocale, isUiLocale, type UiLocale, uiLocales } from './config';

export const routing = defineRouting({
  locales: uiLocales,
  defaultLocale,
  localePrefix: 'never',
  localeCookie: {
    name: 'NEXT_LOCALE',
    path: '/',
    sameSite: 'lax',
    maxAge: 31_536_000,
  },
});

export function resolveUiLocale(input: {
  cookie?: unknown;
  account?: unknown;
  acceptLanguage?: string | null;
}): UiLocale {
  if (isUiLocale(input.cookie)) return input.cookie;
  if (isUiLocale(input.account)) return input.account;
  return matchBrowserLocale(input.acceptLanguage);
}
