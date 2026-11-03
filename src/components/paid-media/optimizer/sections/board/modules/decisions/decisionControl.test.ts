import { describe, expect, it } from 'bun:test';
import {
  type AccountCandidate,
  accountCandidateSchema,
  type OptimizerAction,
} from '@continuum/contracts';
import { RAISE_GOOGLE_BUDGET } from '../../../platformCards/__fixtures__/platformCardActions';
import {
  type CardWrite,
  cardActionsOf,
  cardActionUnavailableNote,
} from '../../../platformCards/platformCardActionModel';
import { GOOGLE_ADS_CAMPAIGNS_HREF } from '../../../platformCards/platformCardModel';
import {
  EASYFIT_AUCTION,
  EASYFIT_BRANCH_MOVE,
  EASYFIT_SUSPENDED,
  META_MEASUREMENT_GUARD,
  PINK_CHECKLIST,
  PINK_INTENT_NEGATIVES,
  VIVO_BUDGET_WRITE,
  VIVO_INFLATED_CONVERSION,
} from './__fixtures__/decisionCandidates';
import {
  CLIENT_CHECKLIST_REASON,
  type ControlContext,
  controlOf,
  dismissOf,
  fixHrefOf,
  metaAdsManagerHref,
  NOTHING_TO_APPLY_REASON,
  READ_FINDING_DISMISS_REASON,
  WAITS_FOR_FIX_REASON,
} from './decisionControl';
import { type DecisionCard, decisionCardsOf } from './decisionsModel';

function cardOf(candidate: AccountCandidate): DecisionCard {
  const [card] = decisionCardsOf({
    candidates: [candidate],
    currency: 'MXN',
    dailySpend: 1629,
    cardActions: cardActionsOf([candidate]),
  });
  if (!card) throw new Error(`no card for ${candidate.id}`);
  return card;
}

const google = (mode: ControlContext['mode'], firstFix: string | null = null): ControlContext => ({
  mode,
  platform: 'google_ads',
  adAccountId: null,
  firstFix,
});

const meta = (mode: ControlContext['mode']): ControlContext => ({
  mode,
  platform: 'meta',
  adAccountId: 'act_521903353286118',
  firstFix: null,
});

/** A card runs one write; a move between platforms has its own approval. */
function singleWrite(action: OptimizerAction): CardWrite {
  if (action.kind === 'budget_move') throw new Error('a budget move is not a single write');
  return action;
}

/** EKATAR 1,179 → 1,473.75 MXN/day, the write Vivo 47's G03 card carries. */
const RAISE_EKATAR = singleWrite(RAISE_GOOGLE_BUDGET);

const switchedOff = accountCandidateSchema.parse({
  ...VIVO_BUDGET_WRITE,
  card_action: { ...VIVO_BUDGET_WRITE.card_action, apply_enabled: false },
});

describe('controlOf: fix', () => {
  it('sends a fix to the platform, with the steps the card lists', () => {
    expect(controlOf(cardOf(VIVO_INFLATED_CONVERSION), google('fix'))).toEqual({
      kind: 'fix',
      label: 'Fix in Google Ads',
      href: GOOGLE_ADS_CAMPAIGNS_HREF,
      primary: true,
    });
    expect(controlOf(cardOf(META_MEASUREMENT_GUARD), meta('fix'))).toEqual({
      kind: 'fix',
      label: 'Fix in Meta',
      href: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=521903353286118',
      primary: true,
    });
  });

  it('locks a write that is not the fix, naming the fix it waits for', () => {
    expect(
      controlOf(cardOf(VIVO_BUDGET_WRITE), google('fix', 'La cuenta no muestra anuncios')),
    ).toEqual({
      kind: 'locked',
      label: 'Apply new budget',
      reason: 'Waits for the fix first: La cuenta no muestra anuncios',
    });
    expect(controlOf(cardOf(VIVO_BUDGET_WRITE), google('fix'))).toMatchObject({
      kind: 'locked',
      reason: WAITS_FOR_FIX_REASON,
    });
  });

  it('keeps a card without a write on the platform, as a secondary fix', () => {
    expect(controlOf(cardOf(EASYFIT_AUCTION), meta('fix'))).toMatchObject({
      kind: 'fix',
      primary: false,
    });
  });
});

describe('controlOf: approve and operate', () => {
  it("approves the engine's write through its own dialog", () => {
    const control = controlOf(cardOf(VIVO_BUDGET_WRITE), google('approve'));
    expect(control.kind).toBe('approve');
    if (control.kind !== 'approve') return;
    expect(control.write).toEqual(RAISE_EKATAR);
    expect(control.target.portfolioId).toBe('7a7a7a7a-0000-4000-8000-0000000000e3');
    expect(control.target.recommendationId).toBe('099715be-19c7-4c04-9cac-1e416391498a');
  });

  it('disables a write the service would refuse, with its reason', () => {
    expect(controlOf(cardOf(switchedOff), google('approve'))).toEqual({
      kind: 'unavailable',
      label: 'Approve',
      reason: cardActionUnavailableNote('apply_disabled', RAISE_EKATAR) ?? '',
    });
  });

  it('says a finding carries nothing to apply rather than offering a button that does nothing', () => {
    expect(controlOf(cardOf(EASYFIT_AUCTION), meta('approve'))).toEqual({
      kind: 'unavailable',
      label: 'Approve',
      reason: NOTHING_TO_APPLY_REASON,
    });
  });

  it('sends a read-only or fix card to the platform', () => {
    expect(controlOf(cardOf(EASYFIT_SUSPENDED), google('approve'))).toMatchObject({
      kind: 'fix',
      primary: true,
    });
  });

  it("shows the autopilot's own move as queued, and still approves a write that waits for a person", () => {
    expect(controlOf(cardOf(EASYFIT_BRANCH_MOVE), meta('operate'))).toEqual({ kind: 'queued' });
    expect(controlOf(cardOf(EASYFIT_BRANCH_MOVE), meta('approve')).kind).toBe('unavailable');
    expect(controlOf(cardOf(VIVO_BUDGET_WRITE), google('operate')).kind).toBe('approve');
  });
});

describe('controlOf: recommend and setup', () => {
  it('copies the list a card holds, for the client', () => {
    const control = controlOf(cardOf(PINK_INTENT_NEGATIVES), google('recommend'));
    expect(control).toEqual({
      kind: 'copy',
      text: 'curso iso 27001 gratis\niso 27001 pdf\niso 27001 tarea',
    });
    expect(controlOf(cardOf(PINK_CHECKLIST), google('recommend')).kind).toBe('copy');
  });

  it('disables the client checklist, which nothing here writes yet', () => {
    expect(controlOf(cardOf(EASYFIT_AUCTION), meta('recommend'))).toEqual({
      kind: 'unavailable',
      label: 'Add to client checklist',
      reason: CLIENT_CHECKLIST_REASON,
    });
  });

  it('creates the first portfolio in setup', () => {
    expect(controlOf(cardOf(EASYFIT_AUCTION), meta('setup'))).toEqual({ kind: 'create' });
  });
});

describe('dismissOf', () => {
  it('records a platform card as rejected, in approve mode only', () => {
    expect(dismissOf(cardOf(VIVO_BUDGET_WRITE), 'approve')).toEqual({
      kind: 'dismiss',
      recommendationId: '099715be-19c7-4c04-9cac-1e416391498a',
    });
    expect(dismissOf(cardOf(VIVO_BUDGET_WRITE), 'operate')).toBeNull();
    expect(dismissOf(cardOf(VIVO_BUDGET_WRITE), 'fix')).toBeNull();
  });

  it('has no row to reject for a read finding, and never dismisses a guard', () => {
    expect(dismissOf(cardOf(EASYFIT_AUCTION), 'approve')).toEqual({
      kind: 'unavailable',
      reason: READ_FINDING_DISMISS_REASON,
    });
    expect(dismissOf(cardOf(META_MEASUREMENT_GUARD), 'approve')).toBeNull();
  });
});

describe('fixHrefOf', () => {
  it("opens Google Ads where the card's own fields point, Ads Manager for Meta", () => {
    expect(fixHrefOf(cardOf(EASYFIT_SUSPENDED), 'google_ads', null)).toBe(
      GOOGLE_ADS_CAMPAIGNS_HREF,
    );
    expect(metaAdsManagerHref(null)).toBe(
      'https://adsmanager.facebook.com/adsmanager/manage/campaigns',
    );
    expect(metaAdsManagerHref('521903353286118')).toBe(
      'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=521903353286118',
    );
  });
});
