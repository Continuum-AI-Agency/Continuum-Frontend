import { describe, expect, it } from 'bun:test';
import {
  CAMPAIGN,
  CAMPAIGN_CONVERSATIONS,
  PORTFOLIO_IDS,
  PORTFOLIOS,
  TOP_CAMPAIGNS,
} from './__fixtures__/easyFitMeta';
import { buildEvents, flagText } from './eventsModel';
import { rankRowOf } from './metaLensModel';

const campaigns = TOP_CAMPAIGNS.map(rankRowOf);

describe('buildEvents on Easy Fit (Oct 3 – Nov 2)', () => {
  const model = buildEvents(PORTFOLIOS, campaigns, 'MXN');

  it('names what each portfolio optimizes for, the valued event first', () => {
    expect(
      model.events.map((event) => [event.name, event.eventLabel, event.goal, event.valuePerResult]),
    ).toEqual([
      ['Tours Programados - Octubre', 'Purchase', 296, 108000 / 217],
      ['Conversaciones Whatsapp', 'Messaging conversation started', 45, null],
      ['Leads // Google Ads only', 'Lead', null, null],
    ]);
  });

  it('flags the portfolio that lost its ad sets, with the date', () => {
    const tours = model.events.find((event) => event.portfolioId === PORTFOLIO_IDS.tours);
    expect(tours?.flag).toEqual({
      kind: 'lost',
      count: 3,
      since: '2026-10-15T16:58:32.02+00:00',
    });
    if (!tours?.flag) throw new Error('expected a flag');
    expect(flagText(tours.flag, 'purchases')).toBe('Lost its 3 ad sets on Oct 15');
    // The ranking row carries no conversation count: unknown is not zero, so nothing is flagged.
    expect(model.events.find((e) => e.portfolioId === PORTFOLIO_IDS.conversaciones)?.flag).toBe(
      null,
    );
  });

  // Each tour is booked at $500, but CAÑADAS' MENSAJES campaign reports 46 purchases worth
  // $22,500: one came in without a value, so the average is what the account was paid.
  it('reads the purchase across the account: $498 on average, $406 to buy, ROAS 1.23', () => {
    const valued = model.valued;
    expect(valued?.results).toBe(217);
    expect(valued?.value).toBe(108000);
    expect(valued?.valuePerResult).toBeCloseTo(497.6959, 4);
    expect(valued?.costPerResult).toBeCloseTo(88062.36 / 217, 6);
    expect(valued?.roas).toBeCloseTo(108000 / 88062.36, 6);
    expect(valued?.goal).toBe(296);
    expect(valued?.tone).toBe('above');
    expect(model.takeaway).toBe(
      'Cada compra vale $498 MXN en promedio y cuesta $406 MXN: ROAS 1.23 en 30 días.',
    );
  });
});

describe('buildEvents without the campaign read, or with an event gone quiet', () => {
  it('still names the events, and leads with the lost ad sets', () => {
    const model = buildEvents(PORTFOLIOS, null, 'MXN');
    expect(model.valued).toBeNull();
    expect(model.events.every((event) => event.valuePerResult === null)).toBe(true);
    expect(model.takeaway).toBe(
      'Tours Programados - Octubre perdió sus 3 conjuntos el 15 oct: su evento ya no tiene entrega.',
    );
  });

  // AV CAMACHO's and ITESO's MENSAJES campaigns recorded no lead in the window (campaign scope
  // read): a lead portfolio over only those two is buying an event that does not fire.
  it('flags a portfolio whose event recorded none on the account', () => {
    const quiet = campaigns
      .filter((row) => row.id === CAMPAIGN.camacho.id || row.id === CAMPAIGN.iteso.id)
      .map((row) => ({ ...row, ...CAMPAIGN_CONVERSATIONS[row.id] }));
    const leads = PORTFOLIOS.filter((portfolio) => portfolio.id === PORTFOLIO_IDS.leads);
    const model = buildEvents(leads, quiet, 'MXN');
    const flag = model.events[0]?.flag;
    expect(flag).toEqual({ kind: 'silent' });
    if (!flag) throw new Error('expected a flag');
    expect(flagText(flag, 'leads')).toBe('No leads on the account in 30 days');
  });

  it('says what a goaled event optimizes when nothing carries a value', () => {
    const conversaciones = PORTFOLIOS.filter((p) => p.id === PORTFOLIO_IDS.conversaciones);
    const model = buildEvents(conversaciones, null, 'MXN');
    expect(model.takeaway).toBe(
      'Conversaciones Whatsapp optimiza conversaciones con una meta de $45.00 MXN.',
    );
  });
});
