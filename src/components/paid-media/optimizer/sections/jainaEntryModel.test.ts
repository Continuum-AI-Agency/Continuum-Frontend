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
      '¿Por qué Leads MX está caro?',
      '¿Qué pausar esta semana?',
      '¿Cómo va Ventas CDMX?',
      '¿Dónde está el presupuesto?',
      'Resumen para el cliente',
    ]);
  });

  it('offers four when nothing is over target, asking about risks instead of a silent portfolio', () => {
    expect(quiet.map((e) => e.key)).toEqual(['pause', 'risks', 'budget', 'summary']);
    expect(quiet[1].label).toBe('¿Qué está por salir mal?');
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
      expect(entry.prompt).toContain('la cuenta "Acme MX"');
      expect(entry.prompt).toContain('"Leads MX" (objetivo: Lead)');
      expect(entry.prompt).toContain('"Ventas CDMX" (objetivo: Purchase)');
    }
  });

  it('opens each prompt with the question its label asks', () => {
    expect(full[0].prompt).toContain('¿por qué "Leads MX" está caro?');
    expect(full[2].prompt).toContain('¿cómo va "Ventas CDMX"?');
    expect(quiet[1].prompt).toContain('¿qué está por salir mal?');
    expect(quiet[3].prompt).toContain('escribe un resumen para el cliente');
  });

  it('falls back to the active account when no label is known', () => {
    const anonymous = jainaAccountEntryPrompts({
      accountLabel: null,
      portfolios: [],
      worstOverTarget: null,
      noResults: null,
    });
    expect(anonymous[0].prompt).toContain('la cuenta activa');
    expect(anonymous[0].prompt).toContain('ninguno activo');
  });
});
