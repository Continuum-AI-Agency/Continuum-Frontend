import { describe, expect, it } from 'bun:test';
import {
  jainaAccountEntryPrompts,
  jainaAskPrompt,
  jainaEntryPrompts,
  jainaTabEntryPrompts,
} from './jainaEntryModel';

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

describe('jainaTabEntryPrompts', () => {
  const account = {
    accountLabel: 'act_easyfit',
    portfolios: [{ name: 'Leads MX', objective: 'lead' }],
    worstOverTarget: null,
    noResults: null,
  };

  it('asks across platforms on All, naming the portfolios and all three platforms', () => {
    const entries = jainaTabEntryPrompts('all', account);
    expect(entries.map((e) => e.label)).toEqual([
      'Which platform buys leads cheapest?',
      'Where should budget move?',
      "What's going wrong on any platform?",
      'Summary for the client',
    ]);
    for (const entry of entries) {
      expect(entry.prompt).toContain('across Meta, Google Ads and TikTok');
      expect(entry.prompt).toContain('"Leads MX" (objective: Lead)');
    }
  });

  it("keeps today's account questions on Meta", () => {
    expect(jainaTabEntryPrompts('meta', account)).toEqual(jainaAccountEntryPrompts(account));
  });

  it('asks what only Google can answer on Google Ads', () => {
    const entries = jainaTabEntryPrompts('google_ads', account);
    expect(entries.map((e) => e.label)).toEqual([
      'Which search terms bring leads?',
      'Is Search limited by budget?',
      'Which asset group is missing assets?',
      'Is any campaign not serving?',
    ]);
    for (const entry of entries) {
      expect(entry.prompt).toStartWith(
        `For the Google Ads account of the brand behind "act_easyfit": ${entry.label.charAt(0).toLowerCase()}${entry.label.slice(1)}`,
      );
    }
  });

  it('asks what only TikTok can answer on TikTok, and falls back to the active account', () => {
    const entries = jainaTabEntryPrompts('tiktok_ads', { ...account, accountLabel: null });
    expect(entries.map((e) => e.label)).toEqual([
      'Which video is fatiguing?',
      'Which opening loses viewers?',
      'Is any ad group stuck in learning?',
      'Which post should be a Spark Ad?',
    ]);
    for (const entry of entries) {
      expect(entry.prompt).toStartWith(
        'For the TikTok Ads account of the brand behind the active account: ',
      );
    }
  });

  it('gives every tab its own keys, unique within the tab', () => {
    for (const tab of ['all', 'meta', 'google_ads', 'tiktok_ads'] as const) {
      const keys = jainaTabEntryPrompts(tab, account).map((e) => e.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
