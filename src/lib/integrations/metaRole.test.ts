import { describe, expect, it } from 'bun:test';
import { deriveMetaAccountRole, isHigherPrivilegeRole, isReadOnlyMetaRole } from './metaRole';

describe('deriveMetaAccountRole', () => {
  it('maps ADMIN/MANAGE tasks to admin', () => {
    expect(deriveMetaAccountRole(['ADMIN'])).toBe('admin');
    expect(deriveMetaAccountRole(['MANAGE', 'ADVERTISE'])).toBe('admin');
  });

  it('maps ADVERTISE (without admin) to advertiser', () => {
    expect(deriveMetaAccountRole(['ADVERTISE', 'ANALYZE'])).toBe('advertiser');
  });

  it('maps ANALYZE-only to analyst (read-only)', () => {
    expect(deriveMetaAccountRole(['ANALYZE'])).toBe('analyst');
  });

  it('is case-insensitive and tolerant of non-array input', () => {
    expect(deriveMetaAccountRole(['advertise'])).toBe('advertiser');
    expect(deriveMetaAccountRole(null)).toBe('unknown');
    expect(deriveMetaAccountRole(undefined)).toBe('unknown');
    expect(deriveMetaAccountRole('ADMIN')).toBe('unknown');
    expect(deriveMetaAccountRole([])).toBe('unknown');
  });
});

describe('isHigherPrivilegeRole', () => {
  it('ranks admin > advertiser > analyst > unknown', () => {
    expect(isHigherPrivilegeRole('admin', 'advertiser')).toBe(true);
    expect(isHigherPrivilegeRole('advertiser', 'analyst')).toBe(true);
    expect(isHigherPrivilegeRole('analyst', 'unknown')).toBe(true);
    expect(isHigherPrivilegeRole('analyst', 'advertiser')).toBe(false);
    expect(isHigherPrivilegeRole('advertiser', 'advertiser')).toBe(false);
  });
});

describe('isReadOnlyMetaRole', () => {
  it('treats only analyst as read-only', () => {
    expect(isReadOnlyMetaRole('analyst')).toBe(true);
    expect(isReadOnlyMetaRole('advertiser')).toBe(false);
    expect(isReadOnlyMetaRole('admin')).toBe(false);
    expect(isReadOnlyMetaRole('unknown')).toBe(false);
    expect(isReadOnlyMetaRole(null)).toBe(false);
    expect(isReadOnlyMetaRole(undefined)).toBe(false);
  });
});
