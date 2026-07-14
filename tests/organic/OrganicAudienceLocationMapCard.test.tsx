import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';

// The real map is MapLibre (WebGL) and the real choropleth is an SVG chart — neither
// runs in the DOM test environment. The stubs keep the primitives' contract: the
// marker's own content renders into the map, while MarkerTooltip only ever paints into
// a MapLibre popup on hover, so it contributes nothing to the resting DOM. That is
// exactly the distinction bug #180 turned on.
//
// `useMap` hands back a projection so the card's label placement runs for real here:
// a city's [lng, lat] projects 1:1 to screen pixels, the same space the browser uses.
mock.module('@/components/ui/map', () => ({
  Map: ({ children }: { children?: ReactNode }) => <div data-testid="city-map">{children}</div>,
  MapControls: () => null,
  MapMarker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  MarkerContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  MarkerLabel: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <span className={className} data-testid="marker-label">
      {children}
    </span>
  ),
  MarkerTooltip: () => null,
  useMap: () => ({
    isLoaded: true,
    map: {
      project: ([lng, lat]: [number, number]) => ({ x: lng, y: lat }),
      on: () => {},
      off: () => {},
    },
  }),
}));

mock.module('@/components/organic/AudienceChoroplethMap', () => ({
  AudienceChoroplethMap: () => <div data-testid="choropleth" />,
}));

const { OrganicAudienceLocationMapCard, selectVisibleLabels, shortCityName } = await import(
  '@/components/organic/OrganicAudienceLocationMapCard'
);

afterEach(cleanup);

const COUNTRY_ENTRIES = [
  { key: 'AR', label: 'AR', value: 4200 },
  { key: 'CO', label: 'CO', value: 900 },
];

// Real prod shape: Instagram reports "City, Region", each entry carrying its geocoded
// lat/lng. Buenos Aires and Bogotá are far apart; Medellín has no coordinates at all.
const CITY_ENTRIES = [
  {
    key: 'buenos-aires',
    label: 'Buenos Aires, Ciudad Autónoma de Buenos Aires',
    value: 3100,
    lng: 100,
    lat: 100,
  },
  { key: 'bogota', label: 'Bogotá, Distrito Especial', value: 1200, lng: 400, lat: 400 },
  { key: 'medellin', label: 'Medellín, Antioquia', value: 800 },
];

function renderCard(cityEntries = CITY_ENTRIES) {
  return render(
    <OrganicAudienceLocationMapCard
      countryEntries={COUNTRY_ENTRIES}
      cityEntries={cityEntries}
      timeframe="last_30_days"
    />,
  );
}

function switchToCityMode() {
  fireEvent.click(screen.getByRole('button', { name: 'Show city location data' }));
}

function candidate(key: string, text: string, value: number, x: number, y: number) {
  return { key, text, value, x, y, radius: 12 };
}

describe('selectVisibleLabels', () => {
  test('keeps every label when nothing collides', () => {
    const visible = selectVisibleLabels([
      candidate('a', 'Buenos Aires', 2506, 100, 100),
      candidate('b', 'Santiago', 843, 400, 400),
    ]);

    expect([...visible].sort()).toEqual(['a', 'b']);
  });

  test('drops the smaller city when two labels would overprint, never the biggest', () => {
    // Río de la Plata reality: La Plata sits a few pixels from Buenos Aires.
    const visible = selectVisibleLabels([
      candidate('la-plata', 'La Plata', 210, 104, 102),
      candidate('buenos-aires', 'Buenos Aires', 2506, 100, 100),
    ]);

    expect(visible.has('buenos-aires')).toBe(true);
    expect(visible.has('la-plata')).toBe(false);
  });

  test('a city clear of the pile still gets its name even when the pile is dense', () => {
    const visible = selectVisibleLabels([
      candidate('buenos-aires', 'Buenos Aires', 2506, 100, 100),
      candidate('la-plata', 'La Plata', 210, 104, 102),
      candidate('mar-del-plata', 'Mar del Plata', 190, 108, 104),
      candidate('rosario', 'Rosario', 262, 260, 260),
    ]);

    expect(visible.has('buenos-aires')).toBe(true);
    expect(visible.has('rosario')).toBe(true);
    expect(visible.size).toBe(2);
  });

  test('resolves a tie by placing one rather than dropping both', () => {
    const visible = selectVisibleLabels([
      candidate('a', 'Alpha', 100, 100, 100),
      candidate('b', 'Beta', 100, 102, 100),
    ]);

    expect(visible.size).toBe(1);
  });
});

describe('shortCityName', () => {
  test('drops the region the map already shows', () => {
    expect(shortCityName('Buenos Aires, Ciudad Autónoma de Buenos Aires')).toBe('Buenos Aires');
    expect(shortCityName('Riga')).toBe('Riga');
  });
});

describe('OrganicAudienceLocationMapCard', () => {
  test('paints the mapped city names onto the map, not only into a hover tooltip', () => {
    renderCard();
    switchToCityMode();

    const map = within(screen.getByTestId('city-map'));
    expect(map.getByText('Buenos Aires')).toBeTruthy();
    expect(map.getByText('Bogotá')).toBeTruthy();
    expect(map.getAllByTestId('marker-label')).toHaveLength(2);
  });

  test('leaves the name off a pin whose label would overprint a bigger city', () => {
    renderCard([
      ...CITY_ENTRIES,
      { key: 'la-plata', label: 'La Plata, Buenos Aires', value: 210, lng: 104, lat: 102 },
    ]);
    switchToCityMode();

    const map = within(screen.getByTestId('city-map'));
    expect(map.getByText('Buenos Aires')).toBeTruthy();
    expect(map.queryByText('La Plata')).toBeNull();
    // The pin itself stays — only its name yields; the tooltip and the list still carry it.
    expect(screen.getByText('La Plata, Buenos Aires')).toBeTruthy();
  });

  test('leaves a city with no known coordinates off the map but keeps it in the list', () => {
    renderCard();
    switchToCityMode();

    const map = within(screen.getByTestId('city-map'));
    expect(map.queryByText('Medellín')).toBeNull();
    // The "Top cities" panel is the honest record of what the account actually reports.
    expect(screen.getByText('Medellín, Antioquia')).toBeTruthy();
    expect(screen.getByText('Mapped 2/3 cities with known coordinates.')).toBeTruthy();
  });

  test('renders the choropleth in country mode and no city markers', () => {
    renderCard();

    expect(screen.getByTestId('choropleth')).toBeTruthy();
    expect(screen.queryByTestId('city-map')).toBeNull();
    expect(screen.queryAllByTestId('marker-label')).toHaveLength(0);
  });

  test('opens no scroll container of its own — the metrics body is the only scroller', () => {
    const { container } = renderCard();
    switchToCityMode();

    expect(container.querySelectorAll('.overflow-y-auto')).toHaveLength(0);
    expect(container.querySelectorAll('.overflow-auto')).toHaveLength(0);
  });
});
