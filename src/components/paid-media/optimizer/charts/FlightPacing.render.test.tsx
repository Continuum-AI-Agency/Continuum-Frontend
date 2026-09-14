import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { FlightPacingModel } from './flightPacingModel';

const { FlightPacing } = await import('./FlightPacing');

afterEach(cleanup);

const ready: FlightPacingModel = {
  kind: 'ready',
  source: 'engine',
  status: 'underpacing',
  start: '2026-09-01',
  end: '2026-09-30',
  budget: 3000,
  periodDays: 30,
  dayIndex: 11,
  timePct: (11 / 30) * 100,
  spent: 800,
  spentPct: (800 / 3000) * 100,
  ratio: 0.8,
  projectedEnd: (800 / 11) * 30,
  dailyNeeded: 2200 / 20,
  dailyPlanned: 100,
  remaining: 2200,
  note: 'Underpacing (80%)',
};

describe('FlightPacing', () => {
  it('draws time elapsed and budget spent as two bars with the verdict chip', () => {
    const { getAllByRole, container } = render(<FlightPacing currency="USD" model={ready} />);
    const bars = getAllByRole('progressbar');
    expect(bars).toHaveLength(2);
    expect(bars[0].getAttribute('aria-valuenow')).toBe('37');
    expect(bars[1].getAttribute('aria-valuenow')).toBe('27');
    expect(container.textContent).toContain('Underpacing');
    expect(container.textContent).toContain('Day 11 of 30');
    expect(container.textContent).toContain('$800 of $3,000');
    expect(container.textContent).toContain('At this pace');
    expect(container.textContent).toContain('$110/day');
  });

  it('says when the figure is estimated from spend rather than the engine', () => {
    const { container } = render(
      <FlightPacing currency="USD" model={{ ...ready, source: 'client', note: null }} />,
    );
    expect(container.textContent).toContain('estimated from spend');
  });

  it('with no flight, explains and offers the way to set one', () => {
    const onSetFlight = mock(() => {});
    const { getByRole, queryAllByRole } = render(
      <FlightPacing model={{ kind: 'no_flight' }} onSetFlight={onSetFlight} />,
    );
    expect(queryAllByRole('progressbar')).toHaveLength(0);
    fireEvent.click(getByRole('button', { name: /set a flight/i }));
    expect(onSetFlight).toHaveBeenCalledTimes(1);
  });

  it('waits honestly for the first paced cycle', () => {
    const { container, getAllByRole } = render(
      <FlightPacing
        model={{
          kind: 'awaiting_cycle',
          start: '2026-09-01',
          end: '2026-09-30',
          budget: 3000,
          dayIndex: 3,
          periodDays: 30,
        }}
      />,
    );
    expect(getAllByRole('progressbar')).toHaveLength(1);
    expect(container.textContent).toMatch(/next scored cycle/);
  });

  it('reports not-started and ended flights', () => {
    const notStarted = render(
      <FlightPacing
        currency="USD"
        model={{ kind: 'not_started', start: '2026-09-20', end: '2026-09-30', budget: 3000 }}
      />,
    );
    expect(notStarted.container.textContent).toMatch(/Flight starts Sep 20/);
    cleanup();
    const ended = render(
      <FlightPacing
        currency="USD"
        model={{
          kind: 'ended',
          start: '2026-08-01',
          end: '2026-08-31',
          budget: 1000,
          spent: 900,
          spentPct: 90,
        }}
      />,
    );
    expect(ended.container.textContent).toMatch(/Ended Aug 31/);
    expect(ended.container.textContent).toContain('$900 of $1,000');
  });
});
