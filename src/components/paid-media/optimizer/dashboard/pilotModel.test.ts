import { describe, expect, it } from 'bun:test';
import { payloadFixture } from './__fixtures__/easyfitPayload';
import { lastMonthKpis, latestCostPerContact, pilotMonths, pilotTotals } from './pilotModel';

describe('pilotMonths', () => {
  it('reads each pilot month against its targets, the month in course from its own row', () => {
    const [november, december, january] = pilotMonths(payloadFixture, '2026-11-01');

    expect(november).toMatchObject({
      month: '2026-11',
      state: 'inProgress',
      isCurrent: true,
      projectedSignups: 690,
      signups: 85,
      metaSignups: 19,
      floor: 662,
      goal: 729,
      metaGoal: 115,
      budget: 110000,
    });
    expect(december).toMatchObject({
      state: 'upcoming',
      signups: 0,
      goal: 486,
      projectedSignups: null,
    });
    expect(january).toMatchObject({ state: 'upcoming', budget: 130000 });
  });
});

describe('pilotTotals', () => {
  it('sums the pilot to the headline "2,060 altas con $350,000"', () => {
    expect(pilotTotals(payloadFixture)).toEqual({ signups: 2060, budget: 350000 });
  });
});

describe('lastMonthKpis', () => {
  it('reports on the last complete month (October) against September', () => {
    const kpis = lastMonthKpis(payloadFixture);
    const october = payloadFixture.historico.find((row) => row.mes === '2026-10');
    const september = payloadFixture.historico.find((row) => row.mes === '2026-09');

    expect(kpis?.month).toBe('2026-10');
    expect(kpis?.costTotal).toBe(october?.cpa_total ?? null);
    expect(kpis?.metaSignups).toBe(october?.altas_meta ?? null);
    expect(kpis?.costMetaChange).toBeCloseTo(
      (100 * ((october?.cpa_meta ?? 0) - (september?.cpa_meta ?? 0))) / (september?.cpa_meta ?? 1),
    );
    expect(kpis?.returnMeta).toBeCloseTo(4240 / (october?.cpa_meta ?? 1));
  });
});

describe('latestCostPerContact', () => {
  it("is the latest click cohort's spend over its contacts", () => {
    const cohort = payloadFixture.cohortes[payloadFixture.cohortes.length - 1];
    expect(latestCostPerContact(payloadFixture)).toBe(
      Math.round((cohort?.inversion ?? 0) / (cohort?.contactos ?? 1)),
    );
  });
});
