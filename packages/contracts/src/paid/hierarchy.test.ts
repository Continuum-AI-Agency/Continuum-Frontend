import { describe, expect, it } from 'bun:test';

import { buildEntityPathLabel, entityHierarchySchema } from './hierarchy';

describe('buildEntityPathLabel', () => {
  it('joins campaign › adset › ad names', () => {
    const hierarchy = entityHierarchySchema.parse({
      campaign: { id: '7', name: 'Spring Sale' },
      adset: { id: '45', name: 'LAL 1%' },
      ad: { id: '123', name: 'High Hook' },
    });
    expect(buildEntityPathLabel(hierarchy)).toBe('Spring Sale › LAL 1% › High Hook');
  });

  it('skips levels whose name is missing', () => {
    const hierarchy = entityHierarchySchema.parse({
      campaign: { id: '7', name: 'Spring Sale' },
      adset: { id: '45', name: null },
      ad: { id: '123', name: 'High Hook' },
    });
    expect(buildEntityPathLabel(hierarchy)).toBe('Spring Sale › High Hook');
  });

  it('returns an empty string for an empty hierarchy', () => {
    expect(buildEntityPathLabel(entityHierarchySchema.parse({}))).toBe('');
  });

  it('carries an account ref so a cross-account row can name its source', () => {
    const hierarchy = entityHierarchySchema.parse({
      account: { id: 'act_1384888738409913', name: 'Privalia MX | ACQ | Mobile Installs' },
      campaign: { id: '7', name: 'Spring Sale' },
    });
    expect(hierarchy.account?.name).toBe('Privalia MX | ACQ | Mobile Installs');
  });

  it('OMITS the account from the label by default', () => {
    // These strings are already user-visible and mirrored by three hand-typed edge copies.
    // Prepending a segment by default would silently rewrite shipped output.
    const hierarchy = entityHierarchySchema.parse({
      account: { id: 'act_1', name: 'ACQ' },
      campaign: { id: '7', name: 'Spring Sale' },
    });
    expect(buildEntityPathLabel(hierarchy)).toBe('Spring Sale');
  });

  it('prepends the account only when explicitly asked', () => {
    const hierarchy = entityHierarchySchema.parse({
      account: { id: 'act_1', name: 'ACQ' },
      campaign: { id: '7', name: 'Spring Sale' },
    });
    expect(buildEntityPathLabel(hierarchy, { includeAccount: true })).toBe('ACQ › Spring Sale');
  });

  it('stays parseable when the account is absent (single-account response)', () => {
    const hierarchy = entityHierarchySchema.parse({ campaign: { id: '7', name: 'Spring' } });
    expect(hierarchy.account).toBeUndefined();
    expect(buildEntityPathLabel(hierarchy, { includeAccount: true })).toBe('Spring');
  });
});
