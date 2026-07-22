import { describe, expect, it } from 'bun:test';

import { referenceStatusBadge } from './referenceStatusBadge';

describe('referenceStatusBadge', () => {
  it('maps processing to a Processing label', () => {
    expect(referenceStatusBadge('processing')).toEqual({ label: 'Processing', tone: 'processing' });
  });

  it('maps ready to a Ready label', () => {
    expect(referenceStatusBadge('ready')).toEqual({ label: 'Ready', tone: 'ready' });
  });

  it('maps error to a Failed label', () => {
    expect(referenceStatusBadge('error')).toEqual({ label: 'Failed', tone: 'error' });
  });

  it('returns null when no status is set', () => {
    expect(referenceStatusBadge(undefined)).toBeNull();
  });
});
