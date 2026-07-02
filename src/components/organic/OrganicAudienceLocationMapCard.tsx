'use client';

import { Box, Card, Flex, Heading, Text } from '@radix-ui/themes';
import React from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import {
  Map,
  MapControls,
  MapMarker,
  type MapRef,
  MarkerContent,
  MarkerTooltip,
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

const COUNTRY_COORDS: Record<string, [number, number]> = {
  AE: [54.37, 24.45],
  AR: [-64.19, -34.61],
  AT: [14.55, 47.52],
  AU: [133.78, -25.27],
  BE: [4.47, 50.5],
  BR: [-51.93, -14.24],
  CA: [-106.35, 56.13],
  CH: [8.23, 46.82],
  CL: [-71.54, -35.68],
  CN: [104.2, 35.86],
  CO: [-74.3, 4.57],
  CZ: [15.47, 49.82],
  DE: [10.45, 51.17],
  DK: [9.5, 56.26],
  DZ: [1.66, 28.03],
  EG: [30.8, 26.82],
  ES: [-3.75, 40.46],
  ET: [40.49, 9.15],
  FI: [25.75, 61.92],
  FR: [2.21, 46.23],
  GB: [-3.44, 55.38],
  GR: [21.82, 39.07],
  HK: [114.17, 22.32],
  HU: [19.5, 47.16],
  ID: [113.92, -0.79],
  IE: [-8.24, 53.41],
  IL: [34.85, 31.05],
  IN: [78.96, 20.59],
  IT: [12.57, 41.87],
  JP: [138.25, 36.2],
  KE: [37.91, -0.02],
  KR: [127.77, 35.91],
  LK: [80.77, 7.87],
  MA: [-7.09, 31.79],
  MX: [-102.55, 23.63],
  MY: [101.98, 4.21],
  NG: [8.68, 9.08],
  NL: [5.29, 52.13],
  NO: [8.47, 60.47],
  NZ: [174.89, -40.9],
  PE: [-75.02, -9.19],
  PH: [121.77, 12.88],
  PK: [69.35, 30.38],
  PL: [19.15, 51.92],
  PT: [-8.22, 39.4],
  RO: [24.97, 45.94],
  RU: [105.32, 61.52],
  SA: [45.08, 23.89],
  SE: [18.64, 60.13],
  SG: [103.82, 1.35],
  TH: [100.99, 15.87],
  TR: [35.24, 38.96],
  TW: [120.96, 23.7],
  UA: [31.17, 48.38],
  US: [-95.71, 37.09],
  VN: [108.28, 14.06],
  ZA: [22.94, -30.56],
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
  const [mapZoom, setMapZoom] = React.useState(1.2);
  const [selectedCountryCode, setSelectedCountryCode] = React.useState<string | null>(null);
  const mapRef = React.useRef<MapRef | null>(null);

  const countryPoints = React.useMemo<LocationPoint[]>(
    () =>
      countryEntries
        .flatMap((entry) => {
          const code = entry.key.trim().toUpperCase();
          const coordinates =
            typeof entry.lng === 'number' && typeof entry.lat === 'number'
              ? ([entry.lng, entry.lat] as [number, number])
              : COUNTRY_COORDS[code];
          if (!coordinates) return [];
          return [
            {
              key: code,
              label: resolveCountryLabel(entry.label || code),
              value: entry.value,
              coordinates,
              countryCode: code,
            },
          ];
        })
        .slice(0, 45),
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

  const cityZoomThreshold = 2.35;
  const autoCityMode = mode === 'country' && mapZoom >= cityZoomThreshold && cityPoints.length > 0;
  const cityLayerVisible = mode === 'city' || autoCityMode;
  const countryLayerVisible = !cityLayerVisible;
  const viewMode = cityLayerVisible ? 'city' : 'country';
  const scopedCityPoints =
    autoCityMode && selectedCountryCode
      ? cityPoints.filter((point) => point.countryCode === selectedCountryCode)
      : cityPoints;
  const initialZoom = mode === 'country' ? (countryPoints.length > 8 ? 1.15 : 1.8) : 2.6;
  const mapCenter = React.useMemo(
    () => averageCenter(countryLayerVisible ? countryPoints : scopedCityPoints),
    [countryLayerVisible, countryPoints, scopedCityPoints],
  );
  const renderPoints = countryLayerVisible ? countryPoints : scopedCityPoints;
  const maxValue = renderPoints.reduce((max, point) => Math.max(max, point.value), 0);
  const activeEntries = countryLayerVisible
    ? countryEntries
    : autoCityMode && selectedCountryCode
      ? cityEntries.filter((entry) => entry.countryCode === selectedCountryCode)
      : cityEntries;
  const topEntries = [...activeEntries].sort((a, b) => b.value - a.value).slice(0, 8);

  React.useEffect(() => {
    setMapZoom(initialZoom);
  }, [initialZoom]);

  React.useEffect(() => {
    if (mode !== 'country') return;
    if (mapZoom >= cityZoomThreshold) return;
    if (!selectedCountryCode) return;
    setSelectedCountryCode(null);
  }, [cityZoomThreshold, mapZoom, mode, selectedCountryCode]);

  const handleCountryPointClick = React.useCallback(
    (point: LocationPoint) => {
      if (mode !== 'country' || cityPoints.length === 0) return;
      setSelectedCountryCode(point.countryCode ?? point.key);
      const targetZoom = Math.max(cityZoomThreshold + 0.5, 3.1);
      mapRef.current?.flyTo({
        center: point.coordinates,
        zoom: targetZoom,
        duration: 750,
        essential: true,
      });
    },
    [cityPoints.length, cityZoomThreshold, mode],
  );

  return (
    <Card variant="surface" className="border border-subtle bg-surface">
      <SectionHeader
        title="Audience Location"
        meta={
          <Text size="1" color="gray">
            Followers by {viewMode} ({timeframeLabel(timeframe)})
          </Text>
        }
        action={
          <div className="inline-flex rounded-md border border-subtle bg-muted/20 p-0.5">
            <button
              type="button"
              className={cn(
                'h-7 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
                mode === 'country' ? 'bg-accent/20 text-foreground' : 'text-muted-foreground',
              )}
              onClick={() => {
                setMode('country');
                setSelectedCountryCode(null);
              }}
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
              onClick={() => {
                setMode('city');
                setSelectedCountryCode(null);
              }}
              aria-label="Show city location data"
              aria-pressed={mode === 'city'}
            >
              City
            </button>
          </div>
        }
      />
      <Box p="3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="relative h-[clamp(240px,48svh,560px)] sm:h-[clamp(280px,52svh,580px)] overflow-hidden rounded-lg border border-subtle">
            {renderPoints.length === 0 ? (
              <div className="flex h-full items-center justify-center bg-muted/20 p-4 text-center">
                <Text size="2" color="gray">
                  {viewMode === 'country'
                    ? 'Country breakdown unavailable.'
                    : 'City breakdown unavailable.'}
                </Text>
              </div>
            ) : (
              <Map
                ref={mapRef}
                key={`audience-map-${mode}`}
                className="h-full w-full"
                theme="light"
                center={mapCenter}
                zoom={initialZoom}
                minZoom={0.7}
                maxZoom={8}
                attributionControl={false}
                onViewportChange={(viewport: { zoom: number }) => {
                  setMapZoom(viewport.zoom);
                }}
              >
                {renderPoints.map((point, index) => {
                  const band = pointBand(point.value, maxValue);
                  const radius = Math.max(
                    10,
                    Math.min(32, 10 + (point.value / Math.max(1, maxValue)) * 22),
                  );
                  return (
                    <MapMarker
                      key={`${viewMode}-${point.key}-${point.coordinates[0]}-${point.coordinates[1]}-${index}`}
                      longitude={point.coordinates[0]}
                      latitude={point.coordinates[1]}
                      onClick={() => {
                        if (countryLayerVisible) {
                          handleCountryPointClick(point);
                        }
                      }}
                    >
                      <MarkerContent>
                        <div
                          className={cn(
                            'rounded-full border transition-transform duration-200 hover:scale-110',
                            countryLayerVisible && 'cursor-zoom-in',
                            markerClassName(band),
                          )}
                          style={{ width: radius, height: radius }}
                        />
                      </MarkerContent>
                      <MarkerTooltip
                        popupClassName="audience-location-tooltip"
                        className="min-w-[170px] rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-white shadow-xl backdrop-blur-md"
                      >
                        <div className="space-y-1">
                          <Text as="div" size="1" weight="bold" className="text-white">
                            {point.label}
                          </Text>
                          <Text as="div" size="1" className="text-zinc-300">
                            {point.value.toLocaleString()} people
                          </Text>
                        </div>
                      </MarkerTooltip>
                    </MapMarker>
                  );
                })}
                <MapControls position="bottom-right" showZoom />
              </Map>
            )}

            <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-subtle bg-white/85 px-2 py-1.5 shadow-sm backdrop-blur">
              <Flex gap="2" align="center">
                <Text size="1">High</Text>
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <Text size="1">Medium</Text>
                <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />
                <Text size="1">Low</Text>
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
              </Flex>
            </div>

            {mode === 'country' && cityPoints.length > 0 ? (
              <div className="pointer-events-none absolute right-3 top-3 hidden rounded-lg border border-subtle bg-white/85 px-2 py-1.5 shadow-sm backdrop-blur sm:block">
                <Text size="1" color="gray">
                  {autoCityMode
                    ? selectedCountryCode
                      ? `City layer: ${selectedCountryCode} (zoom ${mapZoom.toFixed(1)}x)`
                      : `City view active (zoom ${mapZoom.toFixed(1)}x)`
                    : `Country layer active. Click a country dot or zoom to ${cityZoomThreshold.toFixed(1)}x.`}
                </Text>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-subtle bg-white/70 p-3">
            <Heading size="2" mb="2">
              Top {viewMode === 'country' ? 'countries' : 'cities'}
            </Heading>
            <div className="space-y-2 overflow-y-auto pr-1 xl:max-h-[clamp(180px,40svh,360px)]">
              {topEntries.length === 0 ? (
                <Text size="2" color="gray">
                  No entries available.
                </Text>
              ) : (
                topEntries.map((entry, index) => (
                  <Flex key={`${viewMode}-${entry.key}-${index}`} justify="between" align="center">
                    <Text size="2" color="gray" className="truncate pr-2">
                      {viewMode === 'country'
                        ? resolveCountryLabel(entry.label || entry.key)
                        : entry.label}
                    </Text>
                    <Text size="2" weight="medium">
                      {entry.value.toLocaleString()}
                    </Text>
                  </Flex>
                ))
              )}
            </div>
            {viewMode === 'city' && activeEntries.length > renderPoints.length ? (
              <Text size="1" color="gray" mt="3">
                Mapped {renderPoints.length}/{activeEntries.length} cities with known coordinates.
              </Text>
            ) : null}
          </div>
        </div>
      </Box>
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
    </Card>
  );
}
