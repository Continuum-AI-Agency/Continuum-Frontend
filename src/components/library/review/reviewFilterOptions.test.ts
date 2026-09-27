import { describe, expect, it } from 'bun:test';
import { DEFAULT_REVIEW_STATE_LABELS, resolveReviewStateLabels } from '@continuum/contracts';
import { reviewFilterOptions } from './reviewFilterOptions';

describe('reviewFilterOptions', () => {
  it('offers the brand labels and each custom state right after its base', () => {
    const labels = resolveReviewStateLabels([
      ...DEFAULT_REVIEW_STATE_LABELS.filter((l) => l.state !== 'approved'),
      { state: 'approved', label: 'Client OK', color: '#123456', position: 4 },
    ]);
    const options = reviewFilterOptions(labels, [
      {
        id: '11111111-1111-4111-8111-111111111111',
        baseStatus: 'in_review',
        label: 'Legal review',
        color: '#8B5CF6',
        position: 0,
      },
    ]);
    expect(options.map((o) => `${o.kind}:${o.label}`)).toEqual([
      'status:In review',
      'state:Legal review',
      'status:Needs changes',
      'status:Client OK',
      'status:Draft',
    ]);
  });
});
