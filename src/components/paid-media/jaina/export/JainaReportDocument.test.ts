import { describe, expect, it } from 'bun:test';
import type { CheckpointBlockV2 } from '@/lib/jaina/schemas';
import { formatPeriod, resolveEntityLabel, resolvePeriod } from './JainaReportDocument';

function block(provenance: CheckpointBlockV2['provenance']): CheckpointBlockV2 {
  return {
    block_id: Math.random().toString(36).slice(2),
    category: 'narrative',
    scope: 'account',
    title: 'Block',
    priority: 1,
    provenance,
    body: 'text',
    highlights: [],
    citations: [],
  } as unknown as CheckpointBlockV2;
}

function provenance(over: Record<string, unknown>): CheckpointBlockV2['provenance'] {
  return {
    source: 'computed',
    tool: null,
    period: null,
    entity_label: null,
    record_count: null,
    ...over,
  } as CheckpointBlockV2['provenance'];
}

describe('resolvePeriod', () => {
  it('spans the widest window any block was computed over', () => {
    const period = resolvePeriod([
      block(provenance({ period: { since: '2026-03-01', until: '2026-03-10', requested_label: null } })),
      block(provenance({ period: { since: '2026-02-20', until: '2026-03-04', requested_label: null } })),
    ]);
    expect(period.since).toBe('2026-02-20');
    expect(period.until).toBe('2026-03-10');
  });

  it('survives blocks with no provenance', () => {
    expect(resolvePeriod([block(null), block(null)])).toEqual({
      since: null,
      until: null,
      label: null,
    });
  });

  it('prefers a human label over raw dates', () => {
    const period = resolvePeriod([
      block(provenance({ period: { since: '2026-03-01', until: '2026-03-10', requested_label: 'Last 7 days' } })),
    ]);
    expect(formatPeriod(period)).toBe('Last 7 days');
  });

  it('formats a bare range when there is no label', () => {
    expect(formatPeriod({ since: '2026-03-01', until: '2026-03-10', label: null })).toBe(
      '2026-03-01 — 2026-03-10',
    );
  });

  it('has nothing to say when no block carries a period', () => {
    expect(formatPeriod({ since: null, until: null, label: null })).toBeNull();
  });
});

describe('resolveEntityLabel', () => {
  it('names the entity when every block agrees', () => {
    expect(
      resolveEntityLabel([
        block(provenance({ entity_label: 'Spring Sale' })),
        block(provenance({ entity_label: 'Spring Sale' })),
      ]),
    ).toBe('Spring Sale');
  });

  it('stays silent when blocks disagree, rather than claiming one', () => {
    expect(
      resolveEntityLabel([
        block(provenance({ entity_label: 'Spring Sale' })),
        block(provenance({ entity_label: 'Winter Push' })),
      ]),
    ).toBeNull();
  });
});
