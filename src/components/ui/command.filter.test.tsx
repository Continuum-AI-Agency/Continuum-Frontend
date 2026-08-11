import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';

afterEach(cleanup);

// The command palette's search must match ABBREVIATIONS, not just substrings — typing
// "pdopt" has to find "Paid Optimization". cmdk's command-score does subsequence matching
// and RANKS the results; Base UI's Combobox filters with an Intl.Collator substring match
// that returns nothing for these queries and carries no ranking at all.
//
// This is why the palette stays on cmdk (see Continuum-Frontend/AGENTS.md), and why
// shadcn's own base-nova `command` component is itself cmdk-backed. If someone swaps the
// primitive again, every case below goes to "No results" and this file says so.
//
// CommandPalette.test.tsx cannot catch it: that suite stubs these primitives out to keep
// happy-dom off the portal, so the real filter never runs there.

const LABELS = [
  'Organic Agent',
  'Organic Analytics',
  'Paid Analytics',
  'Paid Optimization',
  'Brand Spy',
  'Automations',
  'Calendar',
  'Library',
];

function renderPalette() {
  return render(
    <Command>
      <CommandInput placeholder="Search" />
      <CommandList>
        <CommandEmpty>No results</CommandEmpty>
        <CommandGroup heading="Navigate">
          {LABELS.map((label) => (
            <CommandItem key={label} value={label}>
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>,
  );
}

function search(query: string) {
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: query } });
}

/** The labels cmdk left visible, in the order it ranked them. */
function visibleLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="command-item"]'))
    .filter((el) => !el.hasAttribute('hidden') && el.getAttribute('aria-disabled') !== 'true')
    .map((el) => el.textContent?.trim() ?? '');
}

describe('the palette matches abbreviations, not just substrings', () => {
  it('finds a two-word command from its initials', () => {
    const { container } = renderPalette();
    search('pdopt');
    expect(visibleLabels(container)).toContain('Paid Optimization');
  });

  it('finds a command from a vowel-dropped abbreviation', () => {
    const { container } = renderPalette();
    search('brsp');
    expect(visibleLabels(container)).toContain('Brand Spy');
  });

  it('finds a command from a leading subsequence', () => {
    const { container } = renderPalette();
    search('autom');
    expect(visibleLabels(container)).toContain('Automations');
  });

  it('keeps a plain substring query working', () => {
    const { container } = renderPalette();
    search('analytics');
    const visible = visibleLabels(container);
    expect(visible).toContain('Organic Analytics');
    expect(visible).toContain('Paid Analytics');
  });

  // Matching without ranking is the other half of the regression: an unranked filter leaves
  // the closest hit buried, so assert the best match comes FIRST, not merely that it appears.
  it('ranks the closest match first', () => {
    const { container } = renderPalette();
    search('organic a');
    expect(visibleLabels(container)[0]).toBe('Organic Agent');
  });

  it('still reports no results for a genuine miss', () => {
    const { container } = renderPalette();
    search('zzzzqq');
    expect(visibleLabels(container)).toHaveLength(0);
    expect(screen.getByText('No results')).toBeTruthy();
  });
});
