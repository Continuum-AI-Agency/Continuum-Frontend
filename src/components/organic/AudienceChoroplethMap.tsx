'use client';

import type { FeatureCollection, Geometry } from 'geojson';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  ChoroplethChart,
  type ChoroplethFeature,
  ChoroplethFeatureComponent,
  type ChoroplethFeatureProperties,
  ChoroplethGraticule,
  ChoroplethTooltip,
  type ChoroplethTooltipProps,
} from '@/components/charts/choropleth';
import {
  type AudienceCountryDatum,
  type AudienceFeatureProps,
  buildAudienceChoropleth,
  maxAudienceValue,
} from '@/lib/geo/worldChoropleth';
import { cn } from '@/lib/utils';

// Brand violet sequential ramp, low→high (defined in globals.css, light + dark).
const SCALE_VARS = [
  'var(--chart-scale-01)',
  'var(--chart-scale-02)',
  'var(--chart-scale-03)',
  'var(--chart-scale-04)',
  'var(--chart-scale-05)',
] as const;

function audienceProps(feature: ChoroplethFeature): AudienceFeatureProps {
  return feature.properties as unknown as AudienceFeatureProps;
}

function bucketColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return 'var(--muted)';
  const step = Math.min(4, Math.max(0, Math.ceil((value / max) * 5) - 1));
  return SCALE_VARS[step] ?? SCALE_VARS[0];
}

/** Display-only callbacks: follower values and feature identities remain source data. */
export function audienceTooltipPresentation(
  translate: ReturnType<typeof useTranslations<'organic'>>,
): Pick<ChoroplethTooltipProps, 'formatValue' | 'valueLabel'> {
  return {
    formatValue: (value) =>
      value > 0 ? translate('audienceFollowers', { count: value }) : translate('audienceNoData'),
    valueLabel: translate('audience_545c023'),
  };
}

// A shaded world choropleth of followers by country. Countries with no audience
// data render in the muted "no data" tone; the rest ramp through the brand
// violet scale. Hover reveals the country + follower count.
export function AudienceChoroplethMap({
  data,
  className,
}: {
  data: AudienceCountryDatum[];
  className?: string;
}) {
  const uiText = useTranslations('organic');
  const tooltip = useMemo(() => audienceTooltipPresentation(uiText), [uiText]);
  const featureCollection = useMemo(() => buildAudienceChoropleth(data), [data]);
  const max = useMemo(() => maxAudienceValue(featureCollection), [featureCollection]);

  return (
    <ChoroplethChart
      aspectRatio="auto"
      center={[0, 32]}
      className={cn('h-full w-full', className)}
      data={
        featureCollection as unknown as FeatureCollection<Geometry, ChoroplethFeatureProperties>
      }
      zoomEnabled
      zoomMax={6}
      zoomMin={0.8}
    >
      <ChoroplethGraticule stroke="var(--chart-grid)" strokeWidth={0.4} />
      <ChoroplethFeatureComponent
        getFeatureColor={(feature) => bucketColor(audienceProps(feature).value, max)}
        stroke="var(--background)"
        strokeWidth={0.4}
      />
      <ChoroplethTooltip
        {...tooltip}
        getFeatureName={(feature) => audienceProps(feature).name}
        getFeatureValue={(feature) => audienceProps(feature).value}
      />
    </ChoroplethChart>
  );
}
