import { describe, expect, it } from 'bun:test';
import { groupMarks } from '../work/timeline';
import { filtersKey, filtersToRestore } from './inboxFilters';

describe('Watchman view preferences', () => {
  it('keeps explicit links ahead of saved preferences', () => {
    for (const query of ['role=gtm', 'conversation=existing', 'q=launch', 'item=approval'])
      expect(filtersToRestore(new URLSearchParams(query), '{"role":"content"}')).toBeNull();
  });
  it('refuses malformed storage while retaining only bounded known fields', () => {
    for (const saved of ['{', '[]', 'null', '42'])
      expect(filtersToRestore(new URLSearchParams(), saved)).toBeNull();
    expect(
      filtersToRestore(
        new URLSearchParams(),
        JSON.stringify({ role: 'gtm', status: 7, token: 'secret' }),
      ),
    ).toEqual({ role: 'gtm' });
    expect(
      filtersToRestore(new URLSearchParams(), JSON.stringify({ role: 'x'.repeat(201) })),
    ).toBeNull();
  });
  it('isolates preferences by brand', () => {
    expect(filtersKey('brand-a')).not.toBe(filtersKey('brand-b'));
  });
});

describe('persisted conversation timeline grouping', () => {
  it('keeps all messages represented in stable bounded groups', () => {
    const messages = Array.from({ length: 137 }, (_, index) => ({
      seq: index + 1,
      at: '2026-11-26T10:00:00Z',
      text: `Message ${index + 1}`,
    }));
    const marks = groupMarks(messages);
    expect(marks.length).toBe(50);
    expect(marks.reduce((count, mark) => count + mark.count, 0)).toBe(137);
    expect(marks[0]?.seq).toBe(1);
    expect(marks.at(-1)?.last).toBe(137);
    expect(groupMarks([])).toEqual([]);
  });
});
