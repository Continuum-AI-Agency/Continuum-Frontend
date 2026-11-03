import { describe, expect, it } from 'bun:test';
import type { HomeMode } from '@continuum/contracts';
import { readingFor } from './__fixtures__/readings';
import { askSuggestions } from './askModel';

const questions = (mode: HomeMode) => {
  const { reading, board } = readingFor(mode);
  return askSuggestions(reading, board).map((suggestion) => suggestion.question);
};

describe('askSuggestions', () => {
  it('offers three or four questions in every mode, none repeated', () => {
    for (const mode of ['setup', 'fix', 'operate', 'approve', 'recommend'] as const) {
      const list = questions(mode);
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(list.length).toBeLessThanOrEqual(4);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('setup: asks how to start and about the goal the Brand Book suggests', () => {
    const list = questions('setup');
    expect(list[0]).toBe('What should I connect first to get this brand started?');
    expect(list).toContain('Is revenue the right goal for this business?');
    // No account, so no question about results it cannot have.
    expect(list.some((question) => question.includes('this month'))).toBe(false);
  });

  it('fix: starts from the issues the reading names', () => {
    const list = questions('fix');
    expect(list[0]).toBe(
      'How do I fix this: Leads // Google Ads only lost the campaigns it manages?',
    );
    expect(list[1]).toBe(
      'How do I fix this: Conversaciones Whatsapp has read no new data for 4 days?',
    );
  });

  it('operate: asks what Autopilot did and follows the team goal', () => {
    const list = questions('operate');
    expect(list[0]).toBe('What did Autopilot change overnight, and why?');
    expect(list).toContain('What is behind this: 2 recommendations waiting in Tours?');
    expect(list).toContain('Are we on pace for leads this month?');
  });

  it('approve: asks which waiting change to approve first, biggest first', () => {
    const list = questions('approve');
    expect(list[0]).toBe(
      'What should I approve first: 3 recommendations and 1 budget move waiting in MENSAJES?',
    );
    expect(list).toContain('Which result are my ads bringing most this month?');
  });

  it('recommend: speaks for a team whose client applies the changes', () => {
    const list = questions('recommend');
    expect(list[0]).toBe('What should we recommend the client change first this week?');
    expect(list).toContain(
      'Explain this for the client: 4 recommendations waiting in Pink Elephant Search',
    );
  });

  it('asks about grouping campaigns when the brand has ads but no portfolio', () => {
    const { reading, board } = readingFor('approve');
    const noPortfolios = {
      ...reading,
      mode: 'recommend' as const,
      opportunities: [
        {
          portfolioId: null,
          title: 'Group your campaigns in a portfolio so Continuum can move budget toward leads',
          count: 0,
        },
      ],
    };
    expect(askSuggestions(noPortfolios, board).map((s) => s.question)).toContain(
      'How should I group my campaigns into portfolios?',
    );
  });

  it('gives every suggestion a stable key', () => {
    const { reading, board } = readingFor('fix');
    const keys = askSuggestions(reading, board).map((suggestion) => suggestion.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
