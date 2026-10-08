import { describe, expect, it } from 'bun:test';
import { storageQuotaLevel } from './drive';

describe('storageQuotaLevel', () => {
  const at = (usedBytes: number, reservedBytes = 0) =>
    storageQuotaLevel({ usedBytes, reservedBytes, capacityBytes: 100 }).level;

  it('warns from 80% of the allowance and is full at 100%', () => {
    expect(at(79)).toBe('ok');
    expect(at(80)).toBe('warn');
    expect(at(100)).toBe('full');
  });

  it('counts in-flight reservations toward the ceiling', () => {
    expect(at(70, 10)).toBe('warn');
  });

  it('treats a zero allowance as full', () => {
    expect(storageQuotaLevel({ usedBytes: 0, reservedBytes: 0, capacityBytes: 0 }).level).toBe('full');
  });
});
