import { describe, expect, it } from 'bun:test';
import {
  ADHOC_SUGGESTION_CATEGORIES,
  ADHOC_SUGGESTION_DAILY_CAP,
  type AdhocSuggestionGate,
  adhocSuggestionGateFor,
  adhocSuggestionGateNote,
  adhocSuggestionPlanSchema,
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
