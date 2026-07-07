import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature as topojsonFeature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-110m.json';
import { alpha2FromNumericId } from './isoNumericToAlpha2';

export type AudienceCountryDatum = {
  alpha2: string;
  label?: string;
  value: number;
};

export type AudienceFeatureProps = {
  name: string;
  alpha2: string | null;
  value: number;
  hasData: boolean;
};

type BaseWorld = FeatureCollection<Geometry, { name?: string }>;

// world-atlas topology → GeoJSON, computed once at module load. The whole
// audience map card is dynamically imported, so this lands in a lazy chunk.
const WORLD: BaseWorld = topojsonFeature(
  worldTopo,
  (worldTopo as { objects: { countries: unknown } }).objects.countries,
) as unknown as BaseWorld;

/**
 * Join alpha-2-keyed audience counts onto the world geometry. Every country
 * feature is returned (unmatched ones get value 0 / hasData false so they
 * render as the "no data" tone), with `value`/`name`/`alpha2` on properties.
 */
export function buildAudienceChoropleth(
  data: AudienceCountryDatum[],
): FeatureCollection<Geometry, AudienceFeatureProps> {
  const valueByAlpha2 = new Map<string, { value: number; label?: string }>();
  for (const datum of data) {
    const code = datum.alpha2.trim().toUpperCase();
    if (!code) continue;
    const prev = valueByAlpha2.get(code);
    if (!prev || datum.value > prev.value) {
      valueByAlpha2.set(code, { value: datum.value, label: datum.label });
    }
  }

  const features: Feature<Geometry, AudienceFeatureProps>[] = WORLD.features.map((entry) => {
    const alpha2 = alpha2FromNumericId(entry.id as string | number | undefined);
    const match = alpha2 ? valueByAlpha2.get(alpha2) : undefined;
    return {
      type: 'Feature',
      id: entry.id,
      geometry: entry.geometry,
      properties: {
        name: match?.label ?? entry.properties?.name ?? alpha2 ?? 'Unknown',
        alpha2,
        value: match?.value ?? 0,
        hasData: Boolean(match),
      },
    };
  });

  return { type: 'FeatureCollection', features };
}

export function maxAudienceValue(fc: FeatureCollection<Geometry, AudienceFeatureProps>): number {
  return fc.features.reduce((max, f) => Math.max(max, f.properties.value), 0);
}
