// GRANTABLE_ACTION_KINDS guard: the allowlist of action kinds an autopilot
// grant may ever cover must stay strictly risk-reducing. Growing spend is a
// human decision — no scale/budget/activate kind may ever enter the list.
// (bun test)
import { expect, test } from 'bun:test';
import type { GrantableActionKind, RecommendationKind, RuleActionKind } from '../src/index';
import { GRANTABLE_ACTION_KINDS } from '../src/index';

// Mirrors of the source unions as VALUES, so membership is testable at runtime.
// The type annotations bind them to the real unions: adding/renaming a member
// in src without updating these lines is a tsc error.
const RECOMMENDATION_KINDS: RecommendationKind[] = [
  'pause',
  'creative_refresh',
  'audience_expand',
  'pause_ad',
  'variate_creative',
  'seed_experiment',
];
const RULE_ACTION_KINDS: RuleActionKind[] = [
  'pause',
  'creative_refresh',
  'audience_expand',
  'starve',
  'freeze',
];

// Forward-declared grantable kinds that are not yet members of any kind
// vocabulary. When one lands in a union, remove it here so the membership
// check below starts covering it.
const FORWARD_DECLARED = new Set<GrantableActionKind>(['stock_pause']);

test('no grantable kind is a scale/budget/activate move', () => {
  const denylist = ['scale', 'activate', 'budget', 'raise'];
  for (const kind of GRANTABLE_ACTION_KINDS) {
    for (const banned of denylist) {
      expect(kind.includes(banned), `'${kind}' must not contain '${banned}'`).toBe(false);
    }
  }
});

test('every grantable kind is a valid RecommendationKind or RuleActionKind (forward-declared excepted)', () => {
  const known = new Set<string>([...RECOMMENDATION_KINDS, ...RULE_ACTION_KINDS]);
  for (const kind of GRANTABLE_ACTION_KINDS) {
    if (FORWARD_DECLARED.has(kind)) continue;
    expect(known.has(kind), `'${kind}' is in neither kind vocabulary`).toBe(true);
  }
});

test('forward-declared kinds have not silently landed in a vocabulary', () => {
  for (const kind of FORWARD_DECLARED) {
    expect(RECOMMENDATION_KINDS).not.toContain(kind);
    expect(RULE_ACTION_KINDS).not.toContain(kind);
  }
});

test('budget-shaping rule kinds (starve/freeze) are not grantable', () => {
  // They carry no approval object — granting them would auto-act on budgets.
  const grantable: readonly string[] = GRANTABLE_ACTION_KINDS;
  expect(grantable).not.toContain('starve');
  expect(grantable).not.toContain('freeze');
});
