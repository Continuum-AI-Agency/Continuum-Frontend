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
    expect(container.textContent).not.toContain('Preguntale a Jaina');
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

  it('in a row without a frame: the label beside the caller’s field, the questions under it', () => {
    const { container } = render(
      <JainaEntryChips frame={false} layout="row" portfolio={portfolio}>
        <form data-testid="field" />
      </JainaEntryChips>,
    );
    const band = container.querySelector('[data-testid="jaina-entry-chips"]');
    expect(band?.getAttribute('data-layout')).toBe('row');
    expect(band?.className).not.toContain('border');
    expect(band?.className).not.toContain('bg-primary/10');
    const [first, second] = [...(band?.children ?? [])];
    expect(first?.textContent).toContain('Ask Jaina');
    expect(first?.querySelector('[data-testid="field"]')).toBeTruthy();
    expect(first?.querySelectorAll('a').length).toBe(0);
    expect(second?.querySelectorAll('a').length).toBe(5);
  });

  it('puts what a caller hands it inside the band, above the questions', () => {
    const { container } = render(
      <JainaEntryChips portfolio={portfolio}>
        <p data-testid="inside">la lectura</p>
      </JainaEntryChips>,
    );
    const band = container.querySelector('[data-testid="jaina-entry-chips"]');
    const inside = band?.querySelector('[data-testid="inside"]');
    const firstLink = band?.querySelector('a');
    expect(inside).toBeTruthy();
    expect(
      inside && firstLink
        ? inside.compareDocumentPosition(firstLink) & Node.DOCUMENT_POSITION_FOLLOWING
        : 0,
    ).toBeTruthy();
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

describe('JainaEntryChips (platform)', () => {
  it('carries the platform into every deep link and onto the band', () => {
    const entries = [
      { key: 'search_terms', label: 'Which search terms bring leads?', prompt: 'Q' },
    ];
    const { getByTestId } = render(
      <JainaEntryChips entries={entries} label="Ask Jaina" platform="google_ads" />,
    );
    const band = getByTestId('jaina-entry-chips');
    expect(band.getAttribute('data-platform')).toBe('google_ads');
    expect(band.querySelector('a')?.getAttribute('href')).toBe(
      '/scale?tab=jaina&platform=google_ads&prompt=Q',
    );
  });
});
