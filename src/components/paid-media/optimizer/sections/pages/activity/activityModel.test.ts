import { describe, expect, it } from 'bun:test';
import type { OptimizerLogRow } from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import spanish from '../../../../../../../messages/scale/es.json';
import portuguese from '../../../../../../../messages/scale/pt-BR.json';
import type { OptimizerActionFeedRow } from '../../../useOptimizerData';
import { ALL_PORTFOLIOS } from '../../logFilters';
import {
  actionSource,
  activityDays,
  activityEvents,
  activitySourceCopy,
  dayKeyLabel,
  dayKeyOf,
  deliveryEvents,
  deliveryWords,
  filterActions,
  filterPlatformItems,
  layoutMarkers,
  MARKER_STACK,
  platformItems,
  sourceCounts,
  spendSeries,
} from './activityModel';

// Noon, so the viewer's calendar and the instant agree in every zone the suite runs in.
const NOW = new Date(2026, 10, 2, 12, 0, 0);

const action = (over: Partial<OptimizerActionFeedRow> = {}): OptimizerActionFeedRow =>
  ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ts: new Date(2026, 10, 1, 9, 30).toISOString(),
    family: 'money',
    op: 'budget',
    portfolio_id: '11111111-1111-4111-8111-111111111111',
    portfolio_name: 'Conversaciones Whatsapp',
    entity_id: '120251303880680236',
    before: { minor: 18000 },
    after: { minor: 21500 },
    actor_kind: 'autopilot',
    reversible: true,
    ...over,
  }) as OptimizerActionFeedRow;

const drift = (over: Partial<OptimizerLogRow> = {}): OptimizerLogRow => ({
  id: 7,
  portfolio_id: '22222222-2222-4222-8222-222222222222',
  portfolio_name: 'Tours Programados - Octubre',
  ts: new Date(2026, 9, 30, 6, 0).toISOString(),
  level: 'warn',
  event: 'roster_drift_detected',
  fields: { seen: 0, missing: 3 },
  ...over,
});

describe('activityDays', () => {
  it('lists the complete days of the window, oldest first, then today', () => {
    const days = activityDays(7, NOW);
    expect(days).toHaveLength(8);
    expect(days[0]).toEqual({ key: '2026-10-26', complete: true });
    expect(days[6]).toEqual({ key: '2026-11-01', complete: true });
    expect(days[7]).toEqual({ key: '2026-11-02', complete: false });
  });
});

describe('actionSource', () => {
  it('reads a person as the team and everything else as the Optimizer', () => {
    expect(actionSource({ actor_kind: 'human' })).toBe('team');
    expect(actionSource({ actor_kind: 'autopilot' })).toBe('optimizer');
    expect(actionSource({ actor_kind: 'system' })).toBe('optimizer');
    expect(actionSource({ actor_kind: null })).toBe('optimizer');
  });
});

describe('spendSeries', () => {
  const days = activityDays(7, NOW);

  it('shades a day the platform left out of its read, and never draws today', () => {
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
    );
    expect(series).not.toBeNull();
    expect(series?.total).toBe(2700);
    expect(series?.max).toBe(1000);
    expect(series?.completeDays).toBe(7);
    expect(series?.darkDays).toBe(4);
    expect(series?.days.filter((day) => day.dark).map((day) => day.key)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(series?.days.at(-1)).toEqual({
      key: '2026-11-02',
      spend: null,
      dark: false,
    });
  });

  it('keeps a day with impressions but no cost as a day with ads', () => {
    const series = spendSeries(
      {
        currency: 'MXN',
        metrics: { spend: 0, roas: 0, ctr: 0 },
        trends: [{ date: '2026-10-26', spend: 0, impressions: 12 }],
      },
      days,
    );
    expect(series?.days[0]?.dark).toBe(false);
  });

  it('refuses to draw a total that came without its days', () => {
    expect(
      spendSeries(
        {
          currency: 'MXN',
          metrics: { spend: 500, roas: 0, ctr: 0 },
          trends: [],
        },
        days,
      ),
    ).toBeNull();
  });

  it('reads an account that spent nothing all window as dark every day', () => {
    const series = spendSeries(
      { currency: null, metrics: { spend: 0, roas: 0, ctr: 0 }, trends: [] },
      days,
    );
    expect(series?.darkDays).toBe(7);
    expect(series?.total).toBe(0);
  });
});

describe('deliveryEvents', () => {
  const days = activityDays(7, NOW);
  const read = (spends: number[]) =>
    spendSeries(
      {
        currency: 'MXN',
        metrics: { spend: spends.reduce((a, b) => a + b, 0), roas: 0, ctr: 0 },
        trends: spends.map((spend, index) => ({
          date: days[index]?.key,
          spend,
          impressions: spend > 0 ? 100 : 0,
        })),
      },
      days,
    );

  it('names the day an account stopped showing ads, still dark at the end of the read', () => {
    const series = read([900, 950, 0, 0, 0, 0, 0]);
    const events = deliveryEvents(series as NonNullable<typeof series>);
    expect(events).toEqual([
      {
        id: 'delivery:stopped:2026-10-28',
        kind: 'stopped',
        key: '2026-10-28',
        through: '2026-11-01',
        ongoing: true,
      },
    ]);
    expect(deliveryWords(events[0] as (typeof events)[number]).detail).toBe(
      'The account has shown no ad since Oct 28: nothing spent, no impression.',
    );
  });

  it('names both edges of a stretch that ended inside the window', () => {
    const series = read([900, 0, 0, 870, 910, 880, 860]);
    const events = deliveryEvents(series as NonNullable<typeof series>);
    expect(events.map((event) => [event.kind, event.key, event.through])).toEqual([
      ['stopped', '2026-10-27', '2026-10-28'],
      ['resumed', '2026-10-29', '2026-10-28'],
    ]);
    expect(deliveryWords(events[0] as (typeof events)[number]).detail).toBe(
      'The account showed no ad from Oct 27 to Oct 28: nothing spent, no impression.',
    );
  });

  it('names no edge for a window that opens dark', () => {
    const series = read([0, 0, 500, 500, 500, 500, 500]);
    const events = deliveryEvents(series as NonNullable<typeof series>);
    expect(events.map((event) => event.kind)).toEqual(['resumed']);
  });
});

describe('platformItems', () => {
  it('keeps the platform rows of the log, the delivery edges, newest first', () => {
    const items = platformItems(
      [drift(), drift({ id: 8, event: 'cycle_complete', level: 'info' })],
      [
        {
          id: 'delivery:stopped:2026-10-31',
          kind: 'stopped',
          key: '2026-10-31',
          through: '2026-11-01',
          ongoing: true,
        },
      ],
    );
    expect(items.map((item) => item.id)).toEqual([
      'delivery:stopped:2026-10-31',
      `log:7:${drift().ts}`,
    ]);
  });
});

describe('platformItems — the platform’s own change history', () => {
  it('lists a change made outside Continuum among the platform’s events, by its time', () => {
    const change = {
      at: '2026-10-31T10:15:00-06:00',
      what: 'Campaign changed',
      where: 'Search | Octubre | Easy Fit',
      detail: 'status enabled → paused',
      who: 'in Google Ads',
    };
    const items = platformItems([drift()], [], [change]);
    expect(items.map((item) => item.kind)).toEqual(['change', 'log']);
    const events = activityEvents([], items);
    expect(events[0]).toMatchObject({
      source: 'platform',
      label: 'Campaign changed · Search | Octubre | Easy Fit',
    });
  });
});

describe('filters', () => {
  const rows = [
    action({ id: 'a1', actor_kind: 'autopilot' }),
    action({
      id: 'a2',
      actor_kind: 'human',
      portfolio_name: 'Leads // Google Ads only',
    }),
  ];
  const platform = platformItems([drift()], []);

  it('narrows the actions by hand and by portfolio', () => {
    expect(
      filterActions(rows, { source: 'team', portfolio: ALL_PORTFOLIOS }).map((r) => r.id),
    ).toEqual(['a2']);
    expect(
      filterActions(rows, {
        source: 'all',
        portfolio: 'Conversaciones Whatsapp',
      }).map((r) => r.id),
    ).toEqual(['a1']);
  });

  it('shows the platform events under All and Platform only', () => {
    expect(
      filterPlatformItems(platform, {
        source: 'all',
        portfolio: ALL_PORTFOLIOS,
      }),
    ).toHaveLength(1);
    expect(
      filterPlatformItems(platform, {
        source: 'platform',
        portfolio: ALL_PORTFOLIOS,
      }),
    ).toHaveLength(1);
    expect(
      filterPlatformItems(platform, {
        source: 'optimizer',
        portfolio: ALL_PORTFOLIOS,
      }),
    ).toHaveLength(0);
  });

  it('leaves an account-wide day out once one portfolio is chosen', () => {
    const withDay = platformItems(
      [drift()],
      [
        {
          id: 'delivery:stopped:2026-10-31',
          kind: 'stopped',
          key: '2026-10-31',
          through: '2026-11-01',
          ongoing: true,
        },
      ],
    );
    expect(
      filterPlatformItems(withDay, {
        source: 'all',
        portfolio: 'Tours Programados - Octubre',
      }).map((item) => item.kind),
    ).toEqual(['log']);
  });
});

describe('activityEvents and their markers', () => {
  const days = activityDays(7, NOW);

  it('places each event on its day, coloured by its hand, with what it changed', () => {
    const events = activityEvents(
      [action({ id: 'a1' }), action({ id: 'a2', actor_kind: 'human' })],
      platformItems([drift()], []),
    );
    expect(events.map((event) => [event.id, event.source, event.dayKey])).toEqual([
      ['action:a1', 'optimizer', '2026-11-01'],
      ['action:a2', 'team', '2026-11-01'],
      [`log:7:${drift().ts}`, 'platform', '2026-10-30'],
    ]);
    expect(events[0]?.label).toBe('Daily budget · Conversaciones Whatsapp');
    expect(events[2]?.label).toBe('Roster drift · Tours Programados - Octubre');
    expect(sourceCounts(events)).toEqual({
      optimizer: 1,
      team: 1,
      platform: 1,
    });
  });

  it('folds a cross-platform move into one event, as the list folds it into one entry', () => {
    const leg = (id: string, leg: number) =>
      action({
        id,
        move_id: 'move-1',
        leg,
        outcome: 'applied',
      } as Partial<OptimizerActionFeedRow>);
    const events = activityEvents([leg('l1', 1), leg('l0', 0)], []);
    expect(events.map((event) => event.id)).toEqual(['move:move-1']);
  });

  it('stacks a day’s events and counts the ones past the stack', () => {
    const busy = Array.from({ length: MARKER_STACK + 2 }, (_, index) =>
      action({ id: `b${index}` }),
    );
    const { markers, overflow } = layoutMarkers(activityEvents(busy, []), days);
    expect(markers.map((marker) => marker.stack)).toEqual([0, 1, 2]);
    expect(markers.every((marker) => marker.column === 6)).toBe(true);
    expect(overflow).toEqual([{ column: 6, count: 2 }]);
  });

  it('drops an event outside the chart’s days instead of pinning it to an edge', () => {
    const old = action({
      id: 'old',
      ts: new Date(2026, 9, 1, 9).toISOString(),
    });
    expect(layoutMarkers(activityEvents([old], []), days).markers).toEqual([]);
    expect(dayKeyOf('not a date')).toBeNull();
  });
});

describe('localized activity chrome', () => {
  for (const [locale, scale] of [
    ['pt-BR', portuguese],
    ['es', spanish],
  ] as const) {
    it(`localizes delivery and source labels in ${locale} without moving the calendar day`, () => {
      const t = createTranslator({
        locale,
        namespace: 'scale',
        messages: { scale },
      });
      const event = {
        id: 'delivery:stopped:2026-11-01',
        kind: 'stopped' as const,
        key: '2026-11-01',
        through: '2026-11-02',
        ongoing: true,
      };
      const before = JSON.stringify(event);
      const words = deliveryWords(event, t, locale);
      expect(words.title).not.toBe('No ads shown');
      expect(words.detail).toContain(dayKeyLabel(event.key, locale));
      expect(activitySourceCopy('team', t).label).toBe(locale === 'es' ? 'Equipo' : 'Equipe');
      expect(JSON.stringify(event)).toBe(before);
      expect(dayKeyLabel(event.key, locale)).toBe(
        new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }).format(new Date('2026-11-01T00:00:00Z')),
      );
    });
  }
});
