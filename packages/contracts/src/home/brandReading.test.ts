import { describe, expect, it } from 'bun:test';
import {
  type HomeBrandSignals,
  type HomePortfolioSignal,
  readBrand,
  readBusinessModel,
} from './brandReading';

const brand = (overrides: Partial<HomeBrandSignals> = {}): HomeBrandSignals => ({
  accounts: { ads: 1, organic: 1 },
  savedGoal: null,
  business: null,
  portfolios: [],
  approvalRequired: false,
  ...overrides,
});

const portfolio = (overrides: Partial<HomePortfolioSignal> = {}): HomePortfolioSignal => ({
  id: 'p1',
  name: 'Leads',
  applyMode: 'recommend',
  status: 'active',
  autopilotPaused: false,
  pendingRecommendations: 0,
  pendingBudgetMoves: 0,
  staleForDays: null,
  rosterAbsent: false,
  ...overrides,
});

const ids = (reading: ReturnType<typeof readBrand>) => reading.modules.map((module) => module.id);

describe('readBusinessModel — what onboarding learned about the business', () => {
  it("reads Easy Fit's calls to action as a business that books leads", () => {
    expect(
      readBusinessModel({
        calls: [
          'Claim your free family day pass',
          'Schedule a comfortable 15-minute facility tour',
        ],
        descriptions: ['Easy Fit provides comfortable neighborhood spaces to exercise.'],
      }),
    ).toBe('leads');
  });

  it('reads a store from its checkout language, accents and case aside', () => {
    expect(
      readBusinessModel({
        calls: ['Compra ahora con ENVÍO gratis'],
        descriptions: ['Tienda de moda'],
      }),
    ).toBe('store');
  });

  it('reads a WhatsApp-first business as selling in conversations', () => {
    expect(
      readBusinessModel({ calls: ['Escríbenos por WhatsApp'], descriptions: ['Mensaje directo'] }),
    ).toBe('conversations');
  });

  it('reads a media brand as an audience business', () => {
    expect(
      readBusinessModel({
        calls: ['Subscribe to the newsletter'],
        descriptions: ['News and guides'],
      }),
    ).toBe('audience');
  });

  // Descriptions as production Brand Books wrote them, most with no call to action at all.
  it.each([
    ['Dickies provides work pants and apparel that survive abrasive daily wear', 'store'],
    ['Flatstation is the specialty coffee brand delivering freshly roasted 400g bags', 'store'],
    ['Vivo47 is the family fitness club combining boutique studios, pools and coworking', 'leads'],
    ['Hotel Casa Chu is an adults-only boutique wellness hotel offering 7 unique suites', 'leads'],
    ['Tangassi ofrece planes de previsión y servicios funerarios que congelan costos', 'leads'],
    ['Cuidándote con Sentido ofrece enfermería certificada respaldada por médicos', 'leads'],
  ] as const)('reads "%s" as %s', (description, model) => {
    expect(readBusinessModel({ calls: [], descriptions: [description] })).toBe(model);
  });

  it('never reads an agency that serves fashion brands as a store', () => {
    expect(
      readBusinessModel({
        calls: [],
        descriptions: ['The web, app and AI agency for fashion brands and their e-commerce'],
      }),
    ).not.toBe('store');
  });

  it('says nothing when the text does not name an action', () => {
    expect(readBusinessModel({ calls: [], descriptions: ['We love what we do.'] })).toBeNull();
    expect(readBusinessModel(null)).toBeNull();
  });
});

describe('readBrand — the mode', () => {
  it('sets up a brand with no account, its goal read from the Brand Book', () => {
    const reading = readBrand(
      brand({
        accounts: { ads: 0, organic: 0 },
        business: { calls: ['Book a demo'], descriptions: ['Request a quote today'] },
      }),
    );
    expect(reading.mode).toBe('setup');
    expect(ids(reading)[0]).toBe('setup');
    expect(reading.goal).toMatchObject({ source: 'business', label: 'Leads' });
    expect(reading.goal.suggested.map((objective) => objective.metric)).toEqual([
      'leads',
      'conversations',
    ]);
  });

  it('fixes first when an acting portfolio stopped reading data', () => {
    const reading = readBrand(
      brand({ portfolios: [portfolio({ name: 'Test — Google Ads', staleForDays: 22 })] }),
    );
    expect(reading.mode).toBe('fix');
    expect(ids(reading)[0]).toBe('health');
    expect(reading.issues).toEqual([
      { portfolioId: 'p1', title: 'Test — Google Ads has read no new data for 22 days' },
    ]);
  });

  it('ignores a portfolio that only observes', () => {
    const reading = readBrand(
      brand({ portfolios: [portfolio({ applyMode: 'observe', rosterAbsent: true })] }),
    );
    expect(reading.issues).toEqual([]);
    expect(reading.mode).toBe('recommend');
  });

  it('treats a paused autopilot as something to fix', () => {
    const reading = readBrand(
      brand({ portfolios: [portfolio({ applyMode: 'autopilot', autopilotPaused: true })] }),
    );
    expect(reading.mode).toBe('fix');
    expect(reading.issues[0]?.title).toBe('Autopilot is paused on Leads');
  });

  it('operates a brand whose portfolio runs on autopilot, opening with performance', () => {
    const reading = readBrand(brand({ portfolios: [portfolio({ applyMode: 'autopilot' })] }));
    expect(reading.mode).toBe('operate');
    expect(ids(reading)[0]).toBe('performance');
  });

  it('asks for approval when a portfolio proposes changes, opening with what waits', () => {
    const reading = readBrand(
      brand({ portfolios: [portfolio({ pendingRecommendations: 1, pendingBudgetMoves: 2 })] }),
    );
    expect(reading.mode).toBe('approve');
    expect(ids(reading)[0]).toBe('opportunities');
    expect(reading.opportunities[0]).toEqual({
      portfolioId: 'p1',
      title: '1 recommendation and 2 budget moves waiting in Leads',
      count: 3,
    });
  });

  it('asks for approval when the brand requires an approval chain', () => {
    expect(readBrand(brand({ approvalRequired: true })).mode).toBe('approve');
  });

  it('recommends when Continuum only reads, and offers a portfolio', () => {
    const reading = readBrand(brand());
    expect(reading.mode).toBe('recommend');
    expect(ids(reading)[0]).toBe('performance');
    expect(reading.opportunities[0]?.title).toBe(
      'Group your campaigns in a portfolio so Continuum can move budget toward your best result',
    );
  });
});

describe('readBrand — the order of the modules', () => {
  it('opens an organic-only brand with Organic +', () => {
    const reading = readBrand(brand({ accounts: { ads: 0, organic: 2 } }));
    expect(ids(reading)[0]).toBe('organic');
    expect(reading.modules[0]?.reason).toBe('Your only connected channel');
  });

  it('puts Creative + ahead of Organic + for a store', () => {
    const reading = readBrand(
      brand({ business: { calls: ['Shop the collection'], descriptions: ['Online store'] } }),
    );
    expect(ids(reading).indexOf('creative')).toBeLessThan(ids(reading).indexOf('organic'));
  });

  it('shows Health and Opportunities only when there is something in them', () => {
    expect(ids(readBrand(brand()))).toEqual(['performance', 'creative', 'organic']);
  });
});

describe('readBrand — the goal', () => {
  it('names the goal the team saved', () => {
    const reading = readBrand(
      brand({
        savedGoal: { id: 'tours', label: 'Tours booked', metric: 'purchases', role: 'primary' },
      }),
    );
    expect(reading.goal).toMatchObject({ source: 'team', label: 'Tours booked' });
  });

  it('defers to results when the brand has ads and no saved goal', () => {
    expect(readBrand(brand()).goal.source).toBe('results');
  });

  it('says it does not know yet rather than guessing', () => {
    const reading = readBrand(brand({ accounts: { ads: 0, organic: 0 } }));
    expect(reading.goal).toMatchObject({ source: 'none', label: 'Not set yet' });
  });
});
