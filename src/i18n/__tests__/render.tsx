import {
  type RenderHookOptions,
  type RenderOptions,
  render as renderReact,
  renderHook as renderReactHook,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import {
  renderToStaticMarkup as renderMarkup,
  renderToString as renderString,
} from 'react-dom/server';
import admin from '../../../messages/admin/en.json';
import auth from '../../../messages/auth/en.json';
import automations from '../../../messages/automations/en.json';
import common from '../../../messages/common/en.json';
import competitor from '../../../messages/competitor/en.json';
import dashboard from '../../../messages/dashboard/en.json';
import forge from '../../../messages/forge/en.json';
import library from '../../../messages/library/en.json';
import navigation from '../../../messages/navigation/en.json';
import onboarding from '../../../messages/onboarding/en.json';
import organic from '../../../messages/organic/en.json';
import publicMessages from '../../../messages/public/en.json';
import scale from '../../../messages/scale/en.json';
import settings from '../../../messages/settings/en.json';
import studio from '../../../messages/studio/en.json';

export const englishMessages = {
  common,
  navigation,
  auth,
  settings,
  onboarding,
  organic,
  scale,
  library,
  forge,
  studio,
  automations,
  admin,
  dashboard,
  public: publicMessages,
  competitor,
};

function failTranslation(error: unknown): never {
  throw error;
}

export function I18nTestProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="en"
      timeZone="UTC"
      messages={englishMessages}
      onError={failTranslation}
    >
      {children}
    </NextIntlClientProvider>
  );
}

export function render(ui: ReactNode, options: RenderOptions = {}) {
  const OuterWrapper = options.wrapper;
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nTestProvider>
        {OuterWrapper ? <OuterWrapper>{children}</OuterWrapper> : children}
      </I18nTestProvider>
    );
  }
  return renderReact(ui, { ...options, wrapper: Wrapper });
}

export function renderToStaticMarkup(element: ReactNode) {
  return renderMarkup(<I18nTestProvider>{element}</I18nTestProvider>);
}

export function renderToString(element: ReactElement) {
  return renderString(<I18nTestProvider>{element}</I18nTestProvider>);
}

export function renderHook<Result, Props>(
  callback: (props: Props) => Result,
  options: RenderHookOptions<Props> = {},
) {
  const OuterWrapper = options.wrapper;
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nTestProvider>
        {OuterWrapper ? <OuterWrapper>{children}</OuterWrapper> : children}
      </I18nTestProvider>
    );
  }
  return renderReactHook(callback, { ...options, wrapper: Wrapper });
}
