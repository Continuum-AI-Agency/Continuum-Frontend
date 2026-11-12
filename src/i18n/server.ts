import 'server-only';
import { cookies, headers } from 'next/headers';
import { isUiLocale, localeCookieName, type UiLocale } from './config';
import { resolveUiLocale } from './routing';

export async function getCookieLocale(): Promise<UiLocale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveUiLocale({
    cookie: cookieStore.get(localeCookieName)?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });
}

export async function setLocaleCookie(locale: UiLocale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 31_536_000,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function restoreAccountLocale(
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  await setLocaleCookie(
    isUiLocale(metadata?.ui_locale) ? metadata.ui_locale : await getCookieLocale(),
  );
}
