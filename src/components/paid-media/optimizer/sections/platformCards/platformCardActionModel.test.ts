import { describe, expect, it } from 'bun:test';
import type { ApplyActionsResponse } from '../../useOptimizerData';
import {
  ADD_GOOGLE_KEYWORD,
  ADD_GOOGLE_NEGATIVES,
  LOWER_GOOGLE_TCPA,
  PAUSE_GOOGLE_CAMPAIGN,
  PAUSE_TIKTOK_AD_GROUP,
  PORTFOLIO_ID,
  RAISE_GOOGLE_BUDGET,
} from './__fixtures__/platformCardActions';
import {
  GOOGLE_BUDGET_LIMITED,
  GOOGLE_DELIVERY_ONE_CAMPAIGN,
  GOOGLE_VIDEO,
  TIKTOK_ATTRIBUTION_WINDOW,
  TIKTOK_BUDGET_BELOW_LEARNING,
} from './__fixtures__/platformCards';
import {
  type CardWrite,
  cardActionAvailability,
  cardActionChange,
  cardActionLabel,
  cardActionTitle,
  cardWriteOf,
  previewVerdict,
  resultVerdict,
  withTerms,
} from './platformCardActionModel';

const write = (action: unknown) => action as CardWrite;
const target = (action: CardWrite) => ({ portfolioId: PORTFOLIO_ID, action });
const answer = (result: Record<string, unknown>, dryRun = true): ApplyActionsResponse => ({
  ok: result.status !== 'refused',
  dryRun,
  results: [{ kind: 'set_budget', ...result } as ApplyActionsResponse['results'][number]],
});

describe('cardActionAvailability', () => {
  it('opens the approval flow for a Google write', () => {
    expect(cardActionAvailability(GOOGLE_BUDGET_LIMITED, target(write(RAISE_GOOGLE_BUDGET)))).toBe(
      'ready',
    );
  });

  it('says TikTok is not connected for a TikTok write', () => {
    expect(
      cardActionAvailability(TIKTOK_BUDGET_BELOW_LEARNING, target(write(PAUSE_TIKTOK_AD_GROUP))),
    ).toBe('tiktok_not_connected');
  });

  it('offers nothing on a read-only card, even when an action rides along', () => {
    for (const card of [GOOGLE_VIDEO, GOOGLE_DELIVERY_ONE_CAMPAIGN, TIKTOK_ATTRIBUTION_WINDOW]) {
      expect(cardActionAvailability(card, target(write(PAUSE_GOOGLE_CAMPAIGN)))).toBe('none');
    }
  });

  it('offers nothing without an action', () => {
    expect(cardActionAvailability(GOOGLE_BUDGET_LIMITED, null)).toBe('none');
    expect(cardActionAvailability(GOOGLE_BUDGET_LIMITED, undefined)).toBe('none');
  });

  it('leaves a move between platforms to its own approval', () => {
    const move = {
      portfolioId: PORTFOLIO_ID,
      action: { kind: 'budget_move' } as unknown as CardWrite,
    };
    expect(cardWriteOf(move)).toBeNull();
    expect(cardActionAvailability(GOOGLE_BUDGET_LIMITED, move)).toBe('none');
  });
});

describe('cardActionLabel', () => {
  it('names the verb for every write a card carries', () => {
    expect(cardActionLabel(write(PAUSE_GOOGLE_CAMPAIGN))).toBe('Pause campaign');
    expect(cardActionLabel(write(PAUSE_TIKTOK_AD_GROUP))).toBe('Pause ad group');
    expect(cardActionLabel(write(RAISE_GOOGLE_BUDGET))).toBe('Apply new budget');
    expect(cardActionLabel(write(LOWER_GOOGLE_TCPA))).toBe('Apply new target CPA');
    expect(cardActionLabel(write(ADD_GOOGLE_NEGATIVES))).toBe('Add 3 negatives');
    expect(cardActionLabel(write(ADD_GOOGLE_KEYWORD))).toBe('Add as exact keyword');
  });
});

describe('cardActionTitle', () => {
  it('names the platform and the exact entity', () => {
    expect(cardActionTitle(write(PAUSE_GOOGLE_CAMPAIGN))).toBe(
      'Pause the campaign "VIVO 47-EKATAR" on Google',
    );
    expect(cardActionTitle(write(RAISE_GOOGLE_BUDGET))).toBe(
      'Change the campaign budget of "VIVO 47-EKATAR" on Google',
    );
    expect(cardActionTitle(write(LOWER_GOOGLE_TCPA))).toBe(
      'Change the target CPA of "VIVO 47-EKATAR" on Google',
    );
    expect(cardActionTitle(write(ADD_GOOGLE_NEGATIVES))).toBe(
      'Add 3 negatives to the campaign "VIVO 47-EKATAR" on Google',
    );
    expect(cardActionTitle(write(ADD_GOOGLE_KEYWORD))).toBe(
      'Add "24 hour gym guadalajara" as an exact keyword in the ad group "Locations" on Google',
    );
    expect(cardActionTitle(write(PAUSE_TIKTOK_AD_GROUP))).toBe(
      'Pause the ad group "Prospecting MX" on TikTok',
    );
  });
});

describe('cardActionChange', () => {
  it("states the change in the action's own figures", () => {
    expect(cardActionChange(write(RAISE_GOOGLE_BUDGET), 'MXN')).toBe(
      '1,179.00 MXN/day → 1,473.75 MXN/day',
    );
    expect(cardActionChange(write(LOWER_GOOGLE_TCPA), 'MXN')).toBe('35.00 MXN → 32.00 MXN');
    expect(cardActionChange(write(PAUSE_GOOGLE_CAMPAIGN), null)).toStartWith('Active → paused.');
    expect(cardActionChange(write(ADD_GOOGLE_NEGATIVES), null)).toBe(
      '"free gym" (exact), "gym jobs" (exact), "gym near me cheap" (exact)',
    );
    expect(cardActionChange(write(ADD_GOOGLE_KEYWORD), null)).toBeNull();
  });
});

describe('withTerms', () => {
  it('keeps only the negatives a person chose', () => {
    const narrowed = withTerms(write(ADD_GOOGLE_NEGATIVES), ['free gym', 'gym jobs']);
    expect(narrowed.kind === 'add_negatives' && narrowed.terms.map((term) => term.text)).toEqual([
      'free gym',
      'gym jobs',
    ]);
    expect(withTerms(write(RAISE_GOOGLE_BUDGET), [])).toBe(write(RAISE_GOOGLE_BUDGET));
  });
});

describe('previewVerdict', () => {
  it("says Google's validate_only accepted it and nothing changes until confirmed", () => {
    expect(previewVerdict(answer({ status: 'would_apply' }), 'MXN')).toEqual({
      tone: 'ok',
      text: 'Google checked it (validate_only ok) and would accept it. Nothing changes until you confirm.',
    });
  });

  it("decodes Google's refusal into plain words, without the request id", () => {
    const verdict = previewVerdict(
      answer({
        status: 'refused',
        reason: 'validate_only_error',
        detail:
          'google:BUDGET_BELOW_PER_DAY_MINIMUM minimumBudgetAmountMicros=400000000 minimumBudgetMinor=40000 "Budget below minimum." request-id req-1',
      }),
      'MXN',
    );
    expect(verdict.tone).toBe('refused');
    expect(verdict.text).toBe(
      'Google refused it in its check: the budget is under Google\'s daily minimum; the lowest it accepts is 400.00 MXN/day; Google says: "Budget below minimum.". Nothing was written.',
    );
    expect(verdict.text).not.toContain('req-1');
  });

  it('reads an unknown Google code rather than dropping it', () => {
    const verdict = previewVerdict(
      answer({
        status: 'refused',
        reason: 'validate_only_error',
        detail: 'google:SOME_NEW_ERROR request-id none',
      }),
      null,
    );
    expect(verdict.text).toBe(
      'Google refused it in its check: some new error. Nothing was written.',
    );
  });

  it('words our own refusals and strips a leg prefix', () => {
    expect(previewVerdict(answer({ status: 'refused', reason: 'drifted' }), null).text).toBe(
      'The live value changed since this was proposed, so it needs a fresh look. Nothing was written.',
    );
    expect(
      previewVerdict(answer({ status: 'refused', reason: 'preflight_failed:0:guardrail' }), null)
        .text,
    ).toBe("It goes past one of this portfolio's limits. Nothing was written.");
  });

  it('says it could not read an answer when there is none', () => {
    expect(previewVerdict(null, null)).toEqual({
      tone: 'failed',
      text: "We could not read the platform's answer. Nothing was written.",
    });
  });
});

describe('resultVerdict', () => {
  it('says what the real write did', () => {
    expect(resultVerdict(answer({ status: 'applied' }, false), null)).toEqual({
      tone: 'ok',
      text: 'Done. The change is live and recorded in Activity.',
    });
    expect(resultVerdict(answer({ status: 'scheduled' }, false), null).tone).toBe('ok');
    expect(resultVerdict(answer({ status: 'compensated' }, false), null).tone).toBe('failed');
    expect(
      resultVerdict(answer({ status: 'refused', reason: 'shared_budget' }, false), null).text,
    ).toBe(
      'Other campaigns spend this budget too, so changing it would move them as well. Nothing was written.',
    );
  });
});
