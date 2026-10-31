// How the Home reads a brand. Four answers, taken from what Continuum already knows about it:
// how Continuum works the account (the mode), the goal the Home leads with, the module it opens
// with, and the biggest opportunity waiting. The modules then follow in the order the reading sets.
//
// The same reading covers a brand with months of data and one still in onboarding. A brand with no
// results yet is read from what onboarding learned about the business (the call to action and the
// description in its Brand Book), so a new brand's Home is already its own before the first ad
// account is connected. Pure: every sentence on screen can be checked against its inputs.

import { z } from 'zod';
import { HOME_OBJECTIVE_METRICS, type HomeObjective, type HomeObjectiveMetric } from './objectives';

export const homeModeSchema = z.enum(['setup', 'fix', 'operate', 'approve', 'recommend']);
export type HomeMode = z.infer<typeof homeModeSchema>;

export const homeModuleIdSchema = z.enum([
  'setup',
  'health',
  'opportunities',
  'performance',
  'organic',
  'creative',
]);
export type HomeModuleId = z.infer<typeof homeModuleIdSchema>;

export const homeBusinessModelSchema = z.enum(['store', 'leads', 'conversations', 'audience']);
export type HomeBusinessModel = z.infer<typeof homeBusinessModelSchema>;

/** One Optimizer portfolio, as much of optimizer_list_portfolios as the reading needs. */
export const homePortfolioSignalSchema = z.object({
  id: z.string(),
  name: z.string(),
  applyMode: z.enum(['observe', 'recommend', 'autopilot']),
  status: z.enum(['active', 'paused', 'archived']),
  autopilotPaused: z.boolean(),
  pendingRecommendations: z.number().int().nonnegative(),
  pendingBudgetMoves: z.number().int().nonnegative(),
  /** Days since the portfolio last read new data; null while it is current. */
  staleForDays: z.number().nullable(),
  /** The ad sets or campaigns it manages are no longer in the account. */
  rosterAbsent: z.boolean(),
});
export type HomePortfolioSignal = z.infer<typeof homePortfolioSignalSchema>;

export type HomeBrandSignals = {
  /** Assigned accounts: ad accounts (Meta, Google Ads, TikTok) and organic profiles or Pages. */
  accounts: { ads: number; organic: number };
  /** The primary goal the team saved for the whole brand, if any. */
  savedGoal: HomeObjective | null;
  /** What onboarding learned about the business: its calls to action first, then descriptions. */
  business: { calls: string[]; descriptions: string[] } | null;
  portfolios: HomePortfolioSignal[];
  /** Changes on this brand go through an approval chain before they are applied. */
  approvalRequired: boolean;
};

export type HomeIssue = { portfolioId: string; title: string };
export type HomeOpportunity = { portfolioId: string | null; title: string; count: number };
export type HomeGoalSource = 'team' | 'results' | 'business' | 'none';

export type HomeBrandReading = {
  mode: HomeMode;
  modeLabel: string;
  /** One sentence: why the Home runs in this mode. */
  modeReason: string;
  goal: {
    source: HomeGoalSource;
    /** Shown when there is no saved goal and no result to infer one from. */
    suggested: HomeObjective[];
    label: string;
    detail: string;
  };
  businessModel: HomeBusinessModel | null;
  modules: { id: HomeModuleId; reason: string }[];
  issues: HomeIssue[];
  opportunities: HomeOpportunity[];
};

export const HOME_MODULE_LABELS: Record<HomeModuleId, string> = {
  setup: 'Setup',
  health: 'Account health',
  opportunities: 'Opportunities',
  performance: 'Performance +',
  organic: 'Organic +',
  creative: 'Creative +',
};

const MODE_LABELS: Record<HomeMode, string> = {
  setup: 'Setting up',
  fix: 'Fix first',
  operate: 'Autopilot',
  approve: 'You approve',
  recommend: 'Continuum recommends',
};

// The words a business uses for what it sells and the action it wants from a visitor, matched
// without accents or case. A word ending in * matches as a prefix ("envio*" → "envios"). A call to
// action counts double: it is the business saying what a result is. On a tie the first model in
// TIE_ORDER wins, because a service business describes its clients' products far more often than
// a store describes services.
const BUSINESS_WORDS: Record<HomeBusinessModel, string[]> = {
  store: [
    'shop',
    'store',
    'tienda*',
    'compra*',
    'buy',
    'cart',
    'carrito',
    'checkout',
    'envio*',
    'shipping',
    'delivering',
    'delivery',
    'ecommerce',
    'e-commerce',
    'outlet',
    'descuento*',
    'discount*',
    'catalog*',
    'coleccion*',
    'collection*',
    'apparel',
    'clothing',
    'streetwear',
    'ropa',
    'moda',
    'pants',
    'jacket*',
    'shoe*',
    'sneaker*',
    'zapato*',
    'makeup',
    'maquillaje',
    'skincare',
    'fragrance*',
    'perfume*',
    'cosmetic*',
    'roasted',
    'bags',
    'products',
    'productos',
    'jewelry',
    'joyeria',
    'furniture',
    'muebles',
    'order now',
    'pide ya',
    'installments',
    'meses sin intereses',
  ],
  leads: [
    'agenda*',
    'schedule',
    'book a',
    'reserv*',
    'booking',
    'cita*',
    'appointment*',
    'cotiza*',
    'quote',
    'demo',
    'consulta*',
    'consult*',
    'advisory',
    'asesor*',
    'inscri*',
    'enroll*',
    'sign up',
    'registr*',
    'tour',
    'day pass',
    'free trial',
    'prueba gratis',
    'clase muestra',
    'free class',
    'contact',
    'contacto',
    'solicita*',
    'request',
    'apply',
    'membership',
    'membresia',
    'agenc*',
    'workshop*',
    'taller*',
    'training',
    'capacitacion',
    'educa*',
    'curso*',
    'course*',
    'school',
    'escuela*',
    'academ*',
    'universi*',
    'tuition',
    'clinic*',
    'medic*',
    'enfermer*',
    'nursing',
    'cuidado',
    'care',
    'funera*',
    'prevision',
    'seguro*',
    'insurance',
    'salon',
    'barber*',
    'grooming',
    'gym',
    'fitness',
    'club',
    'hotel',
    'suites',
    'cabin*',
    'caban*',
    'accommodation',
    'hospedaje',
    'getaway',
    'b2b',
    'saas',
    'playbook*',
    'crm',
    'services',
    'servicios',
    'abogad*',
    'dental',
    'inmobiliari*',
    'real estate',
    'invest*',
    'inversion*',
  ],
  conversations: [
    'whatsapp',
    'mensaje*',
    'message us',
    'escribenos',
    'messenger',
    'chatea*',
    'chat with us',
    'dm us',
    'inbox',
    'direct message*',
  ],
  audience: [
    'news',
    'noticias',
    'guide*',
    'guia*',
    'blog*',
    'podcast*',
    'newsletter*',
    'suscribete',
    'watch',
    'follow',
    'siguenos',
    'community',
    'comunidad',
    'creator*',
    'creador*',
    'database',
    'magazine',
    'revista*',
    'entertainment',
    'gaming',
    'players',
  ],
};

const TIE_ORDER: HomeBusinessModel[] = ['leads', 'conversations', 'store', 'audience'];

const SUGGESTED_GOALS: Record<HomeBusinessModel, [HomeObjectiveMetric, HomeObjectiveMetric]> = {
  store: ['purchase_value', 'purchases'],
  leads: ['leads', 'conversations'],
  conversations: ['conversations', 'leads'],
  audience: ['impressions', 'clicks'],
};

const BUSINESS_NOUNS: Record<HomeBusinessModel, string> = {
  store: 'a store',
  leads: 'a business that books leads',
  conversations: 'a business that sells in conversations',
  audience: 'an audience business',
};

const MIN_BUSINESS_SCORE = 2;

function normalized(text: string): string {
  return ` ${text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, ' ')} `;
}

function hits(text: string, words: string[]): number {
  return words.filter((word) =>
    word.endsWith('*') ? text.includes(` ${word.slice(0, -1)}`) : text.includes(` ${word} `),
  ).length;
}

/** What kind of business the onboarding read describes, or null when it does not say enough. */
export function readBusinessModel(
  business: HomeBrandSignals['business'],
): HomeBusinessModel | null {
  if (!business) return null;
  const calls = normalized(business.calls.join(' . '));
  const descriptions = normalized(business.descriptions.join(' . '));
  let best: { model: HomeBusinessModel; score: number } | null = null;
  for (const model of TIE_ORDER) {
    const words = BUSINESS_WORDS[model];
    const score = hits(calls, words) * 2 + hits(descriptions, words);
    if (score > (best?.score ?? 0)) best = { model, score };
  }
  return best && best.score >= MIN_BUSINESS_SCORE ? best.model : null;
}

function objectiveFor(metric: HomeObjectiveMetric, role: HomeObjective['role']): HomeObjective {
  return { id: metric, label: HOME_OBJECTIVE_METRICS[metric].label, metric, role };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function issuesOf(portfolios: HomePortfolioSignal[]): HomeIssue[] {
  const issues: HomeIssue[] = [];
  for (const portfolio of portfolios) {
    if (portfolio.status !== 'active' || portfolio.applyMode === 'observe') continue;
    if (portfolio.rosterAbsent) {
      issues.push({
        portfolioId: portfolio.id,
        title: `${portfolio.name} lost the campaigns it manages`,
      });
    } else if (portfolio.staleForDays !== null && portfolio.staleForDays >= 3) {
      issues.push({
        portfolioId: portfolio.id,
        title: `${portfolio.name} has read no new data for ${plural(portfolio.staleForDays, 'day', 'days')}`,
      });
    }
    if (portfolio.applyMode === 'autopilot' && portfolio.autopilotPaused) {
      issues.push({ portfolioId: portfolio.id, title: `Autopilot is paused on ${portfolio.name}` });
    }
  }
  return issues;
}

function waitingOf(portfolios: HomePortfolioSignal[]): HomeOpportunity[] {
  return portfolios
    .filter((portfolio) => portfolio.status === 'active' && portfolio.applyMode !== 'observe')
    .map((portfolio) => {
      const recommendations = portfolio.pendingRecommendations;
      const moves = portfolio.pendingBudgetMoves;
      const parts = [
        recommendations > 0 ? plural(recommendations, 'recommendation', 'recommendations') : null,
        moves > 0 ? plural(moves, 'budget move', 'budget moves') : null,
      ].filter(Boolean);
      return {
        portfolioId: portfolio.id,
        title: `${parts.join(' and ')} waiting in ${portfolio.name}`,
        count: recommendations + moves,
      };
    })
    .filter((opportunity) => opportunity.count > 0)
    .sort((a, b) => b.count - a.count);
}

function modeOf(
  signals: HomeBrandSignals,
  issues: HomeIssue[],
): { mode: HomeMode; reason: string } {
  const { accounts, portfolios, approvalRequired } = signals;
  if (accounts.ads + accounts.organic === 0) {
    return { mode: 'setup', reason: 'No account is assigned to this brand yet.' };
  }
  if (issues.length > 0) {
    return {
      mode: 'fix',
      reason: `${plural(issues.length, 'problem blocks', 'problems block')} results before anything else.`,
    };
  }
  const acting = portfolios.filter(
    (portfolio) => portfolio.status === 'active' && portfolio.applyMode !== 'observe',
  );
  const autopilot = acting.filter((portfolio) => portfolio.applyMode === 'autopilot');
  if (autopilot.length > 0) {
    return {
      mode: 'operate',
      reason: `Continuum moves budget on its own in ${plural(autopilot.length, 'portfolio', 'portfolios')}.`,
    };
  }
  if (acting.length > 0 || approvalRequired) {
    return {
      mode: 'approve',
      reason:
        acting.length > 0
          ? `${plural(acting.length, 'portfolio proposes', 'portfolios propose')} changes for your OK.`
          : 'Every change goes through your approval chain first.',
    };
  }
  return {
    mode: 'recommend',
    reason: 'Continuum reads the accounts and recommends; your team makes the changes.',
  };
}

function goalOf(
  signals: HomeBrandSignals,
  businessModel: HomeBusinessModel | null,
): HomeBrandReading['goal'] {
  const suggested = businessModel
    ? [
        objectiveFor(SUGGESTED_GOALS[businessModel][0], 'primary'),
        objectiveFor(SUGGESTED_GOALS[businessModel][1], 'secondary'),
      ]
    : [];
  if (signals.savedGoal) {
    return {
      source: 'team',
      suggested,
      label: signals.savedGoal.label,
      detail: 'Set by your team',
    };
  }
  if (signals.accounts.ads > 0) {
    return {
      source: 'results',
      suggested,
      label: 'From your results',
      detail: 'Until your team picks a goal, the Home follows the result your ads bring most',
    };
  }
  const [first] = suggested;
  if (businessModel && first) {
    return {
      source: 'business',
      suggested,
      label: first.label,
      detail: `Read from your Brand Book: it describes ${BUSINESS_NOUNS[businessModel]}`,
    };
  }
  return {
    source: 'none',
    suggested,
    label: 'Not set yet',
    detail: 'Connect an ad account or finish the Brand Book so the Home knows what to count',
  };
}

function moduleReasons(
  signals: HomeBrandSignals,
  issues: HomeIssue[],
  opportunities: HomeOpportunity[],
  goal: HomeBrandReading['goal'],
  businessModel: HomeBusinessModel | null,
): Record<HomeModuleId, { score: number; reason: string } | null> {
  const { ads, organic } = signals.accounts;
  const goalWord = goal.source === 'team' || goal.source === 'business' ? goal.label : 'results';
  const waiting = opportunities.reduce((sum, opportunity) => sum + opportunity.count, 0);
  const hasPortfolios = signals.portfolios.some((portfolio) => portfolio.status === 'active');
  return {
    setup:
      ads + organic === 0 ? { score: 100, reason: 'Nothing to read until an account is in' } : null,
    health:
      issues.length > 0
        ? { score: 95, reason: `${plural(issues.length, 'thing needs', 'things need')} fixing` }
        : null,
    opportunities:
      opportunities.length > 0 || hasPortfolios
        ? {
            score: waiting > 0 ? 80 : 30,
            reason: waiting > 0 ? `${waiting} waiting for a decision` : 'Nothing waiting right now',
          }
        : null,
    performance: {
      score: ads > 0 ? 70 : 10,
      reason:
        ads > 0 ? `Where this week's ${goalWord.toLowerCase()} came from` : 'No ad account yet',
    },
    creative: {
      score: ads > 0 ? (businessModel === 'store' ? 76 : 60) : 5,
      reason:
        ads === 0
          ? 'Ranks ads once an ad account is in'
          : businessModel === 'store'
            ? 'A store sells through its ads: best and worst first'
            : 'Best and worst ad this week',
    },
    organic: {
      score: organic > 0 ? (ads === 0 ? 90 : businessModel === 'audience' ? 74 : 50) : 8,
      reason:
        organic === 0
          ? 'No Instagram or Page yet'
          : ads === 0
            ? 'Your only connected channel'
            : 'Reach and engagement this week',
    },
  };
}

const FIRST_BY_MODE: Record<HomeMode, HomeModuleId | null> = {
  setup: 'setup',
  fix: 'health',
  operate: 'performance',
  approve: 'opportunities',
  recommend: null,
};

/** The Home's reading of one brand, from its signals alone. */
export function readBrand(signals: HomeBrandSignals): HomeBrandReading {
  const businessModel = readBusinessModel(signals.business);
  const issues = issuesOf(signals.portfolios);
  const opportunities = waitingOf(signals.portfolios);
  const { mode, reason } = modeOf(signals, issues);
  const goal = goalOf(signals, businessModel);

  const scored = moduleReasons(signals, issues, opportunities, goal, businessModel);
  const present = homeModuleIdSchema.options.flatMap((id) => {
    const entry = scored[id];
    return entry ? [{ id, ...entry }] : [];
  });
  const lead = FIRST_BY_MODE[mode];
  const modules = present
    .sort((a, b) => {
      if (a.id === lead) return -1;
      if (b.id === lead) return 1;
      return b.score - a.score;
    })
    .map(({ id, reason: moduleReason }) => ({ id, reason: moduleReason }));

  if (signals.accounts.ads > 0 && !signals.portfolios.some((p) => p.status === 'active')) {
    const toward = goal.source === 'results' ? 'your best result' : goal.label.toLowerCase();
    opportunities.push({
      portfolioId: null,
      title: `Group your campaigns in a portfolio so Continuum can move budget toward ${toward}`,
      count: 0,
    });
  }

  return {
    mode,
    modeLabel: MODE_LABELS[mode],
    modeReason: reason,
    goal,
    businessModel,
    modules,
    issues,
    opportunities,
  };
}
