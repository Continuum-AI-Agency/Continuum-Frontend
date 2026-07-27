import { describe, expect, test } from 'bun:test';
import { BRAND_SECTIONS, resolveSection } from './sections';

describe('settings Brand Intelligence navigation', () => {
  test('uses Brand Intelligence as the canonical settings section', () => {
    expect(BRAND_SECTIONS.some((section) => section.key === 'brand-intelligence')).toBe(true);
    expect(resolveSection('brand-intelligence')).toBe('brand-intelligence');
  });

  test('keeps the legacy Brand Book link as an alias', () => {
    expect(resolveSection('brand-book')).toBe('brand-intelligence');
  });
});
