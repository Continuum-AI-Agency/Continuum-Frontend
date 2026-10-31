import { describe, expect, it } from 'bun:test';
import { recordBarEmptyState } from './ScaffoldRecordBar';

// PP-DT-E-canvas-unknown-scaffold-silent (deep test 2026-10-31, lane E): a link that names a
// proposal this brand does not have (archived, another brand's, a typo) opened the Canvas page
// on "Nothing on the canvas yet. Pick a proposal…" — the same words as arriving with no link,
// so nothing said the proposal the person clicked through to is not here.
describe('recordBarEmptyState — a link to a proposal this brand does not have', () => {
  const landing = { hydration: null, nodeCount: 0, isLoadingGraph: false };

  it('says the linked proposal is not here, beside the brand proposals to pick from', () => {
    expect(recordBarEmptyState({ ...landing, scaffoldCount: 3, requestedMissing: true })).toBe(
      'The proposal this link opened is not on this brand. Pick one below, or ask Jaina to propose a campaign.',
    );
  });

  it('says so on a brand with no proposal at all', () => {
    expect(recordBarEmptyState({ ...landing, scaffoldCount: 0, requestedMissing: true })).toBe(
      'The proposal this link opened is not on this brand, and it has no other proposal yet. Ask Jaina to propose a campaign.',
    );
  });

  it('stays silent while the list is read, and once something is on the canvas', () => {
    expect(
      recordBarEmptyState({ ...landing, scaffoldCount: null, requestedMissing: true }),
    ).toBeNull();
    expect(
      recordBarEmptyState({ ...landing, scaffoldCount: 3, nodeCount: 2, requestedMissing: true }),
    ).toBeNull();
  });
});
