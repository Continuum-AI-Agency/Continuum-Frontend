import { describe, expect, it } from 'bun:test';
import { jainaEntryPrompts } from './jainaEntryModel';

describe('jainaEntryPrompts', () => {
  const entries = jainaEntryPrompts({ id: 'p', name: 'Leads MX', objective: 'lead' });

  it('offers the five analyses in a fixed order', () => {
    expect(entries.map((e) => e.key)).toEqual(['budget', 'creative', 'funnel', 'scaling', 'risks']);
  });

  it('labels each one as the question a person would ask', () => {
    expect(entries.map((e) => e.label)).toEqual([
      'Where is the money going?',
      'Which creatives are winning?',
      'Where does the funnel leak?',
      'What could take more budget?',
      'What is about to go wrong?',
    ]);
  });

  it('names the portfolio and its humanized objective in every prompt', () => {
    for (const entry of entries) {
      expect(entry.prompt).toContain('"Leads MX"');
      expect(entry.prompt).toContain('objective: Lead');
    }
  });
});
