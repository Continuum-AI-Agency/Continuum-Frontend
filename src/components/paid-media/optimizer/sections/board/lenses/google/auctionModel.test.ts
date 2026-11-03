import { describe, expect, it } from 'bun:test';
import type { AccountCandidate, PlatformCard } from '@continuum/contracts';
import { NOT_IN_THIS_READ } from '../../../google/googleReads';
import { platformCardOf } from '../../../platformCards/platformCardModel';
import {
  EASYFIT_CAMPAIGNS,
  EASYFIT_CARDS,
  EASYFIT_CARDS_ES,
  EASYFIT_SUSPENDED_1031,
  PINK_CAMPAIGNS,
  VIVO_CAMPAIGNS,
  VIVO_CARDS,
  VIVO_CARDS_ES,
} from './__fixtures__/mixAuctionSignalReads';
import {
  auctionDarkTakeaway,
  auctionHeadline,
  auctionTakeaway,
  buildAuctionDark,
  buildAuctionShares,
  datesOfMonthDays,
} from './auctionModel';

const cardsOf = (candidates: readonly AccountCandidate[]): PlatformCard[] =>
  candidates.flatMap((candidate) => platformCardOf(candidate) ?? []);

describe('buildAuctionShares — what each Search campaign wins and loses', () => {
  it('Vivo 47: EKATAR loses 74% to budget (V3) and its raise is locked; the PMax loses 78% to rank', () => {
    const model = buildAuctionShares(VIVO_CAMPAIGNS, cardsOf(VIVO_CARDS));
    expect(
      model.rows.map((row) => [
        row.name,
        row.channel,
        row.budgetLost,
        row.rankLost,
        row.v3,
        row.locked,
      ]),
    ).toEqual([
      ['VIVO 47-EKATAR', 'search', 0.74, null, true, true],
      ['SALES-PMAX-OCTUBRE', 'pmax', null, 0.78, false, false],
    ]);
    expect(model.rows[0]?.budgetPerDay).toBe(1179);
    expect(model.rows[0]?.missing).toBe('Google reported no impression share for this window');
    expect(model.locked).toEqual(['VIVO 47-EKATAR']);
    expect(auctionHeadline(model)).toMatchObject({ measure: 'budget', share: 0.74 });
    expect(auctionTakeaway(model)).toBe(
      'VIVO 47-EKATAR pierde 74% de sus impresiones por presupuesto: subir el presupuesto espera la corrección de la conversión; SALES-PMAX-OCTUBRE pierde 78% por ranking, que el presupuesto no recupera.',
    );
  });

  it('Pink Elephant: three Search campaigns under the V3 line, none locked', () => {
    const model = buildAuctionShares(PINK_CAMPAIGNS, []);
    expect(model.rows.map((row) => [row.name, row.budgetLost, row.v3])).toEqual([
      ['Cursos-pink-elephant-2025', 0.16, false],
      ['ITSM 2026', 0.21, false],
      ['Eventos 2026', 0.38, false],
    ]);
    expect(auctionHeadline(model)?.row.name).toBe('Eventos 2026');
    expect(auctionTakeaway(model)).toBe(
      'Eventos 2026 pierde 38% de sus impresiones por presupuesto.',
    );
  });

  it('a read cached before Google carried impression share keeps Search with its reason and drops PMax', () => {
    const model = buildAuctionShares(EASYFIT_CAMPAIGNS, []);
    expect(model.rows.map((row) => row.name)).toEqual([
      'Easy Fit | Search | Leads formulario',
      'GA 1 EASY',
      'Search | Octubre | Easy Fit',
    ]);
    expect(model.rows.every((row) => row.missing === NOT_IN_THIS_READ)).toBe(true);
    expect(auctionHeadline(model)).toBeNull();
    expect(auctionTakeaway(model)).toBeNull();
  });
});

describe('buildAuctionDark — the account does not deliver', () => {
  it('Easy Fit, Nov 2: E1 places every day from Oct 8 with its spend, 11 of them dark', () => {
    const dark = buildAuctionDark(
      EASYFIT_CARDS,
      cardsOf(EASYFIT_CARDS),
      { since: '2026-10-03', until: '2026-11-01' },
      '2026-11-02',
    );
    if (!dark) throw new Error('no calendar');
    expect(dark.weeks?.map((week) => week.length)).toEqual([7, 7, 7, 7]);
    expect(dark.weeks?.[0]?.[0]?.day).toBe('2026-10-05');
    const days = dark.weeks?.flat().filter((day) => day.inRange) ?? [];
    expect(days).toHaveLength(25);
    expect(days[0]).toEqual({ day: '2026-10-08', inRange: true, state: 'served', spend: 5099.6 });
    expect(dark.darkDays).toBe(11);
    expect(dark.runs).toEqual([
      { from: '2026-10-15', to: '2026-10-19', days: 5 },
      { from: '2026-10-26', to: '2026-10-31', days: 6 },
    ]);
    expect(dark.maxSpend).toBe(5099.6);
    expect(dark.status).toBeNull();
    expect(dark.lostConversions).toBe(409.4);
    expect(dark.windowDays).toBe(30);
    expect(auctionDarkTakeaway(dark)).toBe(
      'La cuenta no mostró anuncios 11 días (15–19 oct y 26–31 oct): unas 409 conversiones perdidas al promedio de los días servidos.',
    );
  });

  it('Easy Fit, Oct 31: Google suspended every campaign, dark since Oct 26 (5 days)', () => {
    const dark = buildAuctionDark(
      [EASYFIT_SUSPENDED_1031],
      cardsOf([EASYFIT_SUSPENDED_1031]),
      { since: '2026-10-01', until: '2026-10-30' },
      '2026-10-31',
    );
    if (!dark) throw new Error('no calendar');
    const days = dark.weeks?.flat().filter((day) => day.inRange) ?? [];
    expect(days[0]?.day).toBe('2026-10-01');
    expect(days.filter((day) => day.state === 'dark').map((day) => day.day)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ]);
    // A G12 card says nothing about the days before its run: they are not drawn as served.
    expect(days.filter((day) => day.state === 'served')).toHaveLength(0);
    expect(dark.suspended).toBe(true);
    expect(dark.status?.title).toBe('Google suspended this account’s campaigns');
    expect(auctionDarkTakeaway(dark)).toBe(
      'Google suspendió la cuenta: sin anuncios desde el 26 oct (5 días), con $670 MXN al día de presupuesto esperando.',
    );
  });

  it('a G12 card written before it carried its first day says how long, with no calendar', () => {
    const card = EASYFIT_SUSPENDED_1031.platform_card;
    if (card?.variant !== 'google_delivery_issue') throw new Error('not a delivery card');
    const { dark_since: _firstDay, ...undatedCard } = card;
    const dark = buildAuctionDark(
      [{ ...EASYFIT_SUSPENDED_1031, platform_card: undatedCard }],
      [],
      { since: '2026-10-01', until: '2026-10-30' },
      '2026-10-31',
    );
    expect(dark?.weeks).toBeNull();
    expect(dark?.darkDays).toBe(5);
    if (!dark) throw new Error('no status');
    expect(auctionDarkTakeaway(dark)).toBe(
      'Google suspendió la cuenta: sin anuncios (5 días), con $670 MXN al día de presupuesto esperando.',
    );
  });

  it('one dark campaign is its own card, never the account’s calendar', () => {
    expect(
      buildAuctionDark(
        VIVO_CARDS,
        cardsOf(VIVO_CARDS),
        { since: '2026-10-03', until: '2026-11-01' },
        '2026-11-02',
      ),
    ).toBeNull();
  });
});

// Decision 3: the engine rewrites every P8 word in Spanish. Live rows stay English until
// deploy:optimizer; after it, the lens must read the same findings the same way.
describe('the same findings after the engine writes them in Spanish', () => {
  it('Easy Fit, E1 in Spanish: the same calendar and the same conversions lost', () => {
    const window = { since: '2026-10-03', until: '2026-11-01' };
    const spanish = buildAuctionDark(
      EASYFIT_CARDS_ES,
      cardsOf(EASYFIT_CARDS_ES),
      window,
      '2026-11-02',
    );
    expect(spanish).toEqual(
      buildAuctionDark(EASYFIT_CARDS, cardsOf(EASYFIT_CARDS), window, '2026-11-02'),
    );
    expect(spanish?.lostConversions).toBe(409.4);
  });

  it('Vivo 47, V3 in Spanish: EKATAR’s raise is still locked', () => {
    const model = buildAuctionShares(VIVO_CAMPAIGNS, cardsOf(VIVO_CARDS_ES));
    expect(model.locked).toEqual(['VIVO 47-EKATAR']);
    expect(model.rows[0]?.locked).toBe(true);
  });
});

describe('datesOfMonthDays — E1 names days without their year', () => {
  it('reads the year back from today, across New Year', () => {
    expect(datesOfMonthDays(['12-30', '12-31', '01-01'], '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
    expect(datesOfMonthDays(['10-31', '11-01'], '2026-11-02')).toEqual([
      '2026-10-31',
      '2026-11-01',
    ]);
  });
});
