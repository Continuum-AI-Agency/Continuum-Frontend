import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { ActivitySpendChart, type ActivitySpendChartProps } from './ActivitySpendChart';
import {
  type ActivityEvent,
  activityDays,
  layoutMarkers,
  MARKER_STACK,
  type SpendSeries,
  spendSeries,
} from './activityModel';
import type { ChartAccount } from './useActivitySpend';

afterEach(cleanup);

const NOW = new Date(2026, 10, 2, 12, 0, 0);
const days = activityDays(7, NOW);
const account: ChartAccount = {
  id: 'act_521903353286118',
  platform: 'meta',
  name: 'Easy Fit',
  currency: 'MXN',
};

// Three days of delivery, then four without an ad: the shape of a suspended account.
const series = spendSeries(
  {
    currency: 'MXN',
    metrics: { spend: 2700, roas: 0, ctr: 0 },
    trends: [
      { date: '2026-10-26', spend: 900, impressions: 4000 },
      { date: '2026-10-27', spend: 1000, impressions: 5100 },
      { date: '2026-10-28', spend: 800, impressions: 3900 },
    ],
  },
  days,
) as SpendSeries;

const events: ActivityEvent[] = [
  {
    id: 'action:a1',
    source: 'optimizer',
    dayKey: '2026-10-27',
    label: 'Daily budget · Leads',
  },
  {
    id: 'action:a2',
    source: 'team',
    dayKey: '2026-10-27',
    label: 'Autopilot paused · Leads',
  },
  {
    id: 'delivery:stopped:2026-10-29',
    source: 'platform',
    dayKey: '2026-10-29',
    label: 'No ads shown',
  },
];

function mount(over: Partial<ActivitySpendChartProps> = {}) {
  const onHighlight = mock((_id: string | null) => {});
  const onPick = mock((_id: string) => {});
  const { markers, overflow } = layoutMarkers(events, days);
  const view = render(
    <ActivitySpendChart
      account={account}
      days={days}
      highlightedId={null}
      markers={markers}
      onHighlight={onHighlight}
      onPick={onPick}
      overflow={overflow}
      spend={{ status: 'ready', series }}
      {...over}
    />,
  );
  return { ...view, onHighlight, onPick };
}

describe('ActivitySpendChart — the spend line', () => {
  it('writes the window’s spend, its daily average and the days without ads beside the line', () => {
    mount();
    const figure = screen.getByTestId('activity-spend-figure');
    expect(figure.textContent).toContain('$2,700 MXN');
    expect(figure.textContent).toContain('$386 MXN/day');
    expect(figure.textContent).toContain('4 days without ads');
    expect(screen.getByTestId('activity-chart').textContent).toContain('Oct 26 – Nov 1');
    expect(screen.getByTestId('activity-chart').textContent).toContain('Meta · Easy Fit');
  });

  it('shades every complete day the account showed no ad, and never today', () => {
    mount();
    expect(
      screen.getAllByTestId('activity-dark-day').map((day) => day.getAttribute('data-day')),
    ).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('draws one point per complete day with rounded ends, and prints the last one', () => {
    mount();
    const line = screen.getByTestId('activity-spend-line');
    expect(line.getAttribute('points')?.split(' ')).toHaveLength(7);
    expect(line.getAttribute('stroke-linecap')).toBe('round');
    expect(screen.getByTestId('activity-spend-last').textContent).toBe('$0.00 MXN');
  });
});

describe('ActivitySpendChart — the events on it', () => {
  it('draws one dot per event in its hand’s colour, stacked on its day', () => {
    mount();
    const markers = screen.getAllByTestId('activity-marker');
    expect(markers.map((marker) => marker.getAttribute('data-source'))).toEqual([
      'optimizer',
      'team',
      'platform',
    ]);
    const dot = (marker: HTMLElement) =>
      (marker.querySelector('[data-marker-dot]') as HTMLElement).style.background;
    expect(dot(markers[0] as HTMLElement)).toBe('var(--board-search)');
    expect(dot(markers[1] as HTMLElement)).toBe('var(--board-pmax)');
    expect(dot(markers[2] as HTMLElement)).toBe('var(--board-video)');
    // The two Oct 27 events share a column, one above the other.
    expect((markers[0] as HTMLElement).style.left).toBe((markers[1] as HTMLElement).style.left);
    expect((markers[0] as HTMLElement).style.top).not.toBe((markers[1] as HTMLElement).style.top);
    expect(markers[1]?.getAttribute('aria-label')).toBe('Oct 27 · Team: Autopilot paused · Leads');
  });

  it('reports the dot pointed at, lets go when the pointer leaves, and picks it on click', () => {
    const { onHighlight, onPick } = mount();
    const [first] = screen.getAllByTestId('activity-marker');
    fireEvent.pointerEnter(first as HTMLElement);
    expect(onHighlight).toHaveBeenLastCalledWith('action:a1');
    fireEvent.pointerLeave(screen.getByRole('figure'));
    expect(onHighlight).toHaveBeenLastCalledWith(null);
    fireEvent.click(first as HTMLElement);
    expect(onPick).toHaveBeenCalledWith('action:a1');
  });

  it('labels the lit dot with its day, its hand and what changed', () => {
    mount({ highlightedId: 'action:a2' });
    const label = screen.getByTestId('activity-marker-label');
    expect(label.textContent).toContain('Oct 27 · Team');
    expect(label.textContent).toContain('Autopilot paused · Leads');
    const lit = screen
      .getAllByTestId('activity-marker')
      .find((marker) => marker.getAttribute('aria-pressed') === 'true');
    expect(lit?.getAttribute('data-event-id')).toBe('action:a2');
  });

  it('counts the events past a busy day’s stack instead of piling them into the line', () => {
    const busy: ActivityEvent[] = Array.from({ length: MARKER_STACK + 2 }, (_, index) => ({
      id: `action:b${index}`,
      source: 'optimizer',
      dayKey: '2026-10-30',
      label: 'Daily budget',
    }));
    const { markers, overflow } = layoutMarkers(busy, days);
    mount({ markers, overflow });
    expect(screen.getAllByTestId('activity-marker')).toHaveLength(MARKER_STACK);
    expect(screen.getByTestId('activity-marker-overflow').textContent).toBe('+2');
  });
});

describe('ActivitySpendChart — when the line cannot be drawn', () => {
  it('says why the spend read failed and offers to read it again, keeping the events', () => {
    const retry = mock(() => {});
    mount({ spend: { status: 'error', message: 'Meta token expired', retry } });
    const note = screen.getByTestId('activity-spend-error');
    expect(note.textContent).toContain('Daily spend could not be read: Meta token expired');
    fireEvent.click(within(note).getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('activity-spend-line')).toBeNull();
    expect(screen.queryByTestId('activity-spend-figure')).toBeNull();
    expect(screen.getAllByTestId('activity-marker')).toHaveLength(3);
  });

  it('draws no flat line for a total that came without its days', () => {
    mount({ spend: { status: 'unreadable' } });
    expect(screen.getByTestId('activity-spend-unreadable')).toBeTruthy();
    expect(screen.queryByTestId('activity-spend-line')).toBeNull();
  });

  it('says there is no account to chart rather than drawing zero', () => {
    mount({ account: null, spend: { status: 'none' } });
    expect(screen.getByTestId('activity-spend-none').textContent).toContain('No Meta or Google');
    expect(screen.queryByTestId('activity-dark-day')).toBeNull();
  });

  it('holds the line’s place while it loads', () => {
    mount({ spend: { status: 'loading' } });
    expect(screen.getByTestId('activity-spend-loading')).toBeTruthy();
    expect(screen.queryByTestId('activity-spend-figure')).toBeNull();
  });
});
