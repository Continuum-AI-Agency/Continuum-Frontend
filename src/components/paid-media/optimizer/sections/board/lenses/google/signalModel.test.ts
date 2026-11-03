import { describe, expect, it } from 'bun:test';
import type { AccountCandidate, PlatformCard } from '@continuum/contracts';
import { platformCardOf } from '../../../platformCards/platformCardModel';
import {
  EASYFIT_CARDS,
  EASYFIT_CARDS_ES,
  PINK_FUNNEL,
  PINK_FUNNEL_ES,
  VIVO_CARDS,
  VIVO_CARDS_ES,
} from './__fixtures__/mixAuctionSignalReads';
import { buildSignal, funnelRoles, hasSignal, signalTakeaway, stepRate } from './signalModel';

const cardsOf = (candidates: readonly AccountCandidate[]): PlatformCard[] =>
  candidates.flatMap((candidate) => platformCardOf(candidate) ?? []);

describe('buildSignal — Vivo 47: most of what Google calls a conversion is a visit', () => {
  const model = buildSignal(cardsOf(VIVO_CARDS));

  it('splits the 4,051 reported into 3,461 attention events (85%) and 592 real results', () => {
    expect(model.split).toEqual({
      reported: 4051,
      attention: 3460.78,
      real: 591.56,
      attentionShare: 0.85,
      reportedCost: 10.09,
      realCost: 69.08,
    });
  });

  it('lists the five conversion actions, every one valued 1, one of them primary', () => {
    expect(model.actions?.rows.map((row) => [row.label, row.count, row.role, row.value])).toEqual([
      ['www.vivo47.com.mx - GA4 (web) user_engagement', 3469.78, 'secondary', 1],
      ['www.vivo47.com.mx - GA4 (web) consulta_membresias', 494.93, 'secondary', 1],
      ['www.vivo47.com.mx - GA4 (web) contacto', 48.62, 'secondary', 1],
      ['Lead formulario web', 45, 'primary', 1],
      ['(Evento de Google Analytics file_download)', 3, 'secondary', 1],
    ]);
    expect(model.actions?.sameValue).toBe(1);
    expect(model.actions?.primaries).toEqual(['Lead formulario web']);
    expect(model.actions?.rows.filter((row) => row.flagged)).toHaveLength(3);
  });

  it('closes on V1, in Spanish, with both costs', () => {
    expect(model.funnel).toBeNull();
    expect(model.windowDays).toBe(30);
    expect(signalTakeaway(model)).toBe(
      'Google reporta 4,051 conversiones, pero 3,461 (85%) son eventos de atención: cada resultado real cuesta $69.08 MXN, no $10.09 MXN.',
    );
  });
});

describe('buildSignal — Pink Elephant: 1,608 clicks, 11 leads, 1 sale', () => {
  const model = buildSignal(cardsOf([PINK_FUNNEL]));

  it('follows the clicks to leads and the leads to the one sale, flagged', () => {
    expect(model.funnel?.steps).toEqual([
      { role: 'clicks', value: 1608, flagged: false },
      { role: 'leads', value: 11, flagged: false },
      { role: 'sales', value: 1, flagged: true },
    ]);
    expect(stepRate(11, 1608)).toBe('0.68%');
    expect(stepRate(1, 11)).toBe('9.1%');
    expect(model.funnel?.salesValue).toBe(737);
    expect(model.funnel?.roas).toBe(0.08);
  });

  it('keeps the core keywords and what the sale cannot be measured by yet', () => {
    expect(model.funnel?.keywords).toEqual([
      { keyword: 'iso 27000', score: 'QS 1' },
      { keyword: 'ISO 42001', score: 'QS 3' },
      { keyword: 'continuidad del negocio', score: 'QS 2' },
    ]);
    expect(model.funnel?.blocked).toContain('GoHighLevel → WooCommerce');
    expect(signalTakeaway(model)).toBe(
      '1,608 clics dieron 11 leads y 1 venta de $737 MXN: ROAS 0.08.',
    );
  });

  it('tells the steps from the end when the producer read no clicks', () => {
    const card = platformCardOf(PINK_FUNNEL);
    if (card?.variant !== 'google_account_finding') throw new Error('not a finding');
    const noClicks = {
      ...card,
      bars: card.bars?.filter((bar) => bar.label !== 'Clicks'),
      facts: card.facts.filter((fact) => fact.label !== 'Clicks'),
    };
    const funnel = buildSignal([noClicks]).funnel;
    if (!funnel) throw new Error('no funnel');
    expect(funnelRoles(funnel)).toEqual({
      clicks: null,
      leads: { role: 'leads', value: 11, flagged: false },
      sales: { role: 'sales', value: 1, flagged: true },
    });
    expect(signalTakeaway(buildSignal([noClicks]))).toBe(
      '11 leads dieron 1 venta de $737 MXN: ROAS 0.08.',
    );
  });
});

describe('buildSignal — Easy Fit: six conversion actions, all primary, all valued 1', () => {
  const model = buildSignal(cardsOf(EASYFIT_CARDS));

  it('trusts the finding that every action carries the same value, the sixth unstated', () => {
    expect(model.split).toBeNull();
    expect(model.actions?.rows).toHaveLength(6);
    expect(model.actions?.rows.at(-1)).toMatchObject({ label: 'Lead formulario web', value: null });
    expect(model.actions?.sameValue).toBe(1);
    expect(model.actions?.primaries).toHaveLength(6);
    expect(signalTakeaway(model)).toBe(
      'Las 6 acciones de conversión valen 1, y las 6 son principales.',
    );
  });
});

// Decision 3: the engine rewrites every P8 word in Spanish. Live rows stay English until
// deploy:optimizer; after it, the same finding must read the same, figure for figure.
describe('buildSignal — the same findings after the engine writes them in Spanish', () => {
  it('Vivo 47: V1 and E3 in Spanish read exactly as in English', () => {
    const spanish = buildSignal(cardsOf(VIVO_CARDS_ES));
    expect(spanish).toEqual(buildSignal(cardsOf(VIVO_CARDS)));
    expect(spanish.split?.realCost).toBe(69.08);
    expect(spanish.actions?.rows.map((row) => row.role)).toEqual([
      'secondary',
      'secondary',
      'secondary',
      'primary',
      'secondary',
    ]);
  });

  it('Pink Elephant: P5 in Spanish ("Clics", "Ventas") keeps its steps, sale and ROAS', () => {
    const spanish = buildSignal(cardsOf([PINK_FUNNEL_ES]));
    const english = buildSignal(cardsOf([PINK_FUNNEL]));
    expect(spanish.funnel?.steps).toEqual(english.funnel?.steps ?? []);
    expect(spanish.funnel?.salesValue).toBe(737);
    expect(spanish.funnel?.roas).toBe(0.08);
    expect(spanish.funnel?.blocked).toContain('todavía no existe un conector');
    expect(signalTakeaway(spanish)).toBe(signalTakeaway(english));
  });

  it('Easy Fit: E3 in Spanish trusts "Hoy todas tienen el mismo valor" for the unstated sixth', () => {
    const spanish = buildSignal(cardsOf(EASYFIT_CARDS_ES));
    expect(spanish).toEqual(buildSignal(cardsOf(EASYFIT_CARDS)));
    expect(spanish.actions?.sameValue).toBe(1);
  });
});

describe('buildSignal — no finding', () => {
  it('has nothing to draw without V1, E3 or P5', () => {
    const model = buildSignal([]);
    expect(hasSignal(model)).toBe(false);
    expect(signalTakeaway(model)).toBeNull();
  });
});
