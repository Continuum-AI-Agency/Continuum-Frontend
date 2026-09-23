import { describe, expect, it } from 'bun:test';
import {
  ADHOC_HANDOFF_COPY,
  ADHOC_SUGGESTION_CATEGORIES,
  ADHOC_SUGGESTION_DAILY_CAP,
  type AdhocSuggestionGate,
  adhocHandoffBuiltNote,
  adhocHandoffCreatesAnObject,
  adhocHandoffRowKey,
  adhocSuggestionGateFor,
  adhocSuggestionGateNote,
  adhocSuggestionPlanSchema,
  readAdhocHandoff,
  readAdhocSuggestion,
} from './adhoc-suggestions';

const gate = (over: Partial<AdhocSuggestionGate> = {}): AdhocSuggestionGate => ({
  category: 'budget',
  state: 'ready',
  requests_used: 1,
  requests_left: 3,
  can_request: true,
  retry_after: null,
  reason: null,
  ...over,
});

describe('adhocSuggestionGateFor', () => {
  it('finds the gate for the category asked about', () => {
    const gates = [gate(), gate({ category: 'audience', can_request: false, reason: 'too_soon' })];
    expect(adhocSuggestionGateFor(gates, 'audience').reason).toBe('too_soon');
  });

  it('defaults to permissive when the envelope carries no gate for a category', () => {
    const fallback = adhocSuggestionGateFor([], 'creative');
    expect(fallback.can_request).toBe(true);
    expect(fallback.requests_left).toBe(ADHOC_SUGGESTION_DAILY_CAP);
    // A missing gate must not silently disable the control: the server refuses cheaply and
    // says why, which is a better failure than a button dead for no stated reason.
    expect(fallback.state).toBe('none');
  });
});

describe('adhocSuggestionGateNote', () => {
  it('says nothing when the ask is available', () => {
    expect(adhocSuggestionGateNote(gate())).toBeNull();
  });

  it('names each refusal in the words the control prints', () => {
    expect(adhocSuggestionGateNote(gate({ can_request: false, reason: 'already_running' }))).toBe(
      'Working on it…',
    );
    expect(adhocSuggestionGateNote(gate({ can_request: false, reason: 'too_soon' }))).toBe(
      'Just asked — a moment.',
    );
    expect(adhocSuggestionGateNote(gate({ can_request: false, reason: 'daily_limit' }))).toContain(
      String(ADHOC_SUGGESTION_DAILY_CAP),
    );
  });
});

describe('readAdhocSuggestion', () => {
  const plan = {
    version: 1,
    category: 'audience',
    headline: 'Widen the lookalike beside the retargeting set',
    why: 'Frequency has reached 4 while reach has stopped growing.',
    adset_id: '120210',
    adset_name: 'Retargeting 30d',
    impact_per_day: null,
    impact_unit: 'currency',
    impact_basis: null,
    confidence_note: null,
    steps: ['Duplicate the ad set against a 3% lookalike'],
    figures: [{ label: 'Frequency 7d', value: 4, unit: 'multiple' }],
    cta: null,
    adopt: null,
  };

  it('parses a stored plan', () => {
    expect(readAdhocSuggestion({ suggestion: plan })?.headline).toBe(plan.headline);
  });

  it('returns null rather than throwing on a plan the schema does not recognise', () => {
    expect(readAdhocSuggestion({ suggestion: { version: 2 } })).toBeNull();
    expect(readAdhocSuggestion({ suggestion: null })).toBeNull();
    expect(readAdhocSuggestion(null)).toBeNull();
  });

  it('refuses a headline longer than the card can hold', () => {
    const parsed = adhocSuggestionPlanSchema.safeParse({ ...plan, headline: 'x'.repeat(91) });
    expect(parsed.success).toBe(false);
  });

  it('refuses a fifth step — a fifth step is a second suggestion', () => {
    const parsed = adhocSuggestionPlanSchema.safeParse({
      ...plan,
      steps: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('the three categories', () => {
  it('are the product vocabulary, in order', () => {
    expect([...ADHOC_SUGGESTION_CATEGORIES]).toEqual(['audience', 'budget', 'creative']);
  });
});

describe('the handoff — what implementing an adopted plan built', () => {
  const built = {
    kind: 'audience_proposal' as const,
    recommendation_id: '44444444-4444-4444-8444-444444444444',
    proposal_id: '55555555-5555-4555-8555-555555555555',
    adset_id: '120210',
    adset_name: 'Retargeting 30d',
    reused: false,
    built_at: '2026-09-21T10:05:00Z',
  };

  it('reads a stored handoff back', () => {
    expect(readAdhocHandoff({ handoff: built })?.proposal_id).toBe(built.proposal_id);
  });

  it('reads a handoff it cannot parse as "not built", never as a throw', () => {
    expect(readAdhocHandoff({ handoff: { kind: 'nonsense' } })).toBeNull();
    expect(readAdhocHandoff({ handoff: null })).toBeNull();
    expect(readAdhocHandoff(null)).toBeNull();
  });

  it('lands on the recommendation it minted, in the queue own row-key vocabulary', () => {
    expect(adhocHandoffRowKey(built, null)).toBe(`rec:${built.recommendation_id}`);
  });

  it('lands a budget handoff on the ad set budget row, because it minted nothing', () => {
    expect(
      adhocHandoffRowKey(
        { ...built, kind: 'budget_queue', recommendation_id: null, proposal_id: null },
        null,
      ),
    ).toBe('budget:120210');
  });

  it('has nowhere to land when nothing was built and nothing was named', () => {
    expect(adhocHandoffRowKey(null, null)).toBeNull();
    expect(
      adhocHandoffRowKey(
        { ...built, kind: 'budget_queue', recommendation_id: null, adset_id: null },
        { adset_id: null },
      ),
    ).toBeNull();
  });

  it('says what exists AND that it is not delivering — never only the first half', () => {
    for (const category of ADHOC_SUGGESTION_CATEGORIES) {
      const note = adhocHandoffBuiltNote(category);
      expect(note).toContain(ADHOC_HANDOFF_COPY[category].built);
      expect(note).toContain(ADHOC_HANDOFF_COPY[category].paused);
    }
  });

  it('does not promise a budget move arrives paused — a budget move creates no object', () => {
    expect(adhocHandoffCreatesAnObject('budget')).toBe(false);
    expect(adhocHandoffCreatesAnObject('audience')).toBe(true);
    expect(adhocHandoffCreatesAnObject('creative')).toBe(true);
    expect(ADHOC_HANDOFF_COPY.budget.paused).not.toContain('paused');
  });

  it('promises the read-back, not just the intent, wherever an object IS created', () => {
    expect(ADHOC_HANDOFF_COPY.audience.paused).toContain('read back');
    expect(ADHOC_HANDOFF_COPY.creative.paused).toContain('read back');
  });
});
