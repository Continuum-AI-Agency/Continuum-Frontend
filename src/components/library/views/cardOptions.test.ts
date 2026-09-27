import { describe, expect, it } from 'bun:test';
import {
  cardAspectClass,
  cardGridTemplate,
  chosenCustomFieldIds,
  formatDurationMs,
  toggleCardField,
  visibleCardFields,
} from './cardOptions';

const FIELD_ID = '7c2cc78f-6d3b-4d10-8e37-4fa03fabab21';

describe('card fields', () => {
  it('shows title and created date until the user chooses otherwise', () => {
    expect(visibleCardFields(undefined)).toEqual(['title', 'created']);
    expect(visibleCardFields({})).toEqual(['title', 'created']);
    expect(visibleCardFields({ fields: [] })).toEqual([]);
  });

  it('separates custom field ids from the built-in keys', () => {
    expect(chosenCustomFieldIds({ fields: ['title', FIELD_ID, 'size'] })).toEqual([FIELD_ID]);
    expect(chosenCustomFieldIds(undefined)).toEqual([]);
  });

  it('toggles a field on and off, keeping the order of the rest', () => {
    expect(toggleCardField(['title', 'created'], 'size')).toEqual(['title', 'created', 'size']);
    expect(toggleCardField(['title', 'created', 'size'], 'created')).toEqual(['title', 'size']);
  });
});

describe('card geometry', () => {
  it('maps each size to a min column width and leaves an unset size to the breakpoints', () => {
    expect(cardGridTemplate('sm')).toContain('150px');
    expect(cardGridTemplate('lg')).toContain('300px');
    expect(cardGridTemplate(undefined)).toBeUndefined();
  });

  it('forces a shape for every aspect except original', () => {
    expect(cardAspectClass('square')).toBe('aspect-square');
    expect(cardAspectClass('portrait')).toBe('aspect-[4/5]');
    expect(cardAspectClass('landscape')).toBe('aspect-video');
    expect(cardAspectClass('original')).toBeNull();
    expect(cardAspectClass(undefined)).toBeNull();
  });
});

describe('formatDurationMs', () => {
  it('prints m:ss and nothing for an unknown or zero duration', () => {
    expect(formatDurationMs(65_400)).toBe('1:05');
    expect(formatDurationMs(0)).toBeNull();
    expect(formatDurationMs(null)).toBeNull();
  });
});
