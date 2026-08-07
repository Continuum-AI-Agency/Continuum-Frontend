import { describe, expect, it } from 'bun:test';
import type { DocumentView } from './types';
import {
  categoryLabel,
  documentCategoryOf,
  documentRetentionOf,
  filterDocumentsByCategory,
  filterDocumentsByScope,
  formatRetentionCountdown,
  isArchived,
  isEphemeral,
  isExpired,
} from './types';

const NOW = Date.parse('2026-08-06T12:00:00.000Z');
const hoursFromNow = (h: number) => new Date(NOW + h * 60 * 60 * 1000).toISOString();

function makeDoc(overrides: Partial<DocumentView> = {}): DocumentView {
  return {
    id: overrides.id ?? 'doc-1',
    name: overrides.name ?? 'file.pdf',
    source: 'upload',
    createdAt: '2026-06-10T00:00:00.000Z',
    status: 'ready',
    ...overrides,
  };
}

describe('documentCategoryOf', () => {
  it("returns the document's category when set", () => {
    expect(documentCategoryOf(makeDoc({ category: 'brand_guidelines' }))).toBe('brand_guidelines');
  });

  it('defaults to misc when category is absent', () => {
    expect(documentCategoryOf(makeDoc())).toBe('misc');
  });
});

describe('categoryLabel', () => {
  it('maps a category to its human label', () => {
    expect(categoryLabel('creative_strategy')).toBe('Creative strategy');
    expect(categoryLabel('misc')).toBe('Misc');
  });
});

describe('filterDocumentsByCategory', () => {
  const docs: DocumentView[] = [
    makeDoc({ id: 'a', category: 'brand_guidelines' }),
    makeDoc({ id: 'b', category: 'creative_strategy' }),
    makeDoc({ id: 'c' }), // no category -> misc
  ];

  it("returns all documents when filter is 'all'", () => {
    expect(filterDocumentsByCategory(docs, 'all')).toHaveLength(3);
  });

  it('keeps only documents matching the selected category', () => {
    const result = filterDocumentsByCategory(docs, 'brand_guidelines');
    expect(result.map((d) => d.id)).toEqual(['a']);
  });

  it('treats uncategorized documents as misc', () => {
    const result = filterDocumentsByCategory(docs, 'misc');
    expect(result.map((d) => d.id)).toEqual(['c']);
  });
});

describe('documentRetentionOf', () => {
  // Every row predating the retention migration has no value, and all of them are
  // curated knowledge. Defaulting the other way would expire the whole library.
  it('treats a missing retention as permanent', () => {
    expect(documentRetentionOf(makeDoc())).toBe('permanent');
  });

  it('reads an explicit retention', () => {
    expect(documentRetentionOf(makeDoc({ retention: 'ephemeral' }))).toBe('ephemeral');
  });
});

describe('isExpired', () => {
  it('is false for a permanent document even with a stale expiry', () => {
    // A promoted document can retain a stale expires_at, because the DB constraint is
    // deliberately one-directional. Treating that as expired would hide real brand
    // knowledge — the same trap the SQL predicate guards against.
    const promoted = makeDoc({ retention: 'permanent', expiresAt: hoursFromNow(-100) });
    expect(isExpired(promoted, NOW)).toBe(false);
  });

  it('is true for an ephemeral document past its expiry', () => {
    expect(isExpired(makeDoc({ retention: 'ephemeral', expiresAt: hoursFromNow(-1) }), NOW)).toBe(
      true,
    );
  });

  it('is false for an ephemeral document still in window', () => {
    expect(isExpired(makeDoc({ retention: 'ephemeral', expiresAt: hoursFromNow(1) }), NOW)).toBe(
      false,
    );
  });
});

describe('filterDocumentsByScope', () => {
  const permanent = makeDoc({ id: 'permanent' });
  const temporary = makeDoc({
    id: 'temporary',
    retention: 'ephemeral',
    expiresAt: hoursFromNow(72),
  });
  const expired = makeDoc({
    id: 'expired',
    retention: 'ephemeral',
    expiresAt: hoursFromNow(-1),
  });
  const archived = makeDoc({ id: 'archived', archivedAt: new Date(NOW).toISOString() });
  const all = [permanent, temporary, expired, archived];

  it('active shows live permanent and live temporary only', () => {
    expect(filterDocumentsByScope(all, 'active', NOW).map((d) => d.id)).toEqual([
      'permanent',
      'temporary',
    ]);
  });

  it('temporary shows only live ephemerals', () => {
    expect(filterDocumentsByScope(all, 'temporary', NOW).map((d) => d.id)).toEqual(['temporary']);
  });

  it('archived shows only archived', () => {
    expect(filterDocumentsByScope(all, 'archived', NOW).map((d) => d.id)).toEqual(['archived']);
  });

  it('an archived ephemeral appears under archived, not temporary', () => {
    const archivedEphemeral = makeDoc({
      id: 'both',
      retention: 'ephemeral',
      expiresAt: hoursFromNow(72),
      archivedAt: new Date(NOW).toISOString(),
    });
    expect(filterDocumentsByScope([archivedEphemeral], 'temporary', NOW)).toEqual([]);
    expect(filterDocumentsByScope([archivedEphemeral], 'archived', NOW)).toHaveLength(1);
  });
});

describe('formatRetentionCountdown', () => {
  it('returns null with no expiry', () => {
    expect(formatRetentionCountdown(undefined, NOW)).toBeNull();
  });

  it('reports whole days remaining', () => {
    expect(formatRetentionCountdown(hoursFromNow(14 * 24), NOW)).toBe('14d left');
    // 13d23h must read as 13d, not round up to 14d.
    expect(formatRetentionCountdown(hoursFromNow(13 * 24 + 23), NOW)).toBe('13d left');
  });

  it('falls back to hours inside the last day', () => {
    expect(formatRetentionCountdown(hoursFromNow(5), NOW)).toBe('5h left');
  });

  it('says "Expires today" inside the last hour rather than "0h left"', () => {
    expect(formatRetentionCountdown(hoursFromNow(0.5), NOW)).toBe('Expires today');
  });

  it('says Expired once past', () => {
    expect(formatRetentionCountdown(hoursFromNow(-1), NOW)).toBe('Expired');
  });
});

describe('isArchived / isEphemeral', () => {
  it('reads the flags independently', () => {
    const d = makeDoc({ retention: 'ephemeral', archivedAt: new Date(NOW).toISOString() });
    expect(isArchived(d)).toBe(true);
    expect(isEphemeral(d)).toBe(true);
    expect(isArchived(makeDoc())).toBe(false);
    expect(isEphemeral(makeDoc())).toBe(false);
  });
});
