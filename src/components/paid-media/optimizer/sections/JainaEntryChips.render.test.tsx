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
