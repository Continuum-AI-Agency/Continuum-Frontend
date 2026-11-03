// What the Home board writes in the account's language: the sentence that put a tile on the
// board. It lives in contracts, beside readHomeBoard, because generated copy follows the account
// while the Home's own chrome ships in English. Spanish is the default until an account-language
// source exists (the same default the Optimizer board uses).
//
// Every sentence cites a figure the signals hold. A tile whose figure only its own read knows
// gets no sentence here (null), so the board never states a number it did not read.

import type { HomeBrandReading, HomeBrandSignals } from './brandReading';
import type { HomeTileId } from './homeBoard';

export type HomeBoardLanguage = 'es' | 'en';

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

type Facts = {
  accounts: number;
  issues: number;
  waiting: number;
  /** Recommendations waiting on portfolios whose changes the client applies. */
  forTheClient: number;
  autopilot: number;
  acting: number;
};

const WHY: Record<
  HomeBoardLanguage,
  Partial<Record<HomeTileId, (facts: Facts) => string | null>>
> = {
  es: {
    setup: (f) => `${count(f.accounts, 'cuenta conectada', 'cuentas conectadas')}`,
    health: (f) =>
      f.issues > 0
        ? `${count(f.issues, 'problema frena', 'problemas frenan')} los resultados`
        : null,
    opps: (f) => (f.waiting > 0 ? `${count(f.waiting, 'espera', 'esperan')} tu decisión` : null),
    checklist: (f) =>
      f.forTheClient > 0 ? `${count(f.forTheClient, 'cambio', 'cambios')} para el cliente` : null,
    autopilot: (f) =>
      f.autopilot > 0
        ? `Opera ${count(f.autopilot, 'portafolio', 'portafolios')} por su cuenta`
        : f.acting > 0
          ? `${count(f.acting, 'portafolio propone', 'portafolios proponen')} cambios`
          : null,
  },
  en: {
    setup: (f) => `${count(f.accounts, 'account connected', 'accounts connected')}`,
    health: (f) =>
      f.issues > 0 ? `${count(f.issues, 'problem blocks', 'problems block')} results` : null,
    opps: (f) => (f.waiting > 0 ? `${f.waiting} waiting for a decision` : null),
    checklist: (f) =>
      f.forTheClient > 0 ? `${count(f.forTheClient, 'change', 'changes')} for the client` : null,
    autopilot: (f) =>
      f.autopilot > 0
        ? `Runs ${count(f.autopilot, 'portfolio', 'portfolios')} on its own`
        : f.acting > 0
          ? `${count(f.acting, 'portfolio proposes', 'portfolios propose')} changes`
          : null,
  },
};

/** Why a tile is on the board, citing a figure from the signals; null when they hold none. */
export function homeBoardWhy(
  id: HomeTileId,
  signals: HomeBrandSignals,
  reading: HomeBrandReading,
  language: HomeBoardLanguage,
): string | null {
  const active = signals.portfolios.filter((portfolio) => portfolio.status === 'active');
  const acting = active.filter(
    (portfolio) => portfolio.applyMode !== 'observe' && portfolio.canWrite !== false,
  );
  const facts: Facts = {
    accounts: signals.accounts.ads + signals.accounts.organic,
    issues: reading.issues.length,
    waiting: reading.opportunities.reduce((sum, opportunity) => sum + opportunity.count, 0),
    forTheClient: active
      .filter((portfolio) => portfolio.applyMode !== 'observe' && portfolio.canWrite === false)
      .reduce((sum, portfolio) => sum + portfolio.pendingRecommendations, 0),
    autopilot: acting.filter((portfolio) => portfolio.applyMode === 'autopilot').length,
    acting: acting.length,
  };
  return WHY[language][id]?.(facts) ?? null;
}
