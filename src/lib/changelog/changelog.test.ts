import { describe, expect, it } from 'bun:test';
import {
  computeUnreadCount,
  getChangelogRetentionStartDate,
  getLatestEntryId,
  sortChangelogDesc,
} from './changelog';
import type { ChangelogEntry } from './schema';

function entry(id: string, date: string): ChangelogEntry {
  return { id, date, createdAt: `${date}T12:00:00.000Z`, title: `t-${id}`, body: `b-${id}` };
}

describe('getChangelogRetentionStartDate', () => {
  it('keeps entries from the prior five calendar days, including the cutoff date', () => {
    expect(getChangelogRetentionStartDate(new Date('2026-07-27T23:59:59.000Z'))).toBe('2026-07-22');
  });
});

describe('sortChangelogDesc', () => {
  it('sorts DESC by date then id', () => {
    const sorted = sortChangelogDesc([
      entry('2026-07-18-a', '2026-07-18'),
      entry('2026-07-20-content-agent-retry', '2026-07-20'),
      entry('2026-07-19-b', '2026-07-19'),
      entry('2026-07-20-planner-bulk-actions', '2026-07-20'),
    ]);

    for (let i = 0; i < sorted.length - 1; i++) {
      const currentKey = `${sorted[i].date}|${sorted[i].id}`;
      const nextKey = `${sorted[i + 1].date}|${sorted[i + 1].id}`;
      // Newest-first: every entry sorts at or after the following one.
      expect(currentKey >= nextKey).toBe(true);
    }
  });

  it('breaks a same-date tie by id descending', () => {
    const sorted = sortChangelogDesc([
      entry('2026-07-20-content-agent-retry', '2026-07-20'),
      entry('2026-07-20-planner-bulk-actions', '2026-07-20'),
    ]);

    expect(sorted[0].id).toBe('2026-07-20-planner-bulk-actions');
    expect(sorted[1].id).toBe('2026-07-20-content-agent-retry');
  });

  it('does not mutate the input array', () => {
    const input = [entry('b', '2026-07-19'), entry('a', '2026-07-20')];
    const sorted = sortChangelogDesc(input);
    expect(input[0].id).toBe('b');
    expect(sorted[0].id).toBe('a');
  });
});

describe('getLatestEntryId', () => {
  it('returns the first entry id for a non-empty list', () => {
    expect(getLatestEntryId([entry('a', '2026-07-20'), entry('b', '2026-07-19')])).toBe('a');
  });

  it('returns null for an empty list', () => {
    expect(getLatestEntryId([])).toBeNull();
  });
});

describe('computeUnreadCount', () => {
  const entries = [entry('c', '2026-07-20'), entry('b', '2026-07-19'), entry('a', '2026-07-18')];

  it('counts every entry when lastSeenId is null (fail-open)', () => {
    expect(computeUnreadCount(entries, null)).toBe(3);
  });

  it('counts zero when the latest id was already seen', () => {
    expect(computeUnreadCount(entries, 'c')).toBe(0);
  });

  it('counts only entries newer than a middle id', () => {
    expect(computeUnreadCount(entries, 'b')).toBe(1);
  });

  it('counts every entry when the seen id is unknown (fail-open)', () => {
    expect(computeUnreadCount(entries, 'ghost')).toBe(3);
  });

  it('returns zero for an empty list', () => {
    expect(computeUnreadCount([], null)).toBe(0);
  });
});
