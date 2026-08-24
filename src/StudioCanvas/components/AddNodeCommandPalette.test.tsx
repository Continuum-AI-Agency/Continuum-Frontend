// cmdk needs `window.SyntaxError` (it constructs one while parsing its own value keys) and
// happy-dom does not put it on `window`. Same shim as command.filter.test.tsx.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AddNodeCommandPalette } from './AddNodeCommandPalette';
import { ADD_NODE_GROUPS } from './addNodeCatalog';

afterEach(cleanup);

// happy-dom renders ~26 cmdk rows plus a Base UI positioner; the first one in a run pays
// the module warmup, and this machine runs several benches at once.
const RENDER_TIMEOUT_MS = 30_000;

function renderPalette() {
  const onAdd = mock(() => {});
  const onDismiss = mock(() => {});
  const view = render(
    <AddNodeCommandPalette
      screenPosition={{ x: 120, y: 90 }}
      onAdd={onAdd}
      onDismiss={onDismiss}
    />,
  );
  return { ...view, onAdd, onDismiss };
}

const input = (): HTMLElement => screen.getByPlaceholderText('Search nodes…');

function search(query: string) {
  fireEvent.change(input(), { target: { value: query } });
}

/** The rows cmdk left visible, in the order it ranked them. */
function visibleRows(): string[] {
  return Array.from(document.querySelectorAll('[data-slot="command-item"]'))
    .filter((el) => !el.hasAttribute('hidden') && el.getAttribute('aria-disabled') !== 'true')
    .map((el) => el.querySelector('span')?.textContent?.trim() ?? '');
}

describe('AddNodeCommandPalette', () => {
  it(
    'renders every catalog row, under a heading per category',
    () => {
      renderPalette();

      const headings = Array.from(document.querySelectorAll('[cmdk-group-heading]')).map(
        (el) => el.textContent?.trim() ?? '',
      );
      expect(headings).toEqual(ADD_NODE_GROUPS.map((section) => section.label));

      expect(visibleRows()).toEqual(
        ADD_NODE_GROUPS.flatMap((section) => section.rows.map((row) => row.label)),
      );
    },
    RENDER_TIMEOUT_MS,
  );

  // The reason this stays on cmdk rather than Base UI Combobox: command-score matches and
  // RANKS subsequences, so a half-remembered name still lands on the right row.
  it(
    'ranks a subsequence query, not just a substring',
    () => {
      renderPalette();

      search('hypfrm');

      expect(visibleRows()[0]).toBe('HyperFrames Agent');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'finds a node by its blurb as well as its name',
    () => {
      renderPalette();

      search('free-text canvas');

      expect(visibleRows()).toContain('Note / Annotation');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'adds the highlighted row on Enter',
    () => {
      const { onAdd } = renderPalette();

      search('continuity frame');
      fireEvent.keyDown(input(), { key: 'Enter' });

      expect(onAdd).toHaveBeenCalledTimes(1);
      expect(onAdd.mock.calls[0]).toEqual(['frameExtract', undefined]);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'carries the model through when a video-model row is chosen',
    () => {
      const { onAdd } = renderPalette();

      search('pixverse');
      fireEvent.keyDown(input(), { key: 'Enter' });

      expect(onAdd.mock.calls[0]).toEqual(['videoGen', { model: 'pixverse-v6' }]);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'adds the row that is clicked',
    () => {
      const { onAdd } = renderPalette();

      fireEvent.click(screen.getAllByText('Text Block')[0]);

      expect(onAdd.mock.calls[0]).toEqual(['string', undefined]);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'says so when nothing matches',
    () => {
      renderPalette();

      search('zzzzzzzz');

      expect(visibleRows()).toEqual([]);
      expect(screen.getByText('No node matches that search.')).toBeDefined();
    },
    RENDER_TIMEOUT_MS,
  );
});
