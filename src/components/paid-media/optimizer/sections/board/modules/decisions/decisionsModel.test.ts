import { describe, expect, it } from 'bun:test';
import {
  ACCOUNT_DETECTOR_META,
  type AccountCandidate,
  accountCandidateSchema,
  titleText,
} from '@continuum/contracts';
import { cardActionsOf } from '../../../platformCards/platformCardActionModel';
import { platformCardOf, platformCardTitle } from '../../../platformCards/platformCardModel';
import {
  EASYFIT_AUCTION,
  EASYFIT_BRANCH_MOVE,
  EASYFIT_SUSPENDED,
  META_MEASUREMENT_GUARD,
  PINK_CHECKLIST,
  PINK_INTENT_NEGATIVES,
  VIVO_BRAND_TERMS,
  VIVO_BUDGET_WRITE,
  VIVO_CAPPED_BUDGET,
  VIVO_INFLATED_CONVERSION,
  VIVO_NEGATIVES_WRITE,
} from './__fixtures__/decisionCandidates';
import {
  cardsInFilter,
  type DecisionCard,
  decisionCardsOf,
  decisionCounts,
  planPerDay,
  readCandidatesOf,
  tierCounts,
} from './decisionsModel';

/** Test 1's plan (Vivo 47, 1,629 MXN a day): the scale the money is tiered against. */
const DAILY_SPEND = 1629;

function cardsOf(candidates: readonly AccountCandidate[]): DecisionCard[] {
  return decisionCardsOf({
    candidates,
    currency: 'MXN',
    dailySpend: DAILY_SPEND,
    cardActions: cardActionsOf(candidates),
  });
}

function cardOf(candidate: AccountCandidate): DecisionCard {
  const [card] = cardsOf([candidate]);
  if (!card) throw new Error(`no card for ${candidate.id}`);
  return card;
}

describe('decisionCardsOf: impact order', () => {
  it('reads the guard first, then the account-wide blocker, then by tier and the read rank', () => {
    const cards = cardsOf([
      VIVO_BRAND_TERMS,
      EASYFIT_SUSPENDED,
      VIVO_CAPPED_BUDGET,
      VIVO_INFLATED_CONVERSION,
      META_MEASUREMENT_GUARD,
    ]);
    expect(cards.map((card) => card.id)).toEqual([
      META_MEASUREMENT_GUARD.id,
      EASYFIT_SUSPENDED.id,
      VIVO_INFLATED_CONVERSION.id,
      VIVO_BRAND_TERMS.id,
      VIVO_CAPPED_BUDGET.id,
    ]);
    expect(cards.map((card) => card.tier)).toEqual(['high', 'high', 'high', 'medium', 'medium']);
  });

  it('tiers a priced card by its money against the daily spend, an unpriced one by severity', () => {
    // 72.40 a day against 1,629: past the 2% floor, short of five times it.
    expect(cardOf(VIVO_NEGATIVES_WRITE).tier).toBe('medium');
    // 233 a day: past five times the floor.
    expect(cardOf(EASYFIT_AUCTION).tier).toBe('high');
    // Nobody priced the P8 card: the engine's severity stands.
    expect(cardOf(VIVO_INFLATED_CONVERSION).tier).toBe('high');
  });
});

describe('decisionCardsOf: what each card says', () => {
  it('groups the P8 ideas by idea, not by the detector the producer files them under', () => {
    expect(VIVO_INFLATED_CONVERSION.detector).toBe('optimization_event');
    expect(cardOf(VIVO_INFLATED_CONVERSION).group).toBe('fix');
    expect(cardOf(PINK_CHECKLIST).group).toBe('fix');
    expect(cardOf(VIVO_CAPPED_BUDGET).group).toBe('grow');
    expect(cardOf(VIVO_BRAND_TERMS).group).toBe('grow');
    expect(cardOf(PINK_INTENT_NEGATIVES).group).toBe('clean');
  });

  it('groups a platform card by its variant and a read finding by its detector', () => {
    expect(cardOf(EASYFIT_SUSPENDED).group).toBe('fix');
    expect(cardOf(VIVO_BUDGET_WRITE).group).toBe('grow');
    expect(cardOf(VIVO_NEGATIVES_WRITE).group).toBe('clean');
    expect(cardOf(EASYFIT_BRANCH_MOVE).group).toBe('grow');
    expect(cardOf(EASYFIT_AUCTION).group).toBe('clean');
    expect(cardOf(META_MEASUREMENT_GUARD).group).toBe('fix');
  });

  it('keeps the title the Optimizer generated, in the account language', () => {
    expect(cardOf(VIVO_INFLATED_CONVERSION).title).toBe(
      'La mayor parte de lo que Google llama conversión es una visita',
    );
    if (!EASYFIT_AUCTION.title) throw new Error('the auction finding carries its stamped title');
    expect(cardOf(EASYFIT_AUCTION).title).toBe(titleText(EASYFIT_AUCTION.title));
    expect(cardOf(EASYFIT_AUCTION).title).toBe(
      'Cuenta: 23% más por cada mil impresiones, 38.66 MXN de CPM antes frente a 47.71 MXN ahora',
    );
    const budgetCard = platformCardOf(VIVO_BUDGET_WRITE);
    if (!budgetCard) throw new Error('the G03 candidate carries its platform card');
    expect(cardOf(VIVO_BUDGET_WRITE).title).toBe(platformCardTitle(budgetCard));
    expect(cardOf(META_MEASUREMENT_GUARD).title).toBe(
      ACCOUNT_DETECTOR_META.measurement_integrity.label,
    );
  });

  it("states a P8 finding's facts, a delivery card's reasons from its fields, else the priced sentence", () => {
    expect(cardOf(VIVO_INFLATED_CONVERSION).figure).toBe(
      'Costo reportado: $10.96 MXN · Costo real por lead: $73.86 MXN',
    );
    // The stored sentence is cut at 240 characters ("One cause for the w"); the fields are whole.
    const delivery = cardOf(EASYFIT_SUSPENDED).figure;
    expect(delivery).toBe('Google says: suspended; limited by budget. Budget $670 MXN/day.');
    expect(cardOf(VIVO_BUDGET_WRITE).figure).toBe(VIVO_BUDGET_WRITE.impact_basis);
  });

  it('prices only what the producer priced', () => {
    expect(cardOf(VIVO_NEGATIVES_WRITE).impact).toBe('$72.40 MXN/day');
    expect(cardOf(EASYFIT_AUCTION).impact).toBe('$233 MXN/day');
    expect(cardOf(EASYFIT_SUSPENDED).impact).toBe('Everything else waits');
    expect(cardOf(META_MEASUREMENT_GUARD).impact).toBe('Read this first');
    expect(cardOf(VIVO_INFLATED_CONVERSION).impact).toBeNull();
    const unpriced = accountCandidateSchema.parse({ ...EASYFIT_BRANCH_MOVE, impact_per_day: 0 });
    expect(cardOf(unpriced).impact).toBe('41% cheaper per result');
  });

  it('names the recommendation row a platform card stands for, and none for a read finding', () => {
    expect(cardOf(VIVO_BUDGET_WRITE).recommendationId).toBe('099715be-19c7-4c04-9cac-1e416391498a');
    expect(cardOf(VIVO_INFLATED_CONVERSION).recommendationId).toBe(
      'a1a1a1a1-0000-4000-8000-000000000001',
    );
    expect(cardOf(EASYFIT_AUCTION).recommendationId).toBeNull();
    expect(cardOf(META_MEASUREMENT_GUARD).recommendationId).toBeNull();
  });

  it("carries the engine's action and the portfolio the card sends a person to", () => {
    const card = cardOf(VIVO_BUDGET_WRITE);
    expect(card.action?.portfolioId).toBe('7a7a7a7a-0000-4000-8000-0000000000e3');
    expect(card.action?.action.kind).toBe('set_budget');
    expect(card.portfolioId).toBe('7a7a7a7a-0000-4000-8000-0000000000e3');
    expect(cardOf(EASYFIT_AUCTION).action).toBeUndefined();
    expect(cardOf(EASYFIT_AUCTION).portfolioId).toBeNull();
  });

  it('lists the steps change history verified, and what a person can paste', () => {
    const checklist = cardOf(PINK_CHECKLIST);
    expect(checklist.steps.map((step) => step.status)).toEqual(['done', 'done', 'pending']);
    expect(checklist.copyText).toBe(
      [
        '1. Pausar el grupo Gestión de Proyectos',
        '2. Quitar Display de la campaña de Búsqueda',
        '3. Cambiar de Maximizar clics a Maximizar conversiones',
      ].join('\n'),
    );
    expect(cardOf(PINK_INTENT_NEGATIVES).copyText).toBe(
      'curso iso 27001 gratis\niso 27001 pdf\niso 27001 tarea',
    );
    expect(cardOf(VIVO_NEGATIVES_WRITE).copyText).toBe('vivo 47 la estancia\nvivo 47 center');
    expect(cardOf(EASYFIT_AUCTION).steps).toEqual([]);
    expect(cardOf(EASYFIT_AUCTION).copyText).toBeNull();
  });

  it('says what a finding cannot measure yet', () => {
    expect(cardOf(VIVO_CAPPED_BUDGET).note).toBe(
      'La subida espera la corrección de la conversión.',
    );
    expect(cardOf(VIVO_INFLATED_CONVERSION).note).toBeNull();
  });

  it("marks the autopilot's own moves and the cards a fired guard casts doubt on", () => {
    const cards = cardsOf([EASYFIT_AUCTION, EASYFIT_BRANCH_MOVE, META_MEASUREMENT_GUARD]);
    const byId = new Map(cards.map((card) => [card.id, card]));
    expect(byId.get(EASYFIT_BRANCH_MOVE.id)?.autopilot).toBe(true);
    expect(byId.get(EASYFIT_BRANCH_MOVE.id)?.doubted).toBe(true);
    expect(byId.get(EASYFIT_AUCTION.id)?.doubted).toBe(false);
    expect(byId.get(META_MEASUREMENT_GUARD.id)?.guard).toBe(true);
    expect(byId.get(META_MEASUREMENT_GUARD.id)?.doubted).toBe(false);
  });
});

describe('counts and filters', () => {
  const cards = cardsOf([
    VIVO_INFLATED_CONVERSION,
    VIVO_CAPPED_BUDGET,
    VIVO_BRAND_TERMS,
    VIVO_NEGATIVES_WRITE,
    EASYFIT_SUSPENDED,
  ]);

  it('counts each filter', () => {
    expect(decisionCounts(cards)).toEqual({ all: 5, fix: 2, grow: 2, clean: 1 });
    expect(tierCounts(cards)).toEqual({ high: 2, medium: 3, low: 0 });
  });

  it('keeps the impact order inside a filter', () => {
    expect(cardsInFilter(cards, 'fix').map((card) => card.id)).toEqual([
      EASYFIT_SUSPENDED.id,
      VIVO_INFLATED_CONVERSION.id,
    ]);
    expect(cardsInFilter(cards, 'all')).toBe(cards);
  });
});

describe('readCandidatesOf', () => {
  const recommending = accountCandidateSchema.parse({ ...EASYFIT_BRANCH_MOVE, state: 'recommend' });
  const read = {
    candidates: [recommending],
    guards: [META_MEASUREMENT_GUARD],
    ceiling_defaults: { budget: 'autopilot' },
  };

  it('applies an approval made after the read was composed', () => {
    const [move] = readCandidatesOf(read, {
      families: {},
      insights: { portfolio_reallocation: 'autopilot' },
    });
    expect(move?.state).toBe('autopilot');
  });

  it('keeps a family ceiling over a wider insight setting', () => {
    const [move] = readCandidatesOf(read, {
      families: { budget: 'recommend' },
      insights: { portfolio_reallocation: 'autopilot' },
    });
    expect(move?.state).toBe('recommend');
    expect(move?.state_lowered).toBe(true);
  });

  it('returns the candidates and the guards as read when no approvals came back', () => {
    expect(readCandidatesOf(read, undefined).map((candidate) => candidate.id)).toEqual([
      recommending.id,
      META_MEASUREMENT_GUARD.id,
    ]);
  });

  it('has nothing without a read', () => {
    expect(readCandidatesOf(null, undefined)).toEqual([]);
  });
});

describe('planPerDay', () => {
  it("sums the portfolios' daily plan, and has none without portfolios", () => {
    // Easy Fit Meta: Conversaciones Whatsapp $1,200 a day (fixed), Tours Programados $460.
    expect(
      planPerDay([
        { daily_total: 1200, budget_source: 'fixed' },
        { daily_total: 460, budget_source: 'fixed' },
      ]),
    ).toBe(1660);
    // Observed: the plan is what the last cycle conserved (Easy Fit Google stored 1870, ran 670).
    expect(
      planPerDay([{ daily_total: 1870, budget_source: 'observed', conserved_daily_total: 670 }]),
    ).toBe(670);
    expect(planPerDay([])).toBeNull();
  });
});
