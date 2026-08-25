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

/** The visible rows that stand for an ACTION op, in the order cmdk ranked them. */
function visibleOpRows(): { element: Element; actionId: string; label: string }[] {
  return Array.from(document.querySelectorAll('[data-slot="command-item"][data-action-id]'))
    .filter((el) => !el.hasAttribute('hidden') && el.getAttribute('aria-disabled') !== 'true')
    .map((el) => ({
      element: el,
      actionId: el.getAttribute('data-action-id') ?? '',
      label: el.querySelector('span')?.textContent?.trim() ?? '',
    }));
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

  // Wave 4: every implemented op is its own row. Before this, the whole 32-op catalog was
  // reachable from exactly one drag-off-a-handle flow, because the palette offered the
  // op-less `action` node and nothing else.
  //
  // Ranked among the OP rows rather than globally: cmdk sorts items inside a group and then
  // re-appends the groups by their best score, and happy-dom does not reflect that second
  // move — so a global "first row" assertion here would be testing the DOM shim, not the
  // catalog. studio-node-palette-bench asserts the real browser's ranking.
  it.each([
    ['rotate', 'Rotate', 'image.rotate'],
    ['subtitles', 'Subtitles', 'video.subtitles'],
    ['extract frames', 'Extract Frames', 'video.extractFrames'],
    ['boomerang', 'Boomerang', 'video.boomerang'],
  ])(
    'finds the "%s" op and carries its actionId through',
    (query, label, actionId) => {
      const { onAdd } = renderPalette();

      search(query);
      const top = visibleOpRows()[0];
      expect(top?.actionId).toBe(actionId);
      expect(top?.label).toBe(label);

      fireEvent.click(top?.element as HTMLElement);
      expect(onAdd.mock.calls[0]).toEqual(['action', { actionId }]);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'adds the op on Enter when nothing else matches the query',
    () => {
      const { onAdd } = renderPalette();

      search('subtitles');
      expect(visibleRows()[0]).toBe('Subtitles');

      fireEvent.keyDown(input(), { key: 'Enter' });
      expect(onAdd.mock.calls[0]).toEqual(['action', { actionId: 'video.subtitles' }]);
    },
    RENDER_TIMEOUT_MS,
  );

  // Two ops contracts gave the SAME label and the SAME blurb (image.crop / video.crop).
  // cmdk keys an item by its value, so without the op id in the search value one of them
  // silently disappears from the palette.
  it(
    'keeps ops that share a label as separate rows',
    () => {
      renderPalette();

      const ids = visibleOpRows().map((row) => row.actionId);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain('image.crop');
      expect(ids).toContain('video.crop');
    },
    RENDER_TIMEOUT_MS,
  );

  // D-07. command-score scores a subsequence across label + blurb + provider, so typing a
  // node's exact name lost to an unrelated row and Enter added the wrong node. cmdk
  // highlights the first item in DOM order, so the pin is a RENDER-order pin.
  it.each([
    ['Export', 'export'],
    ['Note / Annotation', 'note'],
  ])(
    'pins the exact label "%s" above whatever the fuzzy matcher scored higher',
    (label, type) => {
      const { onAdd } = renderPalette();

      search(label);
      expect(visibleRows()[0]).toBe(label);

      fireEvent.keyDown(input(), { key: 'Enter' });
      expect(onAdd.mock.calls[0]?.[0]).toBe(type);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'pins the exact label case-insensitively, and renders it once, not twice',
    () => {
      renderPalette();

      search('eXpOrT');

      const rows = visibleRows();
      expect(rows[0]).toBe('Export');
      expect(rows.filter((row) => row === 'Export')).toHaveLength(1);
    },
    RENDER_TIMEOUT_MS,
  );

  // D-08: five ops share a label across families. An exact match on the shared label is
  // ambiguous, so BOTH pin — picking one of two different ops by score is the bug.
  it(
    'pins every op that shares an exact label, and tells them apart by family',
    () => {
      renderPalette();

      search('blur');

      const rows = visibleRows();
      expect(rows.slice(0, 2)).toEqual(['Blur', 'Blur']);

      const pinnedFamilies = Array.from(
        document.querySelectorAll(
          '[data-testid="add-node-palette-pinned"] [data-slot="command-item"]',
        ),
      ).map((el) => el.getAttribute('data-action-family'));
      expect([...pinnedFamilies].sort()).toEqual(['image', 'video']);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'shows the family next to the provider on an op row, and only on an op row',
    () => {
      renderPalette();

      const shortcutOf = (label: string): string | undefined =>
        Array.from(document.querySelectorAll('[data-slot="command-item"]'))
          .find((el) => el.querySelector('span')?.textContent?.trim() === label)
          ?.querySelector('[data-slot="command-shortcut"]')
          ?.textContent?.trim();

      expect(shortcutOf('Rotate')).toBe('Image · Continuum');
      expect(shortcutOf('Subtitles')).toBe('Video · Continuum');
      expect(shortcutOf('Text Block')).toBe('Continuum');
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
