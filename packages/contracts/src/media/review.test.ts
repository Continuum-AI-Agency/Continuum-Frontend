import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_REVIEW_STATE_LABELS,
  reviewStateLabelSchema,
  reviewStateLabelsSchema,
} from './review';

describe('review state labels', () => {
  it('ships a valid default for every state, in order', () => {
    const parsed = reviewStateLabelsSchema.parse(DEFAULT_REVIEW_STATE_LABELS);
    expect(parsed.map((label) => label.state)).toEqual([
      'none',
      'draft',
      'in_review',
      'needs_changes',
      'approved',
    ]);
    expect(parsed.map((label) => label.position)).toEqual([0, 1, 2, 3, 4]);
  });

  it('rejects a state labelled twice', () => {
    const [first] = DEFAULT_REVIEW_STATE_LABELS;
    expect(reviewStateLabelsSchema.safeParse([first, { ...first, label: 'Again' }]).success).toBe(
      false,
    );
  });

  it('rejects an unknown state, a non-hex colour, and a 41-char label', () => {
    const base = { state: 'draft', label: 'Draft', color: '#6B7280', position: 0 };
    expect(reviewStateLabelSchema.safeParse(base).success).toBe(true);
    expect(reviewStateLabelSchema.safeParse({ ...base, state: 'shipped' }).success).toBe(false);
    expect(reviewStateLabelSchema.safeParse({ ...base, color: 'grey' }).success).toBe(false);
    expect(reviewStateLabelSchema.safeParse({ ...base, label: 'x'.repeat(41) }).success).toBe(
      false,
    );
  });
});
