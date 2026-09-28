import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { JainaEntryChips } from './JainaEntryChips';

afterEach(cleanup);

// The band as the redesign draws it: a primary-tinted, primary-bordered row with a visible
// label and five readable ghost buttons, each a deep link into Jaina carrying the portfolio.

const portfolio = { id: 'p1', name: 'Leads MX', objective: 'lead' as const };

const mount = () => render(<JainaEntryChips portfolio={portfolio} />);

describe('JainaEntryChips', () => {
  it('draws a primary-accented band', () => {
    const { container } = mount();
    const band = container.querySelector('[data-testid="jaina-entry-chips"]');
    expect(band).toBeTruthy();
    expect(band?.className).toContain('bg-primary/10');
    expect(band?.className).toContain('border-primary');
  });

  it('labels the band "Ask Jaina" in primary', () => {
    const { container, getByText } = mount();
    const label = getByText(/Ask Jaina/);
    expect(label).toBeTruthy();
    expect(label.className).toContain('text-primary');
    expect(container.textContent).toContain('Ask Jaina');
  });

  it('offers five readable links, none in the tiny sizes', () => {
    const { container } = mount();
    const links = [...container.querySelectorAll('a')];
    expect(links.length).toBe(5);
    for (const link of links) {
      expect(link.className).toContain('text-sm');
      expect(link.className).not.toMatch(/\btext-(2|3)xs\b/);
    }
  });

  it('deep-links every question into Jaina with the portfolio named', () => {
    const { container } = mount();
    for (const link of container.querySelectorAll('a')) {
      const href = link.getAttribute('href') ?? '';
      expect(href.startsWith('/scale?tab=jaina&prompt=')).toBe(true);
      const prompt = decodeURIComponent(href.slice('/scale?tab=jaina&prompt='.length));
      expect(prompt).toContain('"Leads MX"');
    }
  });
});

// The account variant: the Overview hands the band its own label and its own entries;
// the band is otherwise the same primary-accented row.

const accountEntries = [
  {
    key: 'pause',
    label: '¿Qué pausar esta semana?',
    prompt: 'Para la cuenta "Acme": ¿qué pausar?',
  },
  { key: 'budget', label: '¿Dónde está el presupuesto?', prompt: 'Para la cuenta "Acme": ¿dónde?' },
  { key: 'summary', label: 'Resumen para el cliente', prompt: 'Para la cuenta "Acme": resumen.' },
];

const mountAccount = () =>
  render(<JainaEntryChips entries={accountEntries} label="Pregúntale a Jaina sobre esta cuenta" />);

describe('JainaEntryChips (account variant)', () => {
  it('draws the same primary-accented band under the given label', () => {
    const { container, getByText } = mountAccount();
    const band = container.querySelector('[data-testid="jaina-entry-chips"]');
    expect(band?.className).toContain('bg-primary/10');
    expect(band?.className).toContain('border-primary');
    const label = getByText(/Pregúntale a Jaina sobre esta cuenta/);
    expect(label.className).toContain('text-primary');
    expect(container.textContent).not.toContain('Ask Jaina about this portfolio');
  });

  it('renders one readable link per entry, in order', () => {
    const { container } = mountAccount();
    const links = [...container.querySelectorAll('a')];
    expect(links.map((link) => link.textContent)).toEqual(accountEntries.map((e) => e.label));
    for (const link of links) expect(link.className).toContain('text-sm');
  });

  it('deep-links each entry into Jaina with its own prompt', () => {
    const { container } = mountAccount();
    const links = [...container.querySelectorAll('a')];
    links.forEach((link, index) => {
      expect(link.getAttribute('href')).toBe(
        `/scale?tab=jaina&prompt=${encodeURIComponent(accountEntries[index].prompt)}`,
      );
    });
  });
});
