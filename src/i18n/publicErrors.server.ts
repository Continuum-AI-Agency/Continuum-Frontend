import 'server-only';
import { getTranslations } from 'next-intl/server';
import { getCookieLocale } from './server';

/** Actions live outside the locale layout during direct invocation. */
export async function getPublicActionTranslations() {
  return getTranslations({ locale: await getCookieLocale(), namespace: 'public' });
}
