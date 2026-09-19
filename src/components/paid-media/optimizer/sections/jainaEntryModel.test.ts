import { describe, expect, it } from 'bun:test';
import { jainaEntryPrompts } from './jainaEntryModel';

describe('jainaEntryPrompts', () => {
  it('offers five analyses, each naming the portfolio and its objective', () => {
    const entries = jainaEntryPrompts({ id: 'p', name: 'Leads MX', objective: 'lead' });
    expect(entries.map((e) => e.key)).toEqual(['budget', 'creative', 'funnel', 'scaling', 'risks']);
    for (const entry of entries) {
      expect(entry.prompt).toContain('"Leads MX"');
      expect(entry.prompt).toContain('objective: Lead');
    }
  });
});
