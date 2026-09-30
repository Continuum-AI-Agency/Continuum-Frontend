import { describe, expect, it } from 'bun:test';
import { jainaAccountEntryPrompts, jainaAskPrompt, jainaEntryPrompts } from './jainaEntryModel';

describe('jainaEntryPrompts', () => {
  const entries = jainaEntryPrompts({ id: 'p', name: 'Leads MX', objective: 'lead' });

  it('offers the five analyses in a fixed order', () => {
    expect(entries.map((e) => e.key)).toEqual(['budget', 'creative', 'funnel', 'scaling', 'risks']);
  });

  it('labels each one as the question a person would ask', () => {
    expect(entries.map((e) => e.label)).toEqual([
      'Where is the budget going?',
      'Which creatives are winning?',
      'Where does the funnel leak?',
      'Which ad set can scale?',
      'Risks this week',
    ]);
  });

  it('names the portfolio and its humanized objective in every prompt', () => {
    for (const entry of entries) {
      expect(entry.prompt).toContain('"Leads MX"');
      expect(entry.prompt).toContain('objective: Lead');
    }
  });
});

describe('jainaAskPrompt', () => {
  it('sends a typed question with the portfolio as its context, trimmed', () => {
    expect(
      jainaAskPrompt({ id: 'p', name: 'Leads MX', objective: 'lead' }, '  What if I pause RTG?  '),
    ).toBe('For the optimizer portfolio "Leads MX" (objective: Lead): What if I pause RTG?');
  });
});

describe('jainaAccountEntryPrompts', () => {
  const portfolios = [
    { name: 'Leads MX', objective: 'lead' },
    { name: 'Ventas CDMX', objective: 'purchase' },
  ];
  const full = jainaAccountEntryPrompts({
    accountLabel: 'Acme MX',
    portfolios,
    worstOverTarget: 'Leads MX',
    noResults: 'Ventas CDMX',
  });
  const quiet = jainaAccountEntryPrompts({
    accountLabel: 'Acme MX',
    portfolios,
    worstOverTarget: null,
    noResults: null,
  });

  it('offers five questions when a portfolio is over target and one is silent', () => {
    expect(full.map((e) => e.key)).toEqual(['expensive', 'pause', 'silent', 'budget', 'summary']);
    expect(full.map((e) => e.label)).toEqual([
      'Why is Leads MX expensive?',
      'What to pause this week?',
      'How is Ventas CDMX doing?',
      "Where's the budget?",
      'Summary for the client',
    ]);
  });

  it('offers four when nothing is over target, asking about risks instead of a silent portfolio', () => {
    expect(quiet.map((e) => e.key)).toEqual(['pause', 'risks', 'budget', 'summary']);
    expect(quiet[1].label).toBe("What's about to go wrong?");
  });

  it('keeps the expensive question without a silent one, and vice versa', () => {
    const onlyExpensive = jainaAccountEntryPrompts({
      accountLabel: null,
      portfolios,
      worstOverTarget: 'Leads MX',
      noResults: null,
    });
    expect(onlyExpensive.map((e) => e.key)).toEqual([
      'expensive',
      'pause',
      'risks',
      'budget',
      'summary',
    ]);
    const onlySilent = jainaAccountEntryPrompts({
      accountLabel: null,
      portfolios,
      worstOverTarget: null,
      noResults: 'Ventas CDMX',
    });
    expect(onlySilent.map((e) => e.key)).toEqual(['pause', 'silent', 'budget', 'summary']);
  });

  it('names the account and every portfolio with its humanized objective in every prompt', () => {
    for (const entry of [...full, ...quiet]) {
      expect(entry.prompt).toContain('the account "Acme MX"');
      expect(entry.prompt).toContain('"Leads MX" (objective: Lead)');
      expect(entry.prompt).toContain('"Ventas CDMX" (objective: Purchase)');
    }
  });

  it('opens each prompt with the question its label asks', () => {
    expect(full[0].prompt).toContain('why is "Leads MX" expensive?');
    expect(full[2].prompt).toContain('how is "Ventas CDMX" doing?');
    expect(quiet[1].prompt).toContain("what's about to go wrong?");
    expect(quiet[3].prompt).toContain('write a summary for the client');
  });

  it('falls back to the active account when no label is known', () => {
    const anonymous = jainaAccountEntryPrompts({
      accountLabel: null,
      portfolios: [],
      worstOverTarget: null,
      noResults: null,
    });
    expect(anonymous[0].prompt).toContain('the active account');
    expect(anonymous[0].prompt).toContain('none active');
  });
});
