import { describe, expect, it } from 'bun:test';
import {
  DOCUMENT_RETENTION_DEFAULT,
  DOCUMENT_RETENTION_VALUES,
  documentRenameSchema,
  documentRetentionSchema,
  documentScopeSchema,
  EPHEMERAL_DOCUMENT_TTL_DAYS,
  toDocumentRetention,
} from './retention';

describe('documentRetentionSchema', () => {
  it('accepts both persisted values', () => {
    expect(documentRetentionSchema.parse('permanent')).toBe('permanent');
    expect(documentRetentionSchema.parse('ephemeral')).toBe('ephemeral');
  });

  it('rejects anything else', () => {
    expect(documentRetentionSchema.safeParse('temporary').success).toBe(false);
    expect(documentRetentionSchema.safeParse('').success).toBe(false);
  });

  it('exposes exactly the two values', () => {
    expect([...DOCUMENT_RETENTION_VALUES].sort()).toEqual(['ephemeral', 'permanent']);
  });
});

describe('toDocumentRetention', () => {
  it('passes valid values through', () => {
    expect(toDocumentRetention('ephemeral')).toBe('ephemeral');
    expect(toDocumentRetention('permanent')).toBe('permanent');
  });

  // Every row written before the retention migration has no value here, and every one
  // of them is curated brand knowledge. Coercing to 'permanent' is what keeps those
  // rows visible; coercing to 'ephemeral' would make the whole library expire.
  it('falls back to permanent for null, undefined and junk', () => {
    expect(toDocumentRetention(null)).toBe('permanent');
    expect(toDocumentRetention(undefined)).toBe('permanent');
    expect(toDocumentRetention('nonsense')).toBe('permanent');
    expect(toDocumentRetention(7)).toBe('permanent');
    expect(DOCUMENT_RETENTION_DEFAULT).toBe('permanent');
  });
});

describe('EPHEMERAL_DOCUMENT_TTL_DAYS', () => {
  it('is 14 days', () => {
    expect(EPHEMERAL_DOCUMENT_TTL_DAYS).toBe(14);
  });
});

describe('documentScopeSchema', () => {
  it('covers the three settings views', () => {
    expect([...documentScopeSchema.options].sort()).toEqual(['active', 'archived', 'temporary']);
  });
});

describe('documentRenameSchema', () => {
  it('trims surrounding whitespace', () => {
    expect(documentRenameSchema.parse({ displayName: '  Brand Bible  ' })).toEqual({
      displayName: 'Brand Bible',
    });
  });

  it('rejects a name that is empty once trimmed', () => {
    expect(documentRenameSchema.safeParse({ displayName: '   ' }).success).toBe(false);
    expect(documentRenameSchema.safeParse({ displayName: '' }).success).toBe(false);
  });

  it('rejects a name longer than 255 characters', () => {
    expect(documentRenameSchema.safeParse({ displayName: 'a'.repeat(256) }).success).toBe(false);
    expect(documentRenameSchema.safeParse({ displayName: 'a'.repeat(255) }).success).toBe(true);
  });
});
