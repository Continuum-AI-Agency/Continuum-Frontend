import { describe, expect, it } from 'bun:test';
import { mediaReviewStatusSchema } from '@continuum/contracts';
import { normalizeReviewStatus, REVIEW_STATUS_META, REVIEW_STATUS_ORDER } from './reviewStatus';

describe('REVIEW_STATUS_ORDER / REVIEW_STATUS_META', () => {
  it('covers every contract status exactly once, Unsorted first', () => {
    expect([...REVIEW_STATUS_ORDER].sort()).toEqual([...mediaReviewStatusSchema.options].sort());
    expect(REVIEW_STATUS_ORDER[0]).toBe('none');
    for (const status of REVIEW_STATUS_ORDER) {
      expect(REVIEW_STATUS_META[status].label.length).toBeGreaterThan(0);
      expect(REVIEW_STATUS_META[status].columnLabel.length).toBeGreaterThan(0);
      expect(REVIEW_STATUS_META[status].dotClass.length).toBeGreaterThan(0);
    }
  });

  it("only 'none' renders without a workflow indicator", () => {
    expect(REVIEW_STATUS_META.none.indicator).toBeNull();
    for (const status of REVIEW_STATUS_ORDER.filter((candidate) => candidate !== 'none')) {
      expect(REVIEW_STATUS_META[status].indicator).not.toBeNull();
    }
  });
});

describe('normalizeReviewStatus', () => {
  it('passes valid statuses through', () => {
    expect(normalizeReviewStatus('approved')).toBe('approved');
    expect(normalizeReviewStatus('in_review')).toBe('in_review');
  });

  it("falls back to 'none' for unknown, missing, or non-string values", () => {
    expect(normalizeReviewStatus('bogus')).toBe('none');
    expect(normalizeReviewStatus(undefined)).toBe('none');
    expect(normalizeReviewStatus(null)).toBe('none');
    expect(normalizeReviewStatus(42)).toBe('none');
  });
});
