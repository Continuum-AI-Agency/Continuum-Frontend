import { describe, expect, it } from 'bun:test';

import { pluralize } from './pluralize';

describe('pluralize', () => {
  it('includes the count in the output', () => {
    expect(pluralize(3, 'trend')).toBe('3 trends');
  });

  it('keeps the singular noun for exactly one', () => {
    expect(pluralize(1, 'scheduling channel')).toBe('1 scheduling channel');
  });

  it('pluralizes zero', () => {
    expect(pluralize(0, 'event')).toBe('0 events');
  });

  it('pluralizes two', () => {
    expect(pluralize(2, 'question')).toBe('2 questions');
  });

  it('uses an explicit irregular plural when given', () => {
    expect(pluralize(2, 'entry', 'entries')).toBe('2 entries');
    expect(pluralize(0, 'entry', 'entries')).toBe('0 entries');
  });

  it('ignores the irregular plural at a count of one', () => {
    expect(pluralize(1, 'entry', 'entries')).toBe('1 entry');
  });

  it('treats negative counts as plural', () => {
    expect(pluralize(-1, 'draft')).toBe('-1 drafts');
  });
});
