'use client';

import {
  type AbstractIntlMessages,
  NextIntlClientProvider,
  useLocale,
  useMessages,
  useTimeZone,
} from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { isUiLocale } from './config';
import { lazyCatalogLoaders } from './lazy-catalogs.generated';
import { mergeMessages } from './selectMessages';

const pendingCatalogs = new Map<string, Promise<AbstractIntlMessages>>();

type LazyScope = keyof typeof lazyCatalogLoaders;

function catalogs(scope: LazyScope, locale: string): Promise<AbstractIntlMessages> {
  if (!isUiLocale(locale)) return Promise.reject(new Error('Unsupported UI locale'));
  const key = `${locale}:${scope}`;
  let pending = pendingCatalogs.get(key);
  if (!pending) {
    pending = lazyCatalogLoaders[scope]
      [locale]()
      .then((module) => module.default)
      .catch((error: unknown) => {
        pendingCatalogs.delete(key);
        throw error;
      });
    pendingCatalogs.set(key, pending);
  }
  return pending;
}

type LoadState =
  | { key: string; messages: AbstractIntlMessages; error?: never }
  | { key: string; messages?: never; error: unknown };

/** Attach catalogs to an existing client-only feature, preloading its code in parallel. */
export function LazyFeatureMessages({
  scope,
  namespaces: _namespaces,
  preload,
  loading,
  children,
}: {
  scope: LazyScope;
  /** Static authoring marker used by the import-graph scope generator. */
  namespaces: readonly string[];
  preload: () => Promise<unknown>;
  loading: ReactNode;
  children: ReactNode;
}) {
  const locale = useLocale();
  const parent = useMessages();
  const timeZone = useTimeZone();
  const key = `${locale}:${scope}`;
  const [state, setState] = useState<LoadState | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([catalogs(scope, locale), preload()])
      .then(([messages]) => {
        if (active) setState({ key, messages });
      })
      .catch((error: unknown) => {
        if (active) setState({ key, error });
      });
    return () => {
      active = false;
    };
  }, [key, locale, scope, preload]);
  const messages = useMemo(() => mergeMessages(parent, state?.messages ?? {}), [parent, state]);
  if (!state || state.key !== key) return loading;
  if ('error' in state) throw state.error;
  return (
    <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
