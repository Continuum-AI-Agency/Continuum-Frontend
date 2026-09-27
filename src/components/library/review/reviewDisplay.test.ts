import { describe, expect, it } from 'bun:test';
import { DEFAULT_REVIEW_STATE_LABELS, resolveReviewStateLabels } from '@continuum/contracts';
import { reviewDisplay } from './reviewDisplay';

const labels = resolveReviewStateLabels(DEFAULT_REVIEW_STATE_LABELS);
const legal = {
  id: '11111111-1111-4111-8111-111111111111',
  baseStatus: 'in_review' as const,
  label: 'Legal review',
  color: '#8B5CF6',
  position: 0,
};

describe('reviewDisplay', () => {
  it('reads as the custom state when the asset holds one on its base', () => {
    expect(reviewDisplay('in_review', legal.id, labels, [legal])).toEqual({
      status: 'in_review',
      stateId: legal.id,
      label: 'Legal review',
      color: '#8B5CF6',
    });
  });

  it('falls back to the base label for no state, a deleted state, or a base mismatch', () => {
    expect(reviewDisplay('in_review', null, labels, [legal]).label).toBe('In review');
    expect(reviewDisplay('in_review', 'gone', labels, [legal]).stateId).toBeNull();
    expect(reviewDisplay('approved', legal.id, labels, [legal]).label).toBe('Approved');
  });
});
