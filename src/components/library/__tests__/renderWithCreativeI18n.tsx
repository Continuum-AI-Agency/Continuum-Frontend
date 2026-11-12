import {
  type RenderHookOptions,
  type RenderOptions,
  renderHook as renderHookInDom,
  render as renderInDom,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nTestProvider } from '@/i18n/__tests__/render';

export * from '@testing-library/react';

function withI18n(Wrapper?: RenderOptions['wrapper']) {
  return function CreativeI18nTestProvider({ children }: { children: ReactNode }) {
    return (
      <I18nTestProvider>{Wrapper ? <Wrapper>{children}</Wrapper> : children}</I18nTestProvider>
    );
  };
}

export function render(ui: ReactNode, options: RenderOptions = {}) {
  return renderInDom(ui, { ...options, wrapper: withI18n(options.wrapper) });
}

export function renderHook<Result, Props>(
  callback: (initialProps: Props) => Result,
  options?: RenderHookOptions<Props>,
) {
  return renderHookInDom(callback, {
    ...options,
    wrapper: withI18n(options?.wrapper),
  });
}
