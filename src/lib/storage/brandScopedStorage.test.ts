import { beforeEach, describe, expect, it } from 'bun:test';
import {
  getItem,
  makeKey,
  migrateLegacyKey,
  purgeAllForBrand,
  purgeOrphans,
  removeItem,
  setItem,
} from './brandScopedStorage';

describe('brandScopedStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('makeKey appends :b:<brandId> to the base key', () => {
    expect(makeKey('foo', 'brand-123')).toBe('foo:b:brand-123');
  });

  it('makeKey throws when brandId is empty', () => {
    expect(() => makeKey('foo', '')).toThrow();
  });

  it('setItem and getItem isolate values per brand', () => {
    setItem('draft', 'brand-a', 'alpha');
    setItem('draft', 'brand-b', 'bravo');

    expect(getItem('draft', 'brand-a')).toBe('alpha');
    expect(getItem('draft', 'brand-b')).toBe('bravo');
  });

  it('removeItem only removes the scoped key', () => {
    setItem('draft', 'brand-a', 'alpha');
    setItem('draft', 'brand-b', 'bravo');

    removeItem('draft', 'brand-a');

    expect(getItem('draft', 'brand-a')).toBeNull();
    expect(getItem('draft', 'brand-b')).toBe('bravo');
  });

  it('purgeAllForBrand removes every key suffixed with that brand', () => {
    setItem('draft', 'brand-a', '1');
    setItem('recent', 'brand-a', '2');
    setItem('draft', 'brand-b', '3');

    purgeAllForBrand('brand-a');

    expect(getItem('draft', 'brand-a')).toBeNull();
    expect(getItem('recent', 'brand-a')).toBeNull();
    expect(getItem('draft', 'brand-b')).toBe('3');
  });

  it('purgeOrphans removes scoped keys for brands no longer known and keeps the active brand', () => {
    setItem('draft', 'brand-a', 'active');
    setItem('draft', 'brand-b', 'still-known');
    setItem('draft', 'brand-c', 'orphan');
    window.localStorage.setItem('unscoped', 'untouched');

    purgeOrphans('brand-a', new Set(['brand-a', 'brand-b']));

    expect(getItem('draft', 'brand-a')).toBe('active');
    expect(getItem('draft', 'brand-b')).toBe('still-known');
    expect(getItem('draft', 'brand-c')).toBeNull();
    expect(window.localStorage.getItem('unscoped')).toBe('untouched');
  });

  it('migrateLegacyKey copies value to scoped key and deletes legacy', () => {
    window.localStorage.setItem('legacy:draft', 'preserved');

    const migrated = migrateLegacyKey('legacy:draft', 'draft', 'brand-a');

    expect(migrated).toBe(true);
    expect(window.localStorage.getItem('legacy:draft')).toBeNull();
    expect(getItem('draft', 'brand-a')).toBe('preserved');
  });

  it('migrateLegacyKey returns false when legacy key is absent', () => {
    expect(migrateLegacyKey('legacy:draft', 'draft', 'brand-a')).toBe(false);
  });

  it('migrateLegacyKey does not overwrite an existing scoped value', () => {
    window.localStorage.setItem('legacy:draft', 'old');
    setItem('draft', 'brand-a', 'new');

    migrateLegacyKey('legacy:draft', 'draft', 'brand-a');

    expect(getItem('draft', 'brand-a')).toBe('new');
    expect(window.localStorage.getItem('legacy:draft')).toBeNull();
  });
});
