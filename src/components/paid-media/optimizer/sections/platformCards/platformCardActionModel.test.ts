import { describe, expect, it } from 'bun:test';
import type { ActionRevertResponse } from '@continuum/contracts';
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
  undoAuditIdOf,
  undoPreviewVerdict,
  undoRestoresText,
  undoResultVerdict,
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

describe('previewVerdict on a bid target past the per-cycle bound', () => {
  it('names the bound the service read, and says it was not applied', () => {
    const verdict = previewVerdict(
      answer({
        status: 'refused',
        reason: 'preflight_failed:0:guardrail',
        detail:
          'bid_target_change: target_cpa_micros 35000000 to 25000000 moves 0.2857, over max_change_pct_per_cycle 0.2 (the default: the portfolio sets none)',
      }),
      'MXN',
    );
    expect(verdict).toEqual({
      tone: 'refused',
      text: 'Moves the Google Ads bid target more than 20% in a day — not applied. Nothing was written.',
    });
  });

  it("reads the portfolio's own bound when it sets one", () => {
    expect(
      previewVerdict(
        answer({
          status: 'refused',
          reason: 'guardrail',
          detail:
            'bid_target_change: target_roas 3 to 4 moves 0.3333, over max_change_pct_per_cycle 0.15',
        }),
        null,
      ).text,
    ).toBe(
      'Moves the Google Ads bid target more than 15% in a day — not applied. Nothing was written.',
    );
  });

  it('keeps the general limit copy for a guardrail that is not a bid target move', () => {
    expect(
      previewVerdict(
        answer({
          status: 'refused',
          reason: 'guardrail',
          detail: 'daily_change: 0.31 over max_change_pct_per_cycle 0.2',
        }),
        null,
      ).text,
    ).toBe("It goes past one of this portfolio's limits. Nothing was written.");
  });

  it("words Google's auto-apply refusal", () => {
    expect(
      resultVerdict(answer({ status: 'refused', reason: 'auto_apply_enabled' }, false), null).text,
    ).toBe(
      "Google's auto-apply recommendations are on for this account, so we do not write to it. Nothing was written.",
    );
  });
});

const AUDIT_ID = '0f0f0f0f-0000-4000-8000-000000000001';
const RUN_ID = '0c0c0c0c-0000-4000-8000-000000000001';
const campaignRef = (RAISE_GOOGLE_BUDGET as CardWrite).ref;

const undoAnswer = (
  result: Partial<ActionRevertResponse['result']> & Pick<ActionRevertResponse['result'], 'status'>,
  dryRun = true,
): ActionRevertResponse => ({
  ok: result.status === 'would_revert' || result.status === 'reverted',
  dryRun,
  runId: RUN_ID,
  result: {
    audit_id: AUDIT_ID,
    revert_audit_id: null,
    kind: 'set_budget',
    ref: campaignRef,
    restores: { minor: 117_900, currency: 'MXN' },
    ...result,
  },
});

describe('undoAuditIdOf', () => {
  const applied = (legs: unknown[], status = 'applied'): ApplyActionsResponse => ({
    ok: true,
    dryRun: false,
    results: [{ status, kind: 'set_budget', legs } as ApplyActionsResponse['results'][number]],
  });

  it("names the first leg's audit row of an applied write", () => {
    expect(undoAuditIdOf(applied([{ status: 'applied', auditId: AUDIT_ID }]))).toBe(AUDIT_ID);
  });

  it('offers no undo for anything but an applied write', () => {
    expect(undoAuditIdOf(applied([{ status: 'applied', auditId: AUDIT_ID }], 'scheduled'))).toBe(
      null,
    );
    expect(undoAuditIdOf(applied([{ status: 'applied', auditId: null }]))).toBeNull();
    expect(undoAuditIdOf(applied([]))).toBeNull();
    expect(undoAuditIdOf(null)).toBeNull();
  });
});

describe('undoRestoresText', () => {
  it('says the money it puts back', () => {
    expect(undoRestoresText({ minor: 117_900, currency: 'MXN' }, 'set_budget', null)).toBe(
      'Back to 1,179.00 MXN',
    );
  });

  it('says the status it puts back', () => {
    expect(undoRestoresText({ status: 'active' }, 'set_status', null)).toBe('Back to active');
  });

  it("names Google's bid setting, in currency units, never as the portfolio's goal", () => {
    expect(
      undoRestoresText({ field: 'target_cpa_micros', value: 35_000_000 }, 'set_bid_target', 'MXN'),
    ).toBe('Google Ads bid target back to 35.00 MXN');
    expect(undoRestoresText({ field: 'target_roas', value: 3.5 }, 'set_bid_target', null)).toBe(
      'Google Ads target ROAS (bid setting) back to 350%',
    );
  });

  it('counts the criteria an undo removes', () => {
    expect(undoRestoresText({ removes: ['c/1~2'] }, 'add_keyword', null)).toBe('Removes 1 keyword');
    expect(undoRestoresText({ removes: ['c/1~2', 'c/1~3'] }, 'add_negatives', null)).toBe(
      'Removes 2 negative keywords',
    );
  });

  it('says nothing when the service named nothing', () => {
    expect(undoRestoresText(null, null, null)).toBeNull();
  });
});

describe('undoPreviewVerdict', () => {
  it('lets a person confirm only what Google accepted', () => {
    expect(undoPreviewVerdict(undoAnswer({ status: 'would_revert' }))).toEqual({
      tone: 'ok',
      text: 'Google checked the undo (validate_only ok). Nothing changes until you confirm.',
    });
  });

  it('says someone changed it since, with what the service read', () => {
    expect(
      undoPreviewVerdict(
        undoAnswer({
          status: 'conflict',
          reason: 'conflict',
          detail: 'target_cpa_micros reads 52000000; the write left 51000000',
        }),
      ),
    ).toEqual({
      tone: 'refused',
      text: 'Changed in Google Ads since — not undone. target_cpa_micros reads 52000000; the write left 51000000.',
    });
  });

  it('words each refusal', () => {
    const refusal = (reason: string) =>
      undoPreviewVerdict(undoAnswer({ status: 'refused', reason, detail: 'x' })).text;
    expect(refusal('already_reverted')).toBe(
      'This change was already undone. Nothing was written.',
    );
    expect(refusal('not_applied')).toBe(
      'This change never landed, so there is nothing to undo. Nothing was written.',
    );
    expect(refusal('move_leg')).toBe(
      'This change is one side of a budget move between platforms, which is undone as a whole, never alone. Nothing was written.',
    );
    expect(refusal('auto_apply_enabled')).toBe(
      "Google's auto-apply recommendations are on for this account, so we do not write to it. Nothing was written.",
    );
    expect(refusal('guardrail')).toBe(
      "Undoing it goes past one of this portfolio's limits — not undone. Nothing was written.",
    );
    expect(refusal('some_new_reason')).toBe('Some new reason. Nothing was written.');
  });

  it('names the Google Ads bid target when the undo itself would move it past the bound', () => {
    expect(
      undoPreviewVerdict(
        undoAnswer({
          status: 'refused',
          reason: 'guardrail',
          detail:
            'bid_target_change: target_cpa_micros 25000000 to 35000000 moves 0.4, over max_change_pct_per_cycle 0.2',
        }),
      ).text,
    ).toBe(
      'Undoing it moves the Google Ads bid target more than 20% in a day — not undone. Nothing was written.',
    );
  });

  it('says it could not read an answer when there is none', () => {
    expect(undoPreviewVerdict(null)).toEqual({
      tone: 'failed',
      text: "We could not read the platform's answer. Nothing was written.",
    });
  });
});

describe('undoResultVerdict', () => {
  it('says the undo landed', () => {
    expect(undoResultVerdict(undoAnswer({ status: 'reverted' }, false))).toEqual({
      tone: 'ok',
      text: 'Undone. The previous value is back and recorded in Activity.',
    });
  });

  it('says an attempted undo did not land, with why', () => {
    expect(
      undoResultVerdict(
        undoAnswer(
          { status: 'failed', reason: 'write_failed', detail: 'google:INTERNAL_ERROR' },
          false,
        ),
      ),
    ).toEqual({
      tone: 'failed',
      text: 'The undo did not land: google:INTERNAL_ERROR. Check Activity before trying again.',
    });
  });

  it('never calls a preview an undo', () => {
    expect(undoResultVerdict(undoAnswer({ status: 'would_revert' }, false)).tone).toBe('refused');
  });

  it('carries conflicts and refusals through', () => {
    expect(
      undoResultVerdict(undoAnswer({ status: 'conflict', reason: 'conflict' }, false)),
    ).toEqual({ tone: 'refused', text: 'Changed in Google Ads since — not undone.' });
    expect(
      undoResultVerdict(undoAnswer({ status: 'refused', reason: 'already_reverted' }, false)).text,
    ).toBe('This change was already undone. Nothing was written.');
  });
});
