import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, screen } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { PORTFOLIOS, TOP_CAMPAIGNS } from './__fixtures__/easyFitMeta';
import { EventsView } from './EventsLens';
import { buildEvents } from './eventsModel';
import { rankRowOf } from './metaLensModel';
import type { MetaReadState } from './metaReads';

afterEach(cleanup);

const rows = TOP_CAMPAIGNS.map(rankRowOf);
const ready: MetaReadState<typeof rows> = { status: 'ready', data: rows };
const model = buildEvents(PORTFOLIOS, rows, 'MXN');

describe('EventsView at m (Easy Fit, Oct 3 – Nov 2)', () => {
  it('names each portfolio’s event, its value and its goal, and flags the lost one', () => {
    render(<EventsView campaigns={ready} currency="MXN" model={model} size="m" />);
    const events = screen.getAllByTestId('board-module-events-event');
    expect(events).toHaveLength(3);
    const [tours, conversaciones, leads] = events;
    expect(tours?.textContent).toContain('Tours Programados - Octubre');
    expect(tours?.textContent).toContain('Purchase');
    expect(tours?.textContent).toContain('Worth $498 MXN on average · goal $296 MXN per purchase');
    expect(tours?.textContent).toContain('Lost its 3 ad sets on Oct 15');
    expect(conversaciones?.textContent).toContain('Messaging conversation started');
    expect(conversaciones?.textContent).toContain(
      'No value reported · goal $45.00 MXN per conversation',
    );
    expect(leads?.textContent).toContain('No value reported · no cost goal');
    expect(screen.getAllByTestId('board-module-events-flag')).toHaveLength(1);
  });

  it('sets one purchase’s cost against its goal and its worth, with the ROAS', () => {
    render(<EventsView campaigns={ready} currency="MXN" model={model} size="m" />);
    expect(screen.getByTestId('board-module-events-bar-cost').textContent).toBe(
      'Cost per purchase$406 MXN',
    );
    expect(screen.getByTestId('board-module-events-bar-goal').textContent).toBe('Goal$296 MXN');
    expect(screen.getByTestId('board-module-events-bar-value').textContent).toBe(
      'Value of a purchase$498 MXN',
    );
    expect(screen.getByTestId('board-module-events-totals').textContent).toBe(
      '217 purchases worth $108,000 MXN on $88,062 MXN of spend · ROAS 1.23',
    );
    expect(screen.getByTestId('board-module-events-takeaway').textContent).toBe(
      'Cada compra vale $498 MXN en promedio y cuesta $406 MXN: ROAS 1.23 en 30 días.',
    );
  });

  it('keeps the events when the campaign read fails, and says why there is no value', () => {
    render(
      <EventsView
        campaigns={{ status: 'error', retry: () => undefined }}
        currency="MXN"
        model={buildEvents(PORTFOLIOS, null, 'MXN')}
        size="m"
      />,
    );
    expect(screen.getAllByTestId('board-module-events-event')).toHaveLength(3);
    expect(screen.getByText('The campaign read failed, so no event has a value yet.')).toBeTruthy();
    expect(screen.queryByTestId('board-module-events-bar-cost')).toBeNull();
  });
});

describe('EventsView at s', () => {
  it('leads with what a purchase is worth and keeps the flag in sight', () => {
    render(<EventsView campaigns={ready} currency="MXN" model={model} size="s" />);
    expect(screen.getByTestId('board-module-events-headline').textContent).toBe(
      '$498 MXNAverage value per purchase · ROAS 1.23',
    );
    expect(screen.getByTestId('board-module-events-window').textContent).toBe('Last 30 days');
    expect(screen.getByTestId('board-module-events-flag').textContent).toBe(
      'Tours Programados - Octubre · Lost its 3 ad sets on Oct 15',
    );
  });
});
