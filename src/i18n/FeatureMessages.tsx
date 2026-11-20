import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import manifest from './message-scopes.generated.json';
import { selectMessages } from './selectMessages';

export async function FeatureMessages({
  scope,
  children,
}: {
  scope: keyof typeof manifest.scopes;
  children: ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={selectMessages(messages, manifest.scopes[scope])}
    >
      {children}
    </NextIntlClientProvider>
  );
}
