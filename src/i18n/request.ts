import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { getRequestConfig } from 'next-intl/server';
import { loadMessages } from './catalogs';
import { isUiLocale } from './config';

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  const locale = explicitLocale ?? (await rootLocale());
  if (!isUiLocale(locale)) notFound();
  return { locale, messages: await loadMessages(locale), timeZone: 'UTC' };
});
