import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider, useMessages, useTranslations } from 'next-intl';
import commonEn from '../../messages/common/en.json';
import commonPt from '../../messages/common/pt-BR.json';
import studioEn from '../../messages/studio/en.json';
import studioPt from '../../messages/studio/pt-BR.json';
import { loadMessages } from './catalogs';
import { uiLocales } from './config';
import { LazyFeatureMessages } from './LazyFeatureMessages';
import { lazyCatalogLoaders } from './lazy-catalogs.generated';
import manifest from './message-scopes.generated.json';
import { selectMessages } from './selectMessages';

afterEach(cleanup);
const namespaces = ['studio'] as const;
const preloadReady = async () => {};

function StudioProbe() {
  const t = useTranslations('studio');
  return <p>{t('compositionPreparing')}</p>;
}

function CatalogProbe() {
  return <output data-testid="catalog">{JSON.stringify(useMessages())}</output>;
}

describe('active locale and feature delivery', () => {
  const scopes = Object.keys(lazyCatalogLoaders) as Array<keyof typeof lazyCatalogLoaders>;
  for (const scope of scopes) {
    for (const locale of uiLocales) {
      it(`loads only ${locale} for ${scope}`, async () => {
        const imports = scopes.flatMap((feature) =>
          uiLocales.map((language) => ({
            feature,
            language,
            spy: spyOn(lazyCatalogLoaders[feature], language),
          })),
        );
        try {
          const expected = selectMessages(await loadMessages(locale), manifest.lazyScopes[scope]);
          render(
            <NextIntlClientProvider locale={locale} timeZone="UTC" messages={{}}>
              <LazyFeatureMessages
                scope={scope}
                namespaces={Object.keys(manifest.lazyScopes[scope])}
                preload={preloadReady}
                loading={<p>Waiting for feature</p>}
              >
                <CatalogProbe />
              </LazyFeatureMessages>
            </NextIntlClientProvider>,
          );
          await waitFor(() =>
            expect(JSON.parse(screen.getByTestId('catalog').textContent ?? 'null')).toEqual(
              expected,
            ),
          );
          for (const { feature, language, spy } of imports) {
            expect(spy).toHaveBeenCalledTimes(feature === scope && language === locale ? 1 : 0);
          }
        } finally {
          for (const { spy } of imports) spy.mockRestore();
        }
      });
    }
  }
});

describe('lazy feature catalogs', () => {
  it('waits for feature code and the real active-language catalog before rendering children', async () => {
    let release: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const preload = mock(() => ready);
    render(
      <NextIntlClientProvider locale="pt-BR" timeZone="UTC" messages={{ common: commonPt }}>
        <LazyFeatureMessages
          scope="app/[locale]/(post-auth)/ai-studio/AIStudioClient.tsx"
          namespaces={namespaces}
          preload={preload}
          loading={<p>Waiting for feature</p>}
        >
          <StudioProbe />
        </LazyFeatureMessages>
      </NextIntlClientProvider>,
    );
    expect(preload).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Waiting for feature')).toBeTruthy();
    expect(screen.queryByText(studioPt.compositionPreparing)).toBeNull();
    release?.();
    await waitFor(() => expect(screen.getByText(studioPt.compositionPreparing)).toBeTruthy());
    expect(screen.queryByText(studioEn.compositionPreparing)).toBeNull();
  });
  it('replaces language-specific messages after a locale change', async () => {
    function View({ locale }: { locale: 'en' | 'pt-BR' }) {
      return (
        <NextIntlClientProvider
          locale={locale}
          timeZone="UTC"
          messages={{ common: locale === 'en' ? commonEn : commonPt }}
        >
          <LazyFeatureMessages
            scope="app/[locale]/(post-auth)/ai-studio/AIStudioClient.tsx"
            namespaces={namespaces}
            preload={preloadReady}
            loading={<p>Waiting for feature</p>}
          >
            <StudioProbe />
          </LazyFeatureMessages>
        </NextIntlClientProvider>
      );
    }
    const view = render(<View locale="en" />);
    await waitFor(() => expect(screen.getByText(studioEn.compositionPreparing)).toBeTruthy());
    view.rerender(<View locale="pt-BR" />);
    await waitFor(() => expect(screen.getByText(studioPt.compositionPreparing)).toBeTruthy());
    expect(screen.queryByText(studioEn.compositionPreparing)).toBeNull();
  });
});
