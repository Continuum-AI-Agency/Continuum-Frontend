'use client';

// Audience by location. Country mode paints the world choropleth; city mode
// pins the mapped cities on MapLibre, each carrying its name as a persistent
// label (the tooltip alone left the map a field of anonymous dots).
//
// The city layer only plots cities present in CITY_COORDS — the footer states
// how many of the reported cities that leaves unmapped.

import React from 'react';
import { AudienceChoroplethMap } from '@/components/organic/AudienceChoroplethMap';
import { SectionHeader } from '@/components/shared/SectionHeader';
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  MarkerTooltip,
  useMap,
} from '@/components/ui/map';
import { cn } from '@/lib/utils';

type DemographicEntry = {
  key: string;
  label: string;
  value: number;
  lat?: number;
  lng?: number;
  countryCode?: string;
};

type LocationPoint = {
  key: string;
  label: string;
  value: number;
  coordinates: [number, number];
  countryCode?: string;
};

type Props = {
  countryEntries: DemographicEntry[];
  cityEntries: DemographicEntry[];
  timeframe?: string;
};

const CITY_COORDS: Record<string, [number, number]> = {
  amsterdam: [4.9, 52.37],
  athens: [23.73, 37.98],
  atlanta: [-84.39, 33.75],
  bangalore: [77.59, 12.97],
  bangkok: [100.5, 13.76],
  barcelona: [2.17, 41.38],
  beijing: [116.4, 39.9],
  berlin: [13.41, 52.52],
  bogota: [-74.07, 4.71],
  boston: [-71.06, 42.36],
  brussels: [4.35, 50.85],
  'buenos aires': [-58.38, -34.6],
  cairo: [31.24, 30.04],
  'cape town': [18.42, -33.92],
  chicago: [-87.63, 41.88],
  dallas: [-96.8, 32.78],
  delhi: [77.1, 28.7],
  denver: [-104.99, 39.74],
  dubai: [55.27, 25.2],
  dublin: [-6.26, 53.35],
  frankfurt: [8.68, 50.11],
  'hong kong': [114.17, 22.32],
  houston: [-95.37, 29.76],
  istanbul: [28.98, 41.01],
  jakarta: [106.85, -6.21],
  johannesburg: [28.05, -26.2],
  lagos: [3.38, 6.52],
  lima: [-77.04, -12.05],
  lisbon: [-9.14, 38.72],
  london: [-0.13, 51.51],
  'los angeles': [-118.24, 34.05],
  madrid: [-3.7, 40.42],
  manila: [120.98, 14.6],
  melbourne: [144.96, -37.81],
  'mexico city': [-99.13, 19.43],
  miami: [-80.19, 25.76],
  milan: [9.19, 45.46],
  montreal: [-73.57, 45.5],
  mumbai: [72.88, 19.08],
  munich: [11.58, 48.14],
  nairobi: [36.82, -1.29],
  'new york': [-74.01, 40.71],
  paris: [2.35, 48.86],
  philadelphia: [-75.17, 39.95],
  phoenix: [-112.07, 33.45],
  prague: [14.44, 50.08],
  'rio de janeiro': [-43.17, -22.91],
  rome: [12.5, 41.9],
  'san francisco': [-122.42, 37.77],
  santiago: [-70.67, -33.45],
  'sao paulo': [-46.63, -23.55],
  seattle: [-122.33, 47.61],
  seoul: [126.98, 37.57],
  shanghai: [121.47, 31.23],
  singapore: [103.82, 1.35],
  stockholm: [18.07, 59.33],
  sydney: [151.21, -33.87],
  taipei: [121.56, 25.03],
  tokyo: [139.69, 35.68],
  toronto: [-79.38, 43.65],
  vancouver: [-123.12, 49.28],
  vienna: [16.37, 48.21],
  warsaw: [21.01, 52.23],
  washington: [-77.04, 38.91],
  zurich: [8.54, 47.37],
};

const TIMEFRAME_LABELS: Record<string, string> = {
  this_week: 'Last 7 days',
  this_month: 'Last 30 days',
  prev_month: 'Previous month',
  last_14_days: 'Last 14 days',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
};

function normalizeCityKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function timeframeLabel(value?: string) {
  if (!value) return 'Timeframe unavailable';
  return TIMEFRAME_LABELS[value] ?? value.replace(/_/g, ' ');
}

function resolveCountryLabel(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return value;
  try {
    const formatter = new Intl.DisplayNames(['en'], { type: 'region' });
    return formatter.of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

function pointBand(value: number, maxValue: number) {
  if (maxValue <= 0) return 'low';
  const ratio = value / maxValue;
  if (ratio >= 0.66) return 'high';
  if (ratio >= 0.33) return 'medium';
  return 'low';
}

function markerClassName(band: 'high' | 'medium' | 'low') {
  if (band === 'high')
    return 'border-emerald-200 bg-emerald-400/80 shadow-[0_0_0_10px_rgba(16,185,129,0.15)]';
  if (band === 'medium')
    return 'border-teal-200 bg-teal-400/80 shadow-[0_0_0_8px_rgba(45,212,191,0.14)]';
  return 'border-cyan-200 bg-cyan-400/75 shadow-[0_0_0_6px_rgba(34,211,238,0.12)]';
}

function resolveCityCoordinates(value: string): [number, number] | null {
  const candidates = [value, value.split(',')[0] ?? '', value.split('-')[0] ?? '']
    .map((candidate) => normalizeCityKey(candidate))
    .filter((candidate) => candidate.length > 0);
  for (const candidate of candidates) {
    const coords = CITY_COORDS[candidate];
    if (coords) return coords;
  }
  return null;
}

// Instagram reports "City, Region". The region is noise on a map that already shows
// the region — the marker wears the city, the tooltip and the list keep the full name.
export function shortCityName(label: string): string {
  const [city] = label.split(',');
  return (city ?? label).trim() || label;
}

export function markerRadius(value: number, maxValue: number): number {
  return Math.max(10, Math.min(32, 10 + (value / Math.max(1, maxValue)) * 22));
}

// Label geometry, in screen pixels. The chip is a single nowrap line of text-2xs
// semibold inside px-1.5 + a 1px border, so its width tracks the character count.
const LABEL_CHAR_WIDTH = 6.2;
const LABEL_CHROME_WIDTH = 16;
const LABEL_HEIGHT = 17;
const LABEL_GAP = 4;

export type CityLabelCandidate = {
  key: string;
  text: string;
  value: number;
  /** Screen position of the marker's centre, from map.project(). */
  x: number;
  y: number;
  radius: number;
};

type LabelBox = { left: number; right: number; top: number; bottom: number };

function labelBox(candidate: CityLabelCandidate): LabelBox {
  const width = candidate.text.length * LABEL_CHAR_WIDTH + LABEL_CHROME_WIDTH;
  const top = candidate.y + candidate.radius / 2 + LABEL_GAP;
  return {
    left: candidate.x - width / 2,
    right: candidate.x + width / 2,
    top,
    bottom: top + LABEL_HEIGHT,
  };
}

function overlaps(a: LabelBox, b: LabelBox): boolean {
  return (
    a.left < b.right + LABEL_GAP &&
    a.right + LABEL_GAP > b.left &&
    a.top < b.bottom + LABEL_GAP &&
    a.bottom + LABEL_GAP > b.top
  );
}

// Which cities get to wear their name at the current viewport. Greedy placement in
// follower order: the biggest city is placed first and can never be the one dropped,
// and any label whose box would collide with one already placed stays a bare dot (its
// name is still one hover away). Recomputed on every pan/zoom, so a dense metro like
// Buenos Aires declutters itself as the user zooms in.
export function selectVisibleLabels(candidates: CityLabelCandidate[]): Set<string> {
  const placed: LabelBox[] = [];
  const visible = new Set<string>();
  for (const candidate of [...candidates].sort((a, b) => b.value - a.value)) {
    const box = labelBox(candidate);
    if (placed.some((other) => overlaps(box, other))) continue;
    placed.push(box);
    visible.add(candidate.key);
  }
  return visible;
}

// Lives inside <Map> so it can read the live map instance and reproject on every move.
function CityLabelPlacement({
  points,
  maxValue,
  onPlace,
}: {
  points: LocationPoint[];
  maxValue: number;
  onPlace: (keys: Set<string>) => void;
}) {
  const { map, isLoaded } = useMap();

  React.useEffect(() => {
    if (!map || !isLoaded) return;

    const recompute = () => {
      const projected = points.map((point) => {
        const { x, y } = map.project(point.coordinates);
        return {
          key: point.key,
          text: shortCityName(point.label),
          value: point.value,
          x,
          y,
          radius: markerRadius(point.value, maxValue),
        };
      });
      onPlace(selectVisibleLabels(projected));
    };

    recompute();
    map.on('move', recompute);
    map.on('zoom', recompute);
    map.on('resize', recompute);
    return () => {
      map.off('move', recompute);
      map.off('zoom', recompute);
      map.off('resize', recompute);
    };
  }, [map, isLoaded, points, maxValue, onPlace]);

  return null;
}

function averageCenter(points: LocationPoint[]): [number, number] {
  if (points.length === 0) return [8, 24];
  const [sumLng, sumLat] = points.reduce(
    (acc, point) => [acc[0] + point.coordinates[0], acc[1] + point.coordinates[1]],
    [0, 0],
  );
  return [sumLng / points.length, sumLat / points.length];
}

export function OrganicAudienceLocationMapCard({ countryEntries, cityEntries, timeframe }: Props) {
  const [mode, setMode] = React.useState<'country' | 'city'>('country');

  const countryChoroplethData = React.useMemo(
    () =>
      countryEntries.map((entry) => ({
        alpha2: entry.key,
        label: resolveCountryLabel(entry.label || entry.key),
        value: entry.value,
      })),
    [countryEntries],
  );

  const cityPoints = React.useMemo<LocationPoint[]>(
    () =>
      cityEntries
        .flatMap((entry) => {
          const coordinates =
            typeof entry.lng === 'number' && typeof entry.lat === 'number'
              ? ([entry.lng, entry.lat] as [number, number])
              : resolveCityCoordinates(entry.label || entry.key);
          if (!coordinates) return [];
          return [
            {
              key: entry.key,
              label: entry.label,
              value: entry.value,
              coordinates,
              countryCode: entry.countryCode,
            },
          ];
        })
        .slice(0, 45),
    [cityEntries],
  );

  const countryLayerVisible = mode === 'country';
  const mapCenter = React.useMemo(() => averageCenter(cityPoints), [cityPoints]);
  const maxValue = cityPoints.reduce((max, point) => Math.max(max, point.value), 0);
  const [labelledCities, setLabelledCities] = React.useState<Set<string>>(new Set());

  // Placement runs on every map move; only re-render when the visible set actually changes.
  const handleLabelPlacement = React.useCallback((keys: Set<string>) => {
    setLabelledCities((current) => {
      if (current.size === keys.size && [...keys].every((key) => current.has(key))) {
        return current;
      }
      return keys;
    });
  }, []);
  const activeEntries = countryLayerVisible ? countryEntries : cityEntries;
  const topEntries = [...activeEntries].sort((a, b) => b.value - a.value).slice(0, 8);

  return (
    <div
      data-tour-id="organic-audience-location"
      className="rounded-lg border border-border bg-surface"
    >
      <SectionHeader
        title="Audience Location"
        meta={
          <span className="text-xs text-muted-foreground">
            Followers by {mode} ({timeframeLabel(timeframe)})
          </span>
        }
        action={
          <div className="inline-flex rounded-md border border-border bg-muted/20 p-0.5">
            <button
              type="button"
              className={cn(
                'h-7 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
                mode === 'country' ? 'bg-accent/20 text-foreground' : 'text-muted-foreground',
              )}
              onClick={() => setMode('country')}
              aria-label="Show country location data"
              aria-pressed={mode === 'country'}
            >
              Country
            </button>
            <button
              type="button"
              className={cn(
                'h-7 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
                mode === 'city' ? 'bg-accent/20 text-foreground' : 'text-muted-foreground',
              )}
              onClick={() => setMode('city')}
              aria-label="Show city location data"
              aria-pressed={mode === 'city'}
            >
              City
            </button>
          </div>
        }
      />
      <div className="p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="relative h-[clamp(240px,48svh,560px)] sm:h-[clamp(280px,52svh,580px)] overflow-hidden rounded-lg border border-border">
            {countryLayerVisible ? (
              countryChoroplethData.length === 0 ? (
                <div className="flex h-full items-center justify-center bg-muted/20 p-4 text-center">
                  <span className="text-sm text-muted-foreground">
                    Country breakdown unavailable.
                  </span>
                </div>
              ) : (
                <AudienceChoroplethMap data={countryChoroplethData} className="bg-card" />
              )
            ) : cityPoints.length === 0 ? (
              <div className="flex h-full items-center justify-center bg-muted/20 p-4 text-center">
                <span className="text-sm text-muted-foreground">City breakdown unavailable.</span>
              </div>
            ) : (
              <Map
                key="audience-city-map"
                className="h-full w-full"
                theme="light"
                center={mapCenter}
                zoom={2.6}
                minZoom={0.7}
                maxZoom={8}
                attributionControl={false}
                // The map sits inside the metrics tab's one scroll container. Plain
                // wheel must keep scrolling that container; zoom is ctrl/⌘ + wheel,
                // the zoom controls, or a pinch.
                cooperativeGestures
              >
                <CityLabelPlacement
                  points={cityPoints}
                  maxValue={maxValue}
                  onPlace={handleLabelPlacement}
                />
                {cityPoints.map((point, index) => {
                  const band = pointBand(point.value, maxValue);
                  const radius = markerRadius(point.value, maxValue);
                  return (
                    <MapMarker
                      key={`city-${point.key}-${point.coordinates[0]}-${point.coordinates[1]}-${index}`}
                      longitude={point.coordinates[0]}
                      latitude={point.coordinates[1]}
                    >
                      <MarkerContent>
                        <div
                          className={cn(
                            'rounded-full border transition-transform duration-200 hover:scale-110',
                            markerClassName(band),
                          )}
                          style={{ width: radius, height: radius }}
                        />
                        {labelledCities.has(point.key) ? (
                          <MarkerLabel
                            position="bottom"
                            className="pointer-events-none rounded-full border border-white/70 bg-white/90 px-1.5 py-0.5 font-semibold text-zinc-900 shadow-sm"
                          >
                            {shortCityName(point.label)}
                          </MarkerLabel>
                        ) : null}
                      </MarkerContent>
                      <MarkerTooltip
                        popupClassName="audience-location-tooltip"
                        className="min-w-[170px] rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-white shadow-xl backdrop-blur-md"
                      >
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-white">{point.label}</div>
                          <div className="text-xs text-zinc-300">
                            {point.value.toLocaleString()} people
                          </div>
                        </div>
                      </MarkerTooltip>
                    </MapMarker>
                  );
                })}
                <MapControls position="bottom-right" showZoom />
              </Map>
            )}

            <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-border bg-white/85 px-2 py-1.5 shadow-sm backdrop-blur">
              {countryLayerVisible ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Fewer</span>
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: 'var(--chart-scale-02)' }}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: 'var(--chart-scale-03)' }}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: 'var(--chart-scale-04)' }}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: 'var(--chart-scale-05)' }}
                  />
                  <span className="text-xs text-muted-foreground">More followers</span>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <span className="text-xs">High</span>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="text-xs">Medium</span>
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />
                  <span className="text-xs">Low</span>
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-white/70 p-3">
            <h3 className="mb-2 text-sm font-semibold">
              Top {countryLayerVisible ? 'countries' : 'cities'}
            </h3>
            <div className="space-y-2 pr-1">
              {topEntries.length === 0 ? (
                <span className="text-sm text-muted-foreground">No entries available.</span>
              ) : (
                topEntries.map((entry, index) => (
                  <div
                    key={`${mode}-${entry.key}-${index}`}
                    className="flex justify-between items-center"
                  >
                    <span className="truncate pr-2 text-sm text-muted-foreground">
                      {countryLayerVisible
                        ? resolveCountryLabel(entry.label || entry.key)
                        : entry.label}
                    </span>
                    <span className="text-sm font-medium">{entry.value.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
            {!countryLayerVisible && cityEntries.length > cityPoints.length ? (
              <span className="mt-3 block text-xs text-muted-foreground">
                Mapped {cityPoints.length}/{cityEntries.length} cities with known coordinates.
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .audience-location-tooltip.maplibregl-popup .maplibregl-popup-content {
          background: transparent;
          padding: 0;
          border-radius: 0;
          box-shadow: none;
        }

        .audience-location-tooltip.maplibregl-popup .maplibregl-popup-tip {
          border-top-color: rgba(9, 9, 11, 0.95);
        }
      `,
        }}
      />
    </div>
  );
}
