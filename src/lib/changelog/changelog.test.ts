import { describe, expect, it } from 'bun:test';
import { computeUnreadCount, getLatestEntryId, getSortedChangelog } from './changelog';
import type { ChangelogEntry } from './schema';

function entry(id: string, date: string): ChangelogEntry {
  return { id, date, title: `t-${id}`, body: `b-${id}` };
}

describe('getSortedChangelog', () => {
  it('returns the real changelog sorted DESC by date then id', () => {
    const entries = getSortedChangelog();
    expect(entries.length).toBeGreaterThan(0);

    for (let i = 0; i < entries.length - 1; i++) {
      const current = entries[i];
      const next = entries[i + 1];
      const currentKey = `${current.date}|${current.id}`;
      const nextKey = `${next.date}|${next.id}`;
      // Newest-first: every entry sorts at or after the following one.
      expect(currentKey >= nextKey).toBe(true);
    }
  });

  it('breaks a same-date tie by id descending', () => {
    const entries = getSortedChangelog();
    const sameDay = entries.filter((e) => e.date === '2026-07-20');
    expect(sameDay.length).toBe(2);
    expect(sameDay[0].id).toBe('2026-07-20-planner-bulk-actions');
    expect(sameDay[1].id).toBe('2026-07-20-content-agent-retry');
  });

  it('returns a stable memoized reference', () => {
    expect(getSortedChangelog()).toBe(getSortedChangelog());
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
