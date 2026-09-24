import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { type RadarData, type RadarMetric, RadarProvider } from '@/components/charts/radar-context';
import { READINESS_LEGACY, READINESS_PARTIAL, READINESS_V2 } from './readiness.fixtures';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// The real RadarChart sizes itself with ResizeObserver, which happy-dom never
// fires. This stand-in supplies the same context at a fixed size so the hero's
// own layers (spokes, polygons, dots, hub) render for real.
mock.module('@/components/charts/radar-chart', () => {
  function RadarChart({
    data,
    metrics,
    innerRadiusRatio = 0,
    children,
  }: {
    data: RadarData[];
    metrics: RadarMetric[];
    innerRadiusRatio?: number;
    children: ReactNode;
  }) {
    const radius = 100;
    const yScale = (v: number) => radius * (innerRadiusRatio + (v / 100) * (1 - innerRadiusRatio));
    const getAngle = (i: number) => (i * Math.PI * 2) / metrics.length - Math.PI / 2;
    return (
      <RadarProvider
        value={{
          data,
          metrics,
          size: 300,
          radius,
          levels: 4,
          animate: false,
          enterDurationMs: 0,
          staggerScale: 1,
          motionReplayKey: '',
          hoveredIndex: null,
          setHoveredIndex: () => {},
          getColor: (i) => data[i]?.color ?? '',
          getAngle,
          getPointPosition: (i, v) => ({
            x: yScale(v) * Math.cos(getAngle(i)),
            y: yScale(v) * Math.sin(getAngle(i)),
          }),
          yScale,
        }}
      >
        <svg aria-hidden="true" data-series={data.length} data-testid="radar-svg">
          {children}
        </svg>
      </RadarProvider>
    );
  }
  return { RadarChart, default: RadarChart };
});

const { ReadinessHero } = await import('./ReadinessHero');

afterEach(cleanup);

const pointKeys = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-radar-point]'), (el) =>
    el.getAttribute('data-radar-point'),
  );

describe('ReadinessHero', () => {
  it('leads with the radar, then the ranked next moves with points and target field', () => {
    const { getByTestId, getAllByTestId } = render(
      <ReadinessHero readiness={READINESS_V2} status="settled" />,
    );

    const radar = getByTestId('readiness-radar');
    const moves = getByTestId('readiness-moves');
    expect(radar.compareDocumentPosition(moves) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Two polygons: the reachable ghost under the current shape.
    expect(getByTestId('radar-svg').getAttribute('data-series')).toBe('2');
    expect(getByTestId('readiness-overall').textContent).toBe('64');
    expect(getAllByTestId('move-points').map((el) => el.textContent)).toEqual([
      '+6 pts',
      '+5 pts',
      '+4 pts',
    ]);
    expect(moves.textContent).toContain('Success metrics');
    expect(getByTestId('coverage-ring').getAttribute('data-coverage')).not.toBeNull();
  });

  it('draws an unknown or thin axis as a hatched spoke with no dot and no score', () => {
    const { container, getByTestId } = render(
      <ReadinessHero readiness={READINESS_PARTIAL} status="settled" />,
    );

    const dots = pointKeys(container);
    expect(dots).not.toContain('success_metrics');
    expect(dots).not.toContain('customer_pains');
    expect(dots).toContain('brand_identity');
    expect(dots).toHaveLength(5);
    expect(
      container.querySelector('[data-spoke="success_metrics"]')?.hasAttribute('data-hatched'),
    ).toBe(true);
    expect(
      container.querySelector('[data-spoke="brand_identity"]')?.hasAttribute('data-hatched'),
    ).toBe(false);

    const unknown = container.querySelector(
      '[data-testid="radar-axis"][data-dimension="success_metrics"]',
    );
    expect(unknown?.getAttribute('data-confidence')).toBe('unknown');
    expect(unknown?.textContent).toContain('No evidence');
    expect(/\d/.test(unknown?.textContent ?? '')).toBe(false);

    const banner = getByTestId('readiness-partial');
    expect(banner.textContent).toContain('Instagram');
    expect(banner.textContent).toContain('web search');
  });

  it.each([
    ['settled', 'empty'],
    ['error', 'error'],
    ['running', 'pending'],
  ] as const)('renders no number when readiness is null (%s)', (status, state) => {
    const { getByTestId, queryByTestId, container } = render(
      <ReadinessHero readiness={null} status={status} />,
    );

    expect(getByTestId('readiness-hero').getAttribute('data-state')).toBe(state);
    expect(queryByTestId('readiness-overall')).toBeNull();
    expect(pointKeys(container)).toHaveLength(0);
    expect(/\d/.test(getByTestId('readiness-hero').textContent ?? '')).toBe(false);
  });

  it('renders a legacy row as radar and dimension scores, with the recalculate hint', () => {
    const { getByTestId, queryByTestId, container } = render(
      <ReadinessHero
        legacyHint="Recalculate to see what earned each score."
        readiness={READINESS_LEGACY}
        status="settled"
      />,
    );

    expect(getByTestId('readiness-hero').getAttribute('data-state')).toBe('legacy');
    expect(getByTestId('readiness-overall').textContent).toBe('72');
    expect(pointKeys(container)).toHaveLength(7);
    // No reachable data → no ghost polygon, no moves rail, no ledger.
    expect(getByTestId('radar-svg').getAttribute('data-series')).toBe('1');
    expect(queryByTestId('readiness-moves')).toBeNull();
    expect(queryByTestId('criteria-ledger')).toBeNull();
    expect(getByTestId('readiness-legacy').textContent).toContain(
      'Recalculate to see what earned each score.',
    );
    expect(container.querySelectorAll('[data-testid="readiness-legacy"] li')).toHaveLength(7);
  });

  it('links axis and move to one ledger: hover previews, click pins', () => {
    const { getByTestId, container } = render(
      <ReadinessHero readiness={READINESS_V2} status="settled" />,
    );
    const ledger = () => getByTestId('criteria-ledger');

    // Nothing chosen yet: the top move's dimension is open.
    expect(ledger().getAttribute('data-dimension')).toBe('success_metrics');

    const axis = container.querySelector(
      '[data-testid="radar-axis"][data-dimension="customer_pains"]',
    ) as HTMLElement;
    fireEvent.pointerEnter(axis);
    expect(ledger().getAttribute('data-dimension')).toBe('customer_pains');
    const review = Array.from(
      ledger().querySelectorAll('[data-testid="readiness-criterion"]'),
    ).find((row) => row.textContent?.includes('A third party describes'));
    expect(review?.getAttribute('data-met')).toBe('yes');
    expect(review?.textContent).toContain('Our front desk used to spend mornings');
    expect(review?.querySelector('[data-testid="criterion-source"]')?.textContent).toBe(
      'web: g2.com',
    );
    fireEvent.pointerLeave(axis);
    expect(ledger().getAttribute('data-dimension')).toBe('success_metrics');

    const move = container.querySelector(
      '[data-testid="readiness-move"][data-dimension="positioning"]',
    ) as HTMLElement;
    fireEvent.click(move);
    expect(move.getAttribute('aria-pressed')).toBe('true');
    expect(ledger().getAttribute('data-dimension')).toBe('positioning');
    expect(
      container
        .querySelector('[data-testid="radar-axis"][data-dimension="positioning"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
