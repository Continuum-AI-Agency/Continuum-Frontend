import { describe, expect, it } from 'bun:test';
import {
  type AdAccountCampaignSignal,
  type AdAccountFindings,
  type AdAccountPortfolioSignal,
  type AdAccountReading,
  type AdAccountSignals,
  EMPTY_AD_ACCOUNT_FINDINGS,
  readAdAccount,
} from './accountReading';

// Every figure below is a production read of 2026-11-02 (optimizer_list_portfolios,
// optimizer_get_platform_cards, optimizer_get_account_read and
// optimizer_get_account_platform_metrics), as the Frontend mappers turn it into signals.

const portfolio = (overrides: Partial<AdAccountPortfolioSignal>): AdAccountPortfolioSignal => ({
  id: 'p1',
  name: 'Portafolio',
  applyMode: 'recommend',
  canWrite: true,
  autopilotPaused: false,
  pendingRecommendations: 0,
  rosterAbsent: false,
  dailyBudget: null,
  goal: null,
  status: 'active',
  ...overrides,
});

const findings = (overrides: Partial<AdAccountFindings>): AdAccountFindings => ({
  ...structuredClone(EMPTY_AD_ACCOUNT_FINDINGS),
  ...overrides,
});

const campaign = (overrides: Partial<AdAccountCampaignSignal>): AdAccountCampaignSignal => ({
  id: 'c1',
  name: 'Campaña',
  type: 'search',
  spend: 0,
  results: null,
  impressions: null,
  adSets: null,
  lostToBudget: null,
  lostToRank: null,
  ...overrides,
});

const window7 = (spend: number, kind: string, results: number, costPerResult: number | null) => ({
  days: 7,
  since: '2026-10-26',
  until: '2026-11-01',
  spend,
  kinds: [{ kind, results, spend, costPerResult, priorResults: null, priorCostPerResult: null }],
});

/** Vivo 47 · Google 3710693645: the primary conversion counts GA4 user_engagement. */
const VIVO: AdAccountSignals = {
  platform: 'google_ads',
  accountId: '3710693645',
  currency: 'MXN',
  approvalRequired: false,
  portfolios: [
    portfolio({
      id: 'e642c737',
      name: 'Test 1 — Google Ads (Vivo 47)',
      canWrite: false,
      pendingRecommendations: 6,
      dailyBudget: 1179,
      objective: 'lead',
      resultKind: 'leads',
    }),
  ],
  findings: findings({
    cards: [
      { rule: 'V5', severity: 'medium' },
      { rule: 'V2', severity: 'medium' },
      { rule: 'E3', severity: 'medium' },
      { rule: 'G12', severity: 'high' },
      { rule: 'V1', severity: 'high' },
      { rule: 'V3', severity: 'medium' },
    ],
    inflated: {
      reported: 4051,
      attention: 3461,
      attentionShare: 0.85,
      real: 592,
      reportedCostPerResult: 10.09,
      realCostPerResult: 69.08,
      windowDays: 30,
    },
    brandTerms: { share: 0.51, brandSpend: 11937.38, nonBrandSpend: 11607.94 },
    budgetLost: [
      { rule: 'V3', campaign: 'VIVO 47-EKATAR', lostToBudget: 0.75, budgetPerDay: 1179 },
    ],
    lowQuality: { spend: 19943.25, services: 2, keywordSpendShare: 0.6 },
    valueMap: { actions: 5, flatValue: 1 },
    delivery: [
      {
        campaign: 'Gourmetería',
        accountWide: false,
        suspended: false,
        darkDays: 30,
        darkSince: '2026-10-03',
        budgetPerDay: 567,
        reasons: ['BIDDING_STRATEGY_LEARNING'],
      },
    ],
  }),
  window: window7(7622.354543, 'leads', 10, 762.2354543),
};

/** Easy Fit · Google 5251780631: Google suspended Search | Octubre | Easy Fit. */
const EASYFIT_GOOGLE: AdAccountSignals = {
  platform: 'google_ads',
  accountId: '5251780631',
  currency: 'MXN',
  approvalRequired: false,
  portfolios: [
    portfolio({
      id: 'b9cebbcf',
      name: 'Leads // Google Ads only',
      canWrite: false,
      pendingRecommendations: 12,
      dailyBudget: 670,
      goal: 99,
      objective: 'lead',
      resultKind: 'leads',
    }),
    portfolio({
      id: '5aaf5931',
      name: 'Test — Google Ads (Easy Fit)',
      canWrite: false,
      dailyBudget: 0,
      objective: 'lead',
      resultKind: 'leads',
      cycleCurrent: false,
    }),
  ],
  findings: findings({
    delivery: [
      {
        campaign: 'Search | Octubre | Easy Fit',
        accountWide: false,
        suspended: true,
        darkDays: 7,
        darkSince: '2026-10-26',
        budgetPerDay: 350,
        reasons: ['SERVING_STATUS_SUSPENDED'],
      },
    ],
    darkRun: { darkDays: 11, ongoing: false, latestSince: '2026-10-26' },
    valueMap: { actions: 6, flatValue: 1 },
    competitorTerms: { spend: 2150, competitors: ['smart fit', 'station 24'] },
    lowQuality: { spend: 4323.32, services: 2, keywordSpendShare: 0.29 },
    pmaxAssets: ['PMax | Octubre | Easy Fit | Leads'],
  }),
  window: window7(29.094547, 'leads', 1, 29.094547),
};

/** Pink Elephant · Google 6619636193: the client applies every change. */
const PINK: AdAccountSignals = {
  platform: 'google_ads',
  accountId: '6619636193',
  currency: 'MXN',
  approvalRequired: false,
  portfolios: [
    portfolio({
      id: 'e4db2796',
      name: 'Evento Webinar 29 Octubre',
      canWrite: false,
      pendingRecommendations: 9,
      dailyBudget: 100,
      objective: 'purchase',
      resultKind: 'purchases',
    }),
  ],
  findings: findings({
    cards: [{ rule: 'P5', severity: 'high' }],
    leadToSale: { leads: 11, sales: 1, salesValue: 737, roas: 0.08 },
    intentTerms: { spend: 797, terms: 63, themes: ['Free and downloads'], share: 0.21 },
    competitorTerms: { spend: 157, competitors: ['coursera', 'udemy', 'platzi'] },
    lowQuality: { spend: 3793.48, services: 6, keywordSpendShare: 0.48 },
    budgetLost: [
      { rule: 'G03', campaign: 'Eventos 2026', lostToBudget: 0.3418, budgetPerDay: 100 },
      {
        rule: 'G03',
        campaign: 'Cursos-pink-elephant-2025',
        lostToBudget: 0.2042,
        budgetPerDay: 200,
      },
    ],
    adWinner: {
      campaign: 'Cursos-pink-elephant-2025',
      winner: 'Curso ISO 22301 Fundamentos',
      winnerCostPerResult: 87.53,
      comparator: 'Norma ISO 22301 Certificación',
      comparatorCostPerResult: 318.63,
    },
  }),
  window: window7(631.564892, 'purchases', 0, null),
};

/** Tangassi · Google 9343596627: connected, no portfolio. */
const TANGASSI: AdAccountSignals = {
  platform: 'google_ads',
  accountId: '9343596627',
  currency: 'MXN',
  approvalRequired: false,
  portfolios: [],
  findings: findings({}),
  window: null,
};

/** Easy Fit · Meta act_521903353286118: Conversaciones Whatsapp on autopilot. */
const EASYFIT_META: AdAccountSignals = {
  platform: 'meta',
  accountId: 'act_521903353286118',
  currency: 'MXN',
  approvalRequired: false,
  portfolios: [
    portfolio({
      id: '94ca5d79',
      name: 'Leads // Google Ads only',
      dailyBudget: 50,
      objective: 'lead',
      resultKind: 'leads',
    }),
    portfolio({
      id: '0fd6f383',
      name: 'Conversaciones Whatsapp',
      applyMode: 'autopilot',
      pendingRecommendations: 6,
      dailyBudget: 3000,
      goal: 45,
      objective: 'conversations',
      resultKind: 'conversations',
      maxChangePct: 0.2,
      cycleCurrent: true,
    }),
    portfolio({
      id: 'ec956b3d',
      name: 'Tours Programados - Octubre',
      applyMode: 'autopilot',
      rosterAbsent: true,
      rosterMissing: 3,
      dailyBudget: 460,
      goal: 296,
      objective: 'purchase',
      resultKind: 'purchases',
      cycleCurrent: false,
    }),
  ],
  findings: findings({
    cards: [{ rule: 'delivery_collapse', severity: 'medium' }],
    deliveryCollapse: [
      {
        portfolioId: '94ca5d79',
        portfolio: 'Leads // Google Ads only',
        plannedPerDay: 2795,
        deliveredPerDay: 0,
      },
    ],
  }),
  window: window7(24543.57, 'conversations', 462, 53.12461038961039),
};

const modules = (reading: AdAccountReading) => reading.board.map((slot) => slot.module);
const slot = (reading: AdAccountReading, module: string) =>
  reading.board.find((entry) => entry.module === module);

describe('readAdAccount — the five real accounts', () => {
  it('Vivo 47 opens with the conversion signal and counts the real results', () => {
    const reading = readAdAccount(VIVO);
    expect(reading.mode).toBe('fix');
    expect(reading.modeLabel).toBe('Fix first');
    expect(reading.modeReason).toContain('85%');
    expect(reading.modeReason).toContain('4,051');
    expect(reading.board[0]).toMatchObject({ module: 'signal', size: 'l', score: 100 });
    expect(reading.result).toMatchObject({
      count: 592,
      platformReported: 4051,
      costPerResult: 69.08,
      windowDays: 30,
      source: 'inflated_conversion',
    });
    expect(slot(reading, 'auction')?.reason).toBe(
      'VIVO 47-EKATAR pierde 75% de sus impresiones por presupuesto, y la subida espera a que se corrija la conversión.',
    );
    expect(slot(reading, 'terms')?.reason).toContain('51%');
    expect(slot(reading, 'quality')?.reason).toContain('60%');
    // Gourmetería has been dark 30 days, but at 34% of what the account moves it is a notice.
    expect(reading.notices?.[0]?.reason).toContain('Gourmetería');
    expect(reading.notices?.[0]?.share).toBeLessThan(0.5);
    expect(reading.asks).toEqual([
      '¿Cuántos leads reales llevo este mes?',
      '¿Por qué no subimos el presupuesto de VIVO 47-EKATAR?',
      '¿Qué páginas subirían el Quality Score?',
    ]);
  });

  it('Easy Fit Google opens with the suspension, the dark-days lens first', () => {
    const reading = readAdAccount(EASYFIT_GOOGLE);
    expect(reading.mode).toBe('fix');
    expect(reading.modeReason).toBe(
      'Google suspendió Search | Octubre | Easy Fit: no muestra anuncios desde el 26 oct (7 días), con $350 MXN al día, 99% de lo que mueve la cuenta al día.',
    );
    expect(reading.board[0]).toMatchObject({ module: 'auction', size: 'l', score: 100 });
    expect(reading.result).toMatchObject({ count: 1, goal: 99, source: 'producer', windowDays: 7 });
    expect(slot(reading, 'result')?.reason).toBe(
      '1 lead en 7 días a $29.09 MXN contra una meta de $99.00 MXN.',
    );
    expect(reading.asks[0]).toBe('¿Por qué no hay anuncios desde el 26 oct?');
  });

  it('Pink Elephant reads as Continuum recommends, the client checklist first', () => {
    const reading = readAdAccount(PINK);
    expect(reading.mode).toBe('recommend');
    expect(reading.modeReason).toContain('el cliente');
    expect(reading.board[0]).toMatchObject({ module: 'decisions', size: 'l' });
    expect(slot(reading, 'decisions')?.reason).toBe(
      '9 recomendaciones esperan al cliente, 1 de prioridad alta.',
    );
    expect(slot(reading, 'signal')?.reason).toBe(
      '11 leads dieron 1 venta de $737 MXN: menos de 1 de cada 5 leads compra.',
    );
    expect(slot(reading, 'terms')?.reason).toContain('63 búsquedas sin intención de compra');
    expect(slot(reading, 'auction')?.reason).toContain('Eventos 2026 pierde 34%');
    // Search only: the PMax lens shows the winning ad.
    expect(slot(reading, 'pmax')?.reason).toContain('Curso ISO 22301 Fundamentos');
    expect(reading.asks[0]).toBe('¿Qué le mando al cliente esta semana?');
  });

  it('Tangassi is setting up: the first portfolio leads, the detectors wait for a cycle', () => {
    const reading = readAdAccount(TANGASSI);
    expect(reading.mode).toBe('setup');
    expect(reading.board[0]).toMatchObject({ module: 'portfolios', size: 'w' });
    expect(modules(reading)).toEqual(['portfolios', 'result', 'decisions']);
    for (const module of ['terms', 'quality', 'signal'] as const) {
      expect(reading.hidden.find((entry) => entry.module === module)?.reason).toContain(
        'Se lee con el primer ciclo',
      );
    }
    expect(reading.asks[0]).toBe('¿Qué meta le pongo al primer portafolio?');
  });

  it('Easy Fit Meta stays on Autopilot: Tours and the idle portfolio are notices', () => {
    const reading = readAdAccount(EASYFIT_META);
    expect(reading.mode).toBe('operate');
    expect(reading.modeLabel).toBe('Autopilot');
    expect(reading.modeReason).toContain('Conversaciones Whatsapp opera en autopilot');
    expect(reading.modeReason).toContain('20% por ciclo');
    expect(reading.modeReason).toContain('queda como aviso');
    expect(reading.board[0]).toMatchObject({ module: 'decisions', size: 'l' });
    expect(reading.notices?.map((notice) => notice.module)).toEqual(['portfolios', 'structure']);
    expect(reading.notices?.every((notice) => (notice.share ?? 1) < 0.5)).toBe(true);
    expect(slot(reading, 'structure')?.reason).toBe(
      'Tours Programados - Octubre perdió sus 3 conjuntos: sus $460 MXN al día (12% de lo que mueve la cuenta al día) no tienen dónde gastarse.',
    );
    expect(reading.result).toMatchObject({ count: 462, goal: 45, label: 'conversaciones' });
    expect(reading.asks).toContain('¿Qué pasó con Tours Programados - Octubre?');
  });
});

describe('readAdAccount — the rules', () => {
  it('a problem under half of what the account moves is a notice and the mode stays', () => {
    // The same suspended campaign on an account spending 1,000 a day: 350 / 1,350 = 26%.
    const reading = readAdAccount({
      ...EASYFIT_GOOGLE,
      window: window7(7000, 'leads', 70, 100),
    });
    expect(reading.mode).toBe('recommend');
    expect(reading.notices?.[0]?.share).toBeCloseTo(350 / 1350, 5);
    expect(reading.notices?.[0]?.reason).toContain('26%');
  });

  it('an account-wide dark card puts the board in Fix first whatever it spent', () => {
    const reading = readAdAccount({
      ...EASYFIT_GOOGLE,
      window: window7(7000, 'leads', 70, 100),
      findings: findings({
        delivery: [
          {
            campaign: 'Search | Octubre | Easy Fit',
            accountWide: true,
            suspended: true,
            darkDays: 5,
            darkSince: '2026-10-26',
            budgetPerDay: 670,
            reasons: ['SERVING_STATUS_SUSPENDED', 'BUDGET_CONSTRAINED'],
          },
        ],
      }),
    });
    expect(reading.mode).toBe('fix');
    expect(reading.modeReason).toBe(
      'Ninguna campaña muestra anuncios desde hace 5 días: Google suspendió la cuenta.',
    );
  });

  it('a dark run still going opens the board; one that ended only fills the calendar', () => {
    const going = readAdAccount({
      ...TANGASSI,
      portfolios: EASYFIT_GOOGLE.portfolios,
      findings: findings({ darkRun: { darkDays: 3, ongoing: true, latestSince: '2026-10-30' } }),
    });
    expect(going.mode).toBe('fix');
    expect(going.board[0]?.module).toBe('auction');
    const ended = readAdAccount({
      ...TANGASSI,
      portfolios: EASYFIT_GOOGLE.portfolios,
      findings: findings({ darkRun: { darkDays: 11, ongoing: false, latestSince: '2026-10-26' } }),
    });
    expect(ended.mode).toBe('recommend');
    expect(slot(ended, 'auction')?.reason).toBe(
      'La cuenta tuvo 11 días sin anuncios en la ventana y volvió a entregar.',
    );
  });

  it("without the producer's spend, a problem is measured against the other portfolios' plans", () => {
    // Leads // Google Ads only plans 2,795 a day by its own card and delivers nothing; the other
    // two plan 3,460: 2,795 / 6,255 = 45%, a notice.
    const reading = readAdAccount({ ...EASYFIT_META, window: null });
    expect(reading.mode).toBe('operate');
    expect(reading.notices?.[0]?.share).toBeCloseTo(2795 / (2795 + 3460), 5);
    expect(reading.notices?.[0]?.reason).toContain('45% de lo que la cuenta planea mover al día');
  });

  it('a portfolio that lost its campaigns opens the board only when it carries half or more', () => {
    const heavy = readAdAccount({
      ...EASYFIT_META,
      findings: findings({}),
      window: window7(2100, 'conversations', 40, 52.5),
    });
    // Tours' 460 a day against 300 a day spent: 61%.
    expect(heavy.mode).toBe('fix');
    expect(heavy.board[0]?.module).toBe('structure');
    expect(heavy.modeReason).toContain('Tours Programados - Octubre perdió sus 3 conjuntos');
  });

  it('modes: approval chain, writable without autopilot, observe only', () => {
    const writable = EASYFIT_META.portfolios.slice(0, 1);
    expect(
      readAdAccount({ ...EASYFIT_META, findings: findings({}), approvalRequired: true }).mode,
    ).toBe('approve');
    expect(
      readAdAccount({ ...EASYFIT_META, portfolios: writable, findings: findings({}) }).mode,
    ).toBe('approve');
    const observing = readAdAccount({
      ...EASYFIT_META,
      findings: findings({}),
      portfolios: [portfolio({ applyMode: 'observe', name: 'Solo mira' })],
    });
    expect(observing.mode).toBe('recommend');
    expect(observing.modeReason).toContain('solo observa');
    const paused = readAdAccount({
      ...EASYFIT_META,
      findings: findings({}),
      portfolios: [
        portfolio({
          applyMode: 'autopilot',
          autopilotPaused: true,
          name: 'Pausado',
          dailyBudget: 1,
        }),
      ],
    });
    expect(paused.mode).toBe('approve');
  });

  it('sizes by score: the top slot l, the next two m, the rest s, portfolios always w', () => {
    for (const signals of [VIVO, EASYFIT_GOOGLE, PINK, TANGASSI, EASYFIT_META]) {
      const reading = readAdAccount(signals);
      const scores = reading.board.map((entry) => entry.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      const sized = reading.board.filter((entry) => entry.module !== 'portfolios');
      sized.forEach((entry, index) => {
        expect(entry.size).toBe(index === 0 ? 'l' : index <= 2 ? 'm' : 's');
      });
      expect(slot(reading, 'portfolios')?.size).toBe('w');
      expect(reading.board.every((entry) => entry.score >= 0 && entry.score <= 100)).toBe(true);
    }
  });

  it('keeps the spine, names a figure in every reason and asks three questions', () => {
    for (const signals of [VIVO, EASYFIT_GOOGLE, PINK, TANGASSI, EASYFIT_META]) {
      const reading = readAdAccount(signals);
      expect(modules(reading)).toEqual(
        expect.arrayContaining(['result', 'decisions', 'portfolios']),
      );
      for (const entry of reading.board) expect(entry.reason).toMatch(/\d/);
      expect(reading.modeReason).toMatch(/\d/);
      expect(reading.asks).toHaveLength(3);
      expect(new Set(reading.asks).size).toBe(3);
      const considered = [...modules(reading), ...reading.hidden.map((entry) => entry.module)];
      expect(new Set(considered).size).toBe(considered.length);
    }
  });

  it('the Google lenses fire from the campaign read at their thresholds', () => {
    const base: AdAccountSignals = {
      ...PINK,
      findings: findings({ cards: [] }),
      campaigns: {
        windowDays: 14,
        resultKind: 'leads',
        campaigns: [
          campaign({
            id: 'a',
            name: 'VIVO 47-EKATAR',
            spend: 35606.55,
            results: 570,
            lostToRank: 0.12,
          }),
          campaign({
            id: 'b',
            name: 'SALES-PMAX-OCTUBRE',
            type: 'pmax',
            spend: 7189.83,
            results: 2.2,
          }),
        ],
      },
    };
    const reading = readAdAccount(base);
    expect(slot(reading, 'mix')?.reason).toBe(
      'Search lleva 83% del gasto y 100% de los leads, en 1 campaña.',
    );
    expect(slot(reading, 'auction')?.reason).toBe(
      'VIVO 47-EKATAR pierde 12% de sus impresiones por ranking.',
    );
    expect(reading.hidden.find((entry) => entry.module === 'pmax')?.reason).toContain('17%');
    const one = readAdAccount({
      ...base,
      campaigns: { windowDays: 14, resultKind: 'leads', campaigns: [campaign({ spend: 10 })] },
    });
    expect(one.hidden.find((entry) => entry.module === 'mix')?.reason).toBe(
      '1 tipo de campaña y 1 campaña con gasto: no hay mezcla que comparar.',
    );
  });

  it('the Meta views read the campaigns: branches, headroom and one ad set per campaign', () => {
    const rows = [
      ['CAÑADAS // MENSAJES', 21654.56, 450415, 43],
      ['AV CAMACHO // MENSAJES', 18162.09, 345627, 45],
      ['OCTUBRE // ALEIRA // MENSAJES', 17527.54, 403819, 53],
    ] as const;
    const reading = readAdAccount({
      ...EASYFIT_META,
      findings: findings({}),
      campaigns: {
        windowDays: 7,
        resultKind: 'conversations',
        campaigns: rows.map(([name, spend, impressions, results], index) =>
          campaign({
            id: String(index),
            name,
            type: 'campaign',
            spend,
            impressions,
            results,
            adSets: 1,
          }),
        ),
      },
    });
    expect(slot(reading, 'branches')?.reason).toBe(
      '3 campañas con gasto: OCTUBRE // ALEIRA // MENSAJES consigue conversaciones a $331 MXN y CAÑADAS // MENSAJES a $504 MXN.',
    );
    expect(slot(reading, 'headroom')?.reason).toBe(
      'El CPM va de $43.40 MXN en OCTUBRE // ALEIRA // MENSAJES a $52.55 MXN en AV CAMACHO // MENSAJES.',
    );
  });

  it('says what it could not read', () => {
    const reading = readAdAccount({
      ...VIVO,
      findings: null,
      missing: [{ input: 'cards', reason: 'No se leyeron las tarjetas: la lectura falló.' }],
    });
    expect(reading.missing).toEqual(['No se leyeron las tarjetas: la lectura falló.']);
    expect(reading.hidden.find((entry) => entry.module === 'signal')?.reason).toBe(
      'No se leyeron las tarjetas: la lectura falló.',
    );
    expect(reading.mode).toBe('recommend');
  });
});
