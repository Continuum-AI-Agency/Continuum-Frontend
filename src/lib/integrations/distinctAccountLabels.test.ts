import { describe, expect, it } from 'bun:test';
import { withDistinctAccountLabels } from './distinctAccountLabels';

// PP-DT-C-ad-account-names-indistinguishable: the Home's account filter offered "Easy fit
// (Read-Only)" twice with nothing to tell the two accounts apart.
describe('withDistinctAccountLabels', () => {
  it('adds the end of the id to every label another account shares, case aside', () => {
    expect(
      withDistinctAccountLabels([
        { id: 'act_521903353286118', label: 'Easyfit' },
        { id: 'act_1296885445611472', label: 'Easy fit (Read-Only)' },
        { id: 'act_1474284901098956', label: 'Easy fit (Read-Only)' },
        { id: 'act_1472300554278005', label: 'Easy Fit (Read-Only)' },
      ]).map((account) => account.label),
    ).toEqual([
      'Easyfit',
      'Easy fit (Read-Only) · …1472',
      'Easy fit (Read-Only) · …8956',
      'Easy Fit (Read-Only) · …8005',
    ]);
  });

  it('keeps every other field of the account', () => {
    expect(
      withDistinctAccountLabels([
        { id: 'a-1', label: 'Same', platform: 'meta' },
        { id: 'a-2', label: 'Same', platform: 'google_ads' },
      ]).map((account) => account.platform),
    ).toEqual(['meta', 'google_ads']);
  });
});
