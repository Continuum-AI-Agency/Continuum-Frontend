import { describe, expect, it } from 'bun:test';
import { resolveConfirmBrandId } from './brandSelection';

describe('resolveConfirmBrandId', () => {
  it('honors a requested brand the user can access', () => {
    expect(resolveConfirmBrandId('b2', ['b1', 'b2'], 'b1')).toBe('b2');
  });

  it('ignores a requested brand the user cannot access and uses the active brand', () => {
    expect(resolveConfirmBrandId('evil', ['b1', 'b2'], 'b1')).toBe('b1');
  });

  it('falls back to the active brand when nothing is requested', () => {
    expect(resolveConfirmBrandId(null, ['b1'], 'b1')).toBe('b1');
    expect(resolveConfirmBrandId(undefined, ['b1'], 'b1')).toBe('b1');
  });

  it('returns null when there is no requested or active brand', () => {
    expect(resolveConfirmBrandId(null, [], null)).toBeNull();
  });
});
