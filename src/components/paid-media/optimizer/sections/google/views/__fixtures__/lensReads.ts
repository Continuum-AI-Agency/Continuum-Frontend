// Fixture reads for the board's Google lenses (Search terms, Quality Score, Performance Max),
// from the live reads of 2026-10-31 (Continuum MCP, Oct 1–31, MXN): Vivo 47 3710693645, Pink
// Elephant 6619636193, Easy Fit 5251780631 and Tangassi 9343596627, and the design page's
// figures built from them (docs/optimizer-redesign/adaptive-15/data.js). Shaped by the
// contracts; the tests parse each through its schema.
//
// What is real and what stands in, so no test reads a figure nobody measured:
// - Every named term, keyword, campaign and card figure is the read's own.
// - Where the read gave a bucket's total but not its terms, one row named "(… aggregated)" holds
//   that real total: Vivo 47's other brand terms and its non-brand terms, Pink's off-intent
//   themes and two competitors, Easy Fit's keywords per score above 3 and its unscored ones.
//   Their conversions are derived from the card's cost per conversion where one was given.
// - Clicks and impressions the read did not give are 0; no lens reads them. A campaign's
//   60-day totals repeat its window: no lens reads them either.

import type {
  GoogleKeywordQualityRead,
  GoogleSignalsRead,
  KeywordQuality,
  PlatformCard,
} from '@continuum/contracts';

export const OCTOBER = { since: '2026-10-01', until: '2026-10-31' };

type Google = NonNullable<NonNullable<GoogleSignalsRead['signals']>['google']>;
type Term = NonNullable<Google['search_terms']>[number];
type Profile = NonNullable<Google['profile']>;
type Campaign = NonNullable<Google['campaigns']>[number];
type GoogleBlock = NonNullable<GoogleSignalsRead['blocks']>[number];

export function signalsRead(
  accountId: string,
  google: Google,
  blocks: GoogleBlock[],
): GoogleSignalsRead {
  return {
    scope: 'google_signals',
    accountId,
    timezone: 'America/Mexico_City',
    fetched_at: '2026-11-01T06:00:00Z',
    blocks,
    signals: { account_id: accountId, currency: 'MXN', window: OCTOBER, google },
    skipped: {},
    rejected: [],
  };
}

function term(
  text: string,
  campaignId: string,
  spend: number,
  conversions: number,
  clicks = 0,
  matched: string | null = null,
): Term {
  return {
    term: text,
    campaign_id: campaignId,
    ad_group_id: `${campaignId}-ag`,
    status: 'NONE',
    matched_keyword: matched,
    totals: { spend, impressions: 0, clicks, conversions },
  };
}

function profile(brand: string[], competitors: string[], clientExecutes = false): Profile {
  return {
    brand_name: null,
    customer_name: null,
    client_executes: clientExecutes,
    brand_terms: brand,
    brand_terms_source: 'inferred',
    competitor_terms: competitors,
    competitor_terms_source: 'inferred',
    course_lines: null,
    checklist: [],
  };
}

const TERM_BLOCKS: GoogleBlock[] = ['profile', 'search_terms'];

/** Vivo 47: brand $13,353 (54%) at $8.95 per conversion, non-brand $11,366 at $9.50 (V2 card);
 *  the named brand terms are the read's own. */
export function vivoTermsRead(): GoogleSignalsRead {
  return signalsRead(
    '3710693645',
    {
      search_terms: [
        term('vivo 47', 'ekatar', 5639.38, 651),
        term('vivo 47 naciones unidas', 'ekatar', 1554.07, 178),
        term('vivo47', 'ekatar', 974.54, 134),
        term('vivo 47 valle real', 'ekatar', 779.36, 132),
        term('vivo 47 (other brand terms, aggregated)', 'ekatar', 4405.61, 397),
        term('other non-brand terms (aggregated)', 'ekatar', 11365.53, 1196),
      ],
      profile: profile(['vivo 47', 'vivo47'], []),
    },
    TERM_BLOCKS,
  );
}

/** Pink Elephant: $805 (21%) with no intent to buy and $160 on competitors, none converting
 *  (P3 and E4 cards); the rest of the term spend, derived from the 21%, holds the 11 leads. */
export function pinkTermsRead(): GoogleSignalsRead {
  return signalsRead(
    '6619636193',
    {
      search_terms: [
        term('course searches with intent (aggregated)', 'cursos-2025', 2867, 11),
        term('gratis (free and downloads, aggregated)', 'cursos-2025', 354, 0),
        term('que es (students and homework, aggregated)', 'cursos-2025', 239, 0),
        term('cursos disponibles (generic course browsing, aggregated)', 'cursos-2025', 145, 0),
        term('tutorial (support and how-to, aggregated)', 'itsm-2026', 62, 0),
        term('cursos para salir con trabajo', 'cursos-2025', 5.29, 0),
        term('coursera (4 terms, aggregated)', 'cursos-2025', 140, 0),
        term('udemy (5 terms, aggregated)', 'itsm-2026', 18.49, 0),
        term('platzi com cursos', 'cursos-2025', 2.18, 0),
      ],
      profile: profile(['pink elephant', 'pinkelephant'], ['coursera', 'platzi', 'udemy'], true),
    },
    TERM_BLOCKS,
  );
}

/** Easy Fit: the five terms the read named, "smart fit" among them with no conversion. */
export function easyFitTermsRead(): GoogleSignalsRead {
  return signalsRead(
    '5251780631',
    {
      search_terms: [
        term('easy fit', 'search-octubre', 979, 1, 239),
        term('easy fit', 'leads-formulario', 923, 1),
        term('gym cerca de mi', 'search-octubre', 470, 1),
        term('smart fit', 'ga-1-easy', 248, 0, 0, 'smart fit precios'),
        term('easy fit avila camacho', 'search-octubre', 215, 0),
      ],
      profile: profile(['easy fit', 'easyfit'], ['smart fit']),
    },
    TERM_BLOCKS,
  );
}

type Finding = Extract<PlatformCard, { variant: 'google_account_finding' }>;

function finding(card: Omit<Finding, 'variant' | 'currency' | 'window_days'>): Finding {
  return { variant: 'google_account_finding', currency: 'MXN', window_days: 30, ...card };
}

/** Pink's P3 card: the off-intent terms by theme (the engine's theme names). */
export const PINK_INTENT_CARD: PlatformCard = finding({
  idea: 'intent_negatives',
  headline: 'Searches with the wrong intent — negative lists by theme',
  campaign_name: null,
  recommend_only: true,
  facts: [
    { label: 'Free and downloads', value: '$354 MXN · "curso itil v4 gratis"' },
    { label: 'Students and homework', value: '$239 MXN · "que es scrum"' },
    { label: 'Generic course browsing', value: '$145 MXN · "cursos disponibles"' },
    { label: 'Support and how-to', value: '$62 MXN · "glpi tutorial español"' },
    { label: 'Jobs and salaries', value: '$5.29 MXN · "cursos para salir con trabajo"' },
  ],
  negatives: [
    {
      theme: 'Free and downloads',
      terms: [
        'gratis (free and downloads, aggregated)',
        'certificación itil gratis',
        'curso itil v4 gratis',
      ],
    },
    {
      theme: 'Students and homework',
      terms: ['que es (students and homework, aggregated)', 'que es scrum'],
    },
    {
      theme: 'Generic course browsing',
      terms: ['cursos disponibles (generic course browsing, aggregated)', 'cursos en línea'],
    },
    {
      theme: 'Support and how-to',
      terms: ['tutorial (support and how-to, aggregated)', 'glpi tutorial español'],
    },
    { theme: 'Jobs and salaries', terms: ['cursos para salir con trabajo'] },
  ],
  checklist: [
    {
      label: 'Paste each list as negatives (phrase match) on the Search campaigns',
      status: null,
      detail: null,
    },
  ],
  blocked: null,
});

/** Pink's E4 card: coursera $140 (4 terms), udemy $18.49 (5), platzi $2.18 (1). */
export const PINK_COMPETITOR_CARD: PlatformCard = finding({
  idea: 'competitor_terms',
  headline: 'Competitor searches spend and do not convert',
  campaign_name: null,
  recommend_only: true,
  facts: [
    { label: 'Spend on competitor searches', value: '$160.67 MXN · 0 conversions' },
    { label: 'coursera', value: '$140 MXN · 4 terms' },
    { label: 'udemy', value: '$18.49 MXN · 5 terms' },
    { label: 'platzi', value: '$2.18 MXN · 1 term' },
  ],
  negatives: [
    { theme: 'coursera', terms: ['coursera (4 terms, aggregated)', 'coursera business courses'] },
    { theme: 'udemy', terms: ['udemy (5 terms, aggregated)', 'udemy iso 42001'] },
    { theme: 'platzi', terms: ['platzi com cursos'] },
  ],
  checklist: [],
  blocked: null,
});

function keyword(
  id: string,
  text: string,
  score: number | null,
  spend: number,
  ratings: [string | null, string | null, string | null] = [null, null, null],
  conversions: number | null = null,
): KeywordQuality {
  return {
    criterion_id: id,
    keyword: text,
    match_type: 'PHRASE',
    campaign: 'Search | Octubre | Easy Fit',
    ad_group: 'Easy Fit',
    quality_score: score,
    expected_ctr: ratings[0],
    ad_relevance: ratings[1],
    landing_page_experience: ratings[2],
    metrics: { spend, impressions: 0, clicks: 0, conversions },
  };
}

const B = 'BELOW_AVERAGE';
const A = 'AVERAGE';
const H = 'ABOVE_AVERAGE';

/** Easy Fit's keyword read: $14,873 of keyword spend, $4,323 (29%) at Quality Score ≤ 3, 26 of
 *  50 keywords scored, average 5.19; each score's spend is the read's own to the cent. */
export function easyFitKeywordQuality(): GoogleKeywordQualityRead {
  const keywords = [
    keyword('1', 'gym en zapopan', 1, 26, [B, B, B]),
    keyword('2', 'other QS 1 keywords (aggregated)', 1, 19.41),
    keyword('3', 'gym 24 horas', 2, 811, [B, A, B]),
    keyword('4', 'gym', 2, 476.63, [B, A, B]),
    keyword('5', 'entrenamiento funcional', 3, 2354.3, [B, H, B], 6.07),
    keyword('6', 'gym cerca de mí', 3, 275, [B, H, B]),
    keyword('7', 'gimnasios', 3, 197, [B, H, B]),
    keyword('8', 'gimnasios en guadalajara', 3, 83),
    keyword('9', 'gimnasio', 3, 71),
    keyword('10', 'other QS 3 keywords (aggregated)', 3, 9.98),
    keyword('11', 'QS 4 keywords (aggregated)', 4, 471.32),
    keyword('12', 'QS 5 keywords (aggregated)', 5, 612.47),
    keyword('13', 'QS 6 keywords (aggregated)', 6, 1340.42),
    keyword('14', 'QS 7 keywords (aggregated)', 7, 303.17),
    keyword('15', 'QS 8 keywords (aggregated)', 8, 1463.55),
    keyword('16', 'QS 9 keywords (aggregated)', 9, 1259.86),
    keyword('17', 'QS 10 keywords (aggregated)', 10, 1694.42, [H, H, H]),
    keyword('18', 'unscored keywords (aggregated)', null, 3404.61),
  ];
  return {
    scope: 'keyword_quality',
    range: OCTOBER,
    total_keywords: 50,
    scored_keywords: 26,
    average_quality_score: 5.19,
    keywords,
    currency: 'MXN',
  };
}

function campaign(
  id: string,
  name: string,
  channel: string,
  spend: number,
  conversions: number,
  extra: Partial<
    Pick<
      Campaign,
      'budget_per_day' | 'rank_lost_impression_share' | 'budget_lost_impression_share' | 'status'
    >
  > & {
    impressions?: number;
    clicks?: number;
  } = {},
): Campaign {
  const totals = {
    spend,
    impressions: extra.impressions ?? 0,
    clicks: extra.clicks ?? 0,
    conversions,
    conversions_value: 0,
  };
  return {
    campaign_id: id,
    name,
    status: extra.status ?? 'ENABLED',
    channel_type: channel,
    budget_per_day: extra.budget_per_day ?? null,
    totals,
    totals_60d: totals,
    budget_lost_impression_share: extra.budget_lost_impression_share ?? null,
    rank_lost_impression_share: extra.rank_lost_impression_share ?? null,
  };
}

const PMAX_BLOCKS: GoogleBlock[] = ['asset_groups', 'bid_targets', 'campaigns'];

/** Vivo 47: SALES-PMAX-OCTUBRE $7,189.83 for 2.19 conversions ($3,283 each against a $400
 *  goal), 78% lost to rank, one asset group rated Average (V4 card); EKATAR is the rest. */
export function vivoPmaxRead(targetCpa: number | null = null): GoogleSignalsRead {
  return signalsRead(
    '3710693645',
    {
      campaigns: [
        campaign('ekatar', 'VIVO 47-EKATAR', 'SEARCH', 35606.55, 3854.81, {
          budget_per_day: 1179,
          budget_lost_impression_share: 0.74,
          impressions: 151153,
          clicks: 4168,
        }),
        campaign('sales-pmax', 'SALES-PMAX-OCTUBRE', 'PERFORMANCE_MAX', 7189.83, 2.19, {
          budget_per_day: 450,
          rank_lost_impression_share: 0.78,
          impressions: 69344,
          clicks: 2714,
        }),
      ],
      bid_targets: [
        {
          campaign_id: 'sales-pmax',
          strategy: targetCpa === null ? 'maximize_conversions' : 'target_cpa',
          target_cpa: targetCpa,
          target_roas: null,
          system_status: 'ENABLED',
          last_changed_at: null,
        },
      ],
      asset_groups: [
        {
          asset_group_id: 'ag-vivo-1',
          campaign_id: 'sales-pmax',
          name: 'Grupo de recursos 1',
          ad_strength: 'AVERAGE',
          primary_status: null,
          missing: ['1 square YouTube video'],
        },
      ],
    },
    PMAX_BLOCKS,
  );
}

/** Vivo 47's V4 card, as the producer worded it. */
export const VIVO_PMAX_CARD: PlatformCard = finding({
  idea: 'pmax_rescue_or_pause',
  headline: 'Rescue or pause this Performance Max',
  campaign_name: 'SALES-PMAX-OCTUBRE',
  recommend_only: false,
  facts: [
    { label: 'Cost per conversion', value: '$3,283 MXN' },
    { label: 'Target', value: '$400 MXN' },
    { label: 'Asset strength', value: 'Grupo de recursos 1: AVERAGE' },
    { label: 'Lost to rank', value: '78%' },
  ],
  checklist: [
    {
      label: 'Option A — rebuild the assets with Jaina',
      status: null,
      detail: 'Missing: 1 square YouTube video',
    },
    { label: 'Option B — pause it and move its $450 MXN/day', status: null, detail: null },
  ],
  blocked: null,
});

/** Easy Fit's top five campaigns: two Performance Max at $23.73 and $30.99 per conversion
 *  against the $99 portfolio goal, 38% of the five's spend. Its asset groups were not in the
 *  read, so the block is left out. */
export function easyFitPmaxRead(): GoogleSignalsRead {
  return signalsRead(
    '5251780631',
    {
      campaigns: [
        campaign('leads-formulario', 'Easy Fit | Search | Leads formulario', 'SEARCH', 6317.45, 20),
        campaign('ga-1-easy', 'GA 1 EASY', 'SEARCH', 6196.14, 5.07),
        campaign('easy-fit-pmax', 'Easy Fit', 'PERFORMANCE_MAX', 5577.88, 180),
        campaign(
          'pmax-octubre',
          'PMax | Octubre | Easy Fit | Leads',
          'PERFORMANCE_MAX',
          4720.67,
          198.97,
          {
            budget_per_day: 320,
          },
        ),
        campaign('search-octubre', 'Search | Octubre | Easy Fit', 'SEARCH', 4086.75, 8, {
          budget_per_day: 350,
        }),
      ],
      bid_targets: [],
    },
    ['bid_targets', 'campaigns'],
  );
}

/** Tangassi: no portfolio, so no goal; Necesidades SLP holds 70% of the spend at $331.70. */
export function tangassiPmaxRead(): GoogleSignalsRead {
  return signalsRead(
    '9343596627',
    {
      campaigns: [
        campaign('necesidades-slp', 'Necesidades SLP', 'PERFORMANCE_MAX', 2653.56, 8, {
          impressions: 9673,
          clicks: 713,
        }),
        campaign('landing-goto', 'Landing-Goto', 'SEARCH', 1119.02, 7, {
          impressions: 1213,
          clicks: 176,
        }),
      ],
      bid_targets: [],
      asset_groups: [],
    },
    PMAX_BLOCKS,
  );
}

/** Pink Elephant: three Search campaigns and no Performance Max. Their conversions were not
 *  part of the read (0 here); the lens reads none. */
export function pinkCampaignsRead(): GoogleSignalsRead {
  return signalsRead(
    '6619636193',
    {
      campaigns: [
        campaign('cursos-2025', 'Cursos-pink-elephant-2025', 'SEARCH', 5305, 0, {
          budget_per_day: 200,
          budget_lost_impression_share: 0.16,
        }),
        campaign('itsm-2026', 'ITSM 2026', 'SEARCH', 3122.91, 0, {
          budget_per_day: 200,
          budget_lost_impression_share: 0.21,
        }),
        campaign('eventos-2026', 'Eventos 2026', 'SEARCH', 1079.58, 0, {
          budget_per_day: 100,
          budget_lost_impression_share: 0.38,
        }),
      ],
      bid_targets: [],
      asset_groups: [],
    },
    PMAX_BLOCKS,
  );
}

/** Pink's G10 card: "Curso ISO 22301 Fundamentos" at $88.98 on 3.5 conversions against "Norma
 *  ISO 22301 Certificación" at $331.87. */
export const PINK_AD_WINNER: PlatformCard = {
  variant: 'google_ad_winner',
  campaign_name: 'Cursos-pink-elephant-2025',
  ad_group_name: 'ISO/IEC 22301: Business Continuity',
  currency: 'MXN',
  window_days: 30,
  winner: { label: 'Curso ISO 22301 Fundamentos', cost_per_result: 88.98, conversions: 3.5 },
  comparator: { label: 'Norma ISO 22301 Certificación', cost_per_result: 331.87 },
  best_assets: [],
};

// The same three P8 cards as the engine writes them once decision 3 ships (every card's text in
// the account's language: packages/optimization-engine accountDetectors.ts). Live rows stay
// English until deploy:optimizer, so a lens must read both: the terms, ideas, campaigns and
// figures are the same; only the words around them change.

/** Pink's P3 card in Spanish: the themes renamed, the terms as Google reported them. */
export const PINK_INTENT_CARD_ES: PlatformCard = finding({
  idea: 'intent_negatives',
  headline: '65 términos de búsqueda sin intención de compra: $805 MXN y 0 conversiones',
  campaign_name: null,
  recommend_only: true,
  facts: [
    { label: 'Gratis y descargas', value: '$354 MXN · "curso itil v4 gratis"' },
    { label: 'Estudiantes y tareas', value: '$239 MXN · "que es scrum"' },
    { label: 'Búsquedas genéricas de cursos', value: '$145 MXN · "cursos disponibles"' },
    { label: 'Soporte y tutoriales', value: '$62.00 MXN · "glpi tutorial español"' },
    { label: 'Empleos y sueldos', value: '$5.29 MXN · "cursos para salir con trabajo"' },
  ],
  negatives: [
    {
      theme: 'Gratis y descargas',
      terms: [
        'gratis (free and downloads, aggregated)',
        'certificación itil gratis',
        'curso itil v4 gratis',
      ],
    },
    {
      theme: 'Estudiantes y tareas',
      terms: ['que es (students and homework, aggregated)', 'que es scrum'],
    },
    {
      theme: 'Búsquedas genéricas de cursos',
      terms: ['cursos disponibles (generic course browsing, aggregated)', 'cursos en línea'],
    },
    {
      theme: 'Soporte y tutoriales',
      terms: ['tutorial (support and how-to, aggregated)', 'glpi tutorial español'],
    },
    { theme: 'Empleos y sueldos', terms: ['cursos para salir con trabajo'] },
  ],
  checklist: [
    {
      label: 'Pega cada lista como negativas de concordancia de frase en las campañas de búsqueda',
      status: null,
      detail: null,
    },
  ],
  blocked: null,
});

/** Pink's E4 card in Spanish: the competitors keep their names. */
export const PINK_COMPETITOR_CARD_ES: PlatformCard = finding({
  idea: 'competitor_terms',
  headline: 'Búsquedas de competidores: $161 MXN y 0 conversiones',
  campaign_name: null,
  recommend_only: true,
  facts: [
    { label: 'Gasto en búsquedas de competidores', value: '$161 MXN · 0 conversiones' },
    { label: 'coursera', value: '$140 MXN · 4 términos' },
    { label: 'udemy', value: '$18.49 MXN · 5 términos' },
    { label: 'platzi', value: '$2.18 MXN · 1 término' },
  ],
  negatives: [
    { theme: 'coursera', terms: ['coursera (4 terms, aggregated)', 'coursera business courses'] },
    { theme: 'udemy', terms: ['udemy (5 terms, aggregated)', 'udemy iso 42001'] },
    { theme: 'platzi', terms: ['platzi com cursos'] },
  ],
  checklist: [
    {
      label: 'Corrige la lista de competidores si algún nombre no es un competidor',
      status: null,
      detail: null,
    },
  ],
  blocked: null,
});

/** Vivo 47's V4 card in Spanish: the headline now names the campaign, its cost and its target. */
export const VIVO_PMAX_CARD_ES: PlatformCard = finding({
  idea: 'pmax_rescue_or_pause',
  headline: 'SALES-PMAX-OCTUBRE: $3,283 MXN por conversión frente a un CPA objetivo de $400 MXN',
  campaign_name: 'SALES-PMAX-OCTUBRE',
  recommend_only: false,
  facts: [
    { label: 'Costo por conversión', value: '$3,283 MXN' },
    { label: 'CPA objetivo', value: '$400 MXN' },
    { label: 'Fuerza de los recursos', value: 'Grupo de recursos 1: AVERAGE' },
    { label: 'Perdido por ranking', value: '78%' },
  ],
  checklist: [
    {
      label: 'Opción A — rehacer los recursos con Jaina',
      status: null,
      detail: 'Faltan: 1 square YouTube video',
    },
    { label: 'Opción B — pausarla y mover sus $450 MXN/día', status: null, detail: null },
  ],
  blocked: null,
});
