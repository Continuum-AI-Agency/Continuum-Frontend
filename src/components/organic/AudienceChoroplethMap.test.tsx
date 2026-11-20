import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider, useTranslations } from 'next-intl';
import {
  type ChoroplethContextValue,
  ChoroplethProvider,
  ChoroplethTooltip,
} from '@/components/charts/choropleth';
import { render } from '@/i18n/__tests__/render';
import { buildAudienceChoropleth } from '@/lib/geo/worldChoropleth';
import commonEn from '../../../messages/common/en.json';
import commonEs from '../../../messages/common/es.json';
import commonPt from '../../../messages/common/pt-BR.json';
import en from '../../../messages/organic/en.json';
import es from '../../../messages/organic/es.json';
import pt from '../../../messages/organic/pt-BR.json';
import { audienceTooltipPresentation } from './AudienceChoroplethMap';

const portals: HTMLDivElement[] = [];
afterEach(() => {
  cleanup();
  for (const portal of portals) portal.remove();
  portals.length = 0;
});

function Fixture({ context }: { context: ChoroplethContextValue }) {
  const t = useTranslations('organic');
  return (
    <ChoroplethProvider value={context}>
      <ChoroplethTooltip
        {...audienceTooltipPresentation(t)}
        getFeatureName={(feature) => String(feature.properties.name)}
        getFeatureValue={(feature) => Number(feature.properties.value)}
      />
    </ChoroplethProvider>
  );
}

function contextFor(value: number): ChoroplethContextValue {
  const collection = buildAudienceChoropleth([
    { alpha2: 'BR', label: 'Authored country name', value },
  ]);
  const features = collection.features.map((feature) => ({
    ...feature,
    properties: { ...feature.properties },
  }));
  const index = features.findIndex((feature) => feature.properties.alpha2 === 'BR');
  const portal = document.createElement('div');
  document.body.append(portal);
  portals.push(portal);
  return {
    features,
    featureCollection: { ...collection, features },
    featurePaths: [],
    pathGenerator: () => undefined,
    rawPathGenerator: () => null,
    projectPoint: () => [0, 0],
    width: 400,
    height: 300,
    innerWidth: 400,
    innerHeight: 300,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    containerRef: { current: portal },
    isLoaded: true,
    animationDuration: 0,
    revealEpoch: 0,
    hoveredFeatureIndex: index,
    setHoveredFeatureIndex: () => {},
    tooltipData: { featureIndex: index, feature: features[index], x: 10, y: 10 },
    setTooltipData: () => {},
  };
}

for (const [locale, messages, common] of [
  ['en', en, commonEn],
  ['pt-BR', pt, commonPt],
  ['es', es, commonEs],
] as const) {
  const t = createTranslator({
    locale,
    namespace: 'organic',
    messages: { organic: messages },
    onError: (error) => {
      throw error;
    },
  });
  describe(`Audience tooltip ${locale}`, () => {
    for (const value of [1, 12500.25, 0]) {
      test(`localizes the actual tooltip for ${value} followers without changing values or country names`, () => {
        const context = contextFor(value);
        const before = structuredClone(context.featureCollection);
        render(
          <NextIntlClientProvider
            locale={locale}
            timeZone="UTC"
            messages={{ organic: messages, common }}
            onError={(error) => {
              throw error;
            }}
          >
            <Fixture context={context} />
          </NextIntlClientProvider>,
        );
        expect(document.body.textContent).toContain('Authored country name');
        expect(document.body.textContent).toContain(t('audience_545c023'));
        expect(document.body.textContent).toContain(
          value > 0 ? t('audienceFollowers', { count: value }) : t('audienceNoData'),
        );
        if (value > 0)
          expect(document.body.textContent).toContain(new Intl.NumberFormat(locale).format(value));
        expect(context.featureCollection).toEqual(before);
      });
    }
  });
}
