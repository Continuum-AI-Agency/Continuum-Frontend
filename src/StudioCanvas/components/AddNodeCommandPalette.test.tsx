// cmdk needs `window.SyntaxError` (it constructs one while parsing its own value keys) and
// happy-dom does not put it on `window`. Same shim as command.filter.test.tsx.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { AddNodeCommandPalette } from './AddNodeCommandPalette';
import { ADD_NODE_GROUPS, sectionLayout } from './addNodeCatalog';

afterEach(cleanup);

// happy-dom renders ~26 cmdk rows plus a Base UI positioner; the first one in a run pays
// the module warmup, and this machine runs several benches at once.
const RENDER_TIMEOUT_MS = 30_000;

// The palette is a submenu, so it needs an open menu around it. The submenu itself opens
// on hover in the browser; here Enter on its trigger is the deterministic way in.
function renderPalette() {
  const onAdd = mock(() => {});
  const onOpenChange = mock(() => {});
  const view = render(
    <ContextMenu open>
      <ContextMenuTrigger>canvas</ContextMenuTrigger>
      <ContextMenuContent>
        <AddNodeCommandPalette onAdd={onAdd} onOpenChange={onOpenChange} />
      </ContextMenuContent>
    </ContextMenu>,
  );
  fireEvent.keyDown(screen.getByText('Add Node'), { key: 'Enter' });
  return { ...view, onAdd, onOpenChange };
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

/** The category submenu triggers inside the palette, by label. */
function categoryTriggers(): string[] {
  return Array.from(
    document.querySelectorAll(
      '[data-testid="add-node-palette"] [data-slot="context-menu-sub-trigger"]',
    ),
  ).map((el) => el.textContent?.trim() ?? '');
}

/** Open one category submenu with Enter on its trigger and return its (portalled) popup. */
function openCategory(label: string, group: string): Element {
  fireEvent.keyDown(screen.getByText(label), { key: 'Enter' });
  const popup = document.querySelector(
    `[data-testid="add-node-category"][data-category="${group}"]`,
  );
  if (!popup) throw new Error(`no ${group} category popup`);
  return popup;
}

/** Open one nested sub-group (provider or family) from an open category popup. */
function openSubGroup(popup: Element, group: string, key: string): Element {
  const trigger = popup.querySelector(
    `[data-slot="context-menu-sub-trigger"][data-subgroup="${key}"]`,
  );
  if (!trigger) throw new Error(`no ${key} sub-trigger in ${group}`);
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const sub = document.querySelector(
    `[data-testid="add-node-subgroup"][data-category="${group}"][data-subgroup="${key}"]`,
  );
  if (!sub) throw new Error(`no ${group}/${key} sub-group popup`);
  return sub;
}

/** The row labels a (portalled) popup renders directly — nested popups do not leak in. */
const labelsIn = (popup: Element): (string | undefined)[] =>
  Array.from(popup.querySelectorAll('[data-slot="context-menu-item"] span:first-child')).map(
    (el) => el.textContent?.trim(),
  );

const subTriggerLabels = (popup: Element): (string | undefined)[] =>
  Array.from(popup.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).map((el) =>
    el.textContent?.trim(),
  );

const sectionFor = (group: string) => {
  const section = ADD_NODE_GROUPS.find((candidate) => candidate.group === group);
  if (!section) throw new Error(`no ${group} section`);
  return section;
};

describe('AddNodeCommandPalette', () => {
  it(
    'opens as a submenu with the search box and one category submenu per catalog group',
    () => {
      const { onOpenChange } = renderPalette();

      expect(onOpenChange).toHaveBeenCalledWith(true);
      expect(screen.getByTestId('add-node-palette')).toBeDefined();
      expect(input()).toBeDefined();
      expect(categoryTriggers()).toEqual(ADD_NODE_GROUPS.map((section) => section.label));
      // No query, no list: the categories ARE the browse surface.
      expect(document.querySelector('[data-slot="command-list"]')).toBeNull();
      expect(visibleRows()).toEqual([]);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'swaps the categories for the ranked list while there is a query, and back when cleared',
    () => {
      renderPalette();

      search('hyp');
      expect(categoryTriggers()).toEqual([]);
      expect(document.querySelector('[data-slot="command-list"]')).not.toBeNull();
      expect(visibleRows().length).toBeGreaterThan(0);

      search('');
      expect(document.querySelector('[data-slot="command-list"]')).toBeNull();
      expect(categoryTriggers()).toEqual(ADD_NODE_GROUPS.map((section) => section.label));
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'groups the ranked list under the catalog categories, one heading each',
    () => {
      renderPalette();

      // Every Continuum-run row answers this — a query, because with none there is no list.
      search('continuum');

      const headings = Array.from(document.querySelectorAll('[cmdk-group-heading]')).map(
        (el) => el.textContent?.trim() ?? '',
      );
      const labels = ADD_NODE_GROUPS.map((section) => section.label);
      expect(headings.length).toBeGreaterThan(0);
      expect(new Set(headings).size).toBe(headings.length);
      expect(headings.every((heading) => labels.includes(heading))).toBe(true);
      expect(visibleRows()).toContain('Text Block');
      expect(visibleRows()).toContain('Rotate');
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'lists every catalog row inside its category submenu, descending nested sub-groups',
    () => {
      const { onAdd } = renderPalette();

      for (const section of ADD_NODE_GROUPS) {
        const layout = sectionLayout(section);
        const popup = openCategory(section.label, section.group);

        expect(labelsIn(popup)).toEqual(layout.direct.map((row) => row.label));
        expect(subTriggerLabels(popup)).toEqual(layout.subGroups.map((sub) => sub.label));

        for (const sub of layout.subGroups) {
          const subPopup = openSubGroup(popup, section.group, sub.key);
          expect(labelsIn(subPopup)).toEqual(sub.rows.map((row) => row.label));
          expect(subTriggerLabels(subPopup)).toEqual(
            (sub.subGroups ?? []).map((opGroup) => opGroup.label),
          );
          for (const opGroup of sub.subGroups ?? []) {
            const groupPopup = openSubGroup(subPopup, section.group, opGroup.key);
            expect(labelsIn(groupPopup)).toEqual(opGroup.rows.map((row) => row.label));
          }
        }
      }

      // Opening each next sub-group closes its sibling, so re-open the chain rotate
      // lives in: Action -> Image family -> Transform group.
      const imageFamily = openSubGroup(openCategory('Action', 'action'), 'action', 'image');
      const transform = openSubGroup(imageFamily, 'action', 'image:transform');
      const rotate = transform.querySelector(
        '[data-slot="context-menu-item"][data-action-id="image.rotate"]',
      );
      expect(rotate?.getAttribute('data-action-family')).toBe('image');
      fireEvent.click(rotate as HTMLElement);
      expect(onAdd.mock.calls[0]).toEqual(['action', { actionId: 'image.rotate' }]);
    },
    RENDER_TIMEOUT_MS,
  );

  // Ask 1: a category whose rows span providers nests one more level, in provider order.
  it(
    'nests the Video category by provider, and a provider-nested row adds with its model',
    () => {
      const { onAdd } = renderPalette();
      const layout = sectionLayout(sectionFor('video'));
      const fal = layout.subGroups.find((sub) => sub.key === 'fal');
      if (!fal) throw new Error('no fal sub-group');

      const popup = openCategory('Video', 'video');
      expect(labelsIn(popup)).toEqual([]);
      expect(subTriggerLabels(popup)).toEqual(['Google', 'Fal', 'Continuum']);

      const falPopup = openSubGroup(popup, 'video', 'fal');
      expect(labelsIn(falPopup)).toEqual(fal.rows.map((row) => row.label));

      const firstRow = fal.rows[0];
      fireEvent.click(
        falPopup.querySelector('[data-slot="context-menu-item"]') as HTMLElement,
      );
      expect(onAdd.mock.calls[0]).toEqual(['videoGen', { model: firstRow.model }]);
    },
    RENDER_TIMEOUT_MS,
  );

  // The Action category is fully nested: Tools / Implementation for the utilities, one
  // submenu per op family, and a multi-group family nests once more by registry group.
  it(
    'nests the Action utilities under Tools and Implementation, and their rows still add',
    () => {
      const { onAdd } = renderPalette();

      const popup = openCategory('Action', 'action');
      expect(labelsIn(popup)).toEqual([]);
      expect(subTriggerLabels(popup)).toEqual([
        'Tools',
        'Implementation',
        'Image',
        'Video',
        'Text',
      ]);

      const tools = openSubGroup(popup, 'action', 'tools');
      expect(labelsIn(tools)).toEqual(['Batch', 'Router', 'Export', 'Continuity Frame']);
      fireEvent.click(tools.querySelectorAll('[data-slot="context-menu-item"]')[1] as HTMLElement);
      expect(onAdd.mock.calls[0]).toEqual(['router', undefined]);

      // The click closed the Add Node submenu; re-enter before the next descent.
      fireEvent.keyDown(screen.getByText('Add Node'), { key: 'Enter' });
      const implementation = openSubGroup(openCategory('Action', 'action'), 'action', 'implementation');
      expect(labelsIn(implementation)).toEqual([
        'Planner Draft',
        'Post to Platform',
        'Paid Ad',
        'API Render',
      ]);
      fireEvent.click(
        implementation.querySelector('[data-slot="context-menu-item"]') as HTMLElement,
      );
      expect(onAdd.mock.calls[1]).toEqual(['plannerDraft', undefined]);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'nests a multi-group family by op group, and a group-nested op still adds',
    () => {
      const { onAdd } = renderPalette();
      const layout = sectionLayout(sectionFor('action'));
      const videoFamily = layout.subGroups.find((sub) => sub.key === 'video');
      if (!videoFamily?.subGroups) throw new Error('video family is not group-nested');

      const popup = openCategory('Action', 'action');
      const videoOps = openSubGroup(popup, 'action', 'video');
      expect(labelsIn(videoOps)).toEqual([]);
      expect(subTriggerLabels(videoOps)).toEqual(videoFamily.subGroups.map((g) => g.label));

      const overlay = openSubGroup(videoOps, 'action', 'video:overlay');
      const subtitles = overlay.querySelector('[data-action-id="video.subtitles"]');
      expect(subtitles).not.toBeNull();
      fireEvent.click(subtitles as HTMLElement);
      expect(onAdd.mock.calls[0]).toEqual(['action', { actionId: 'video.subtitles' }]);

      // Single-group Text family stays flat: its three ops render directly. The click
      // above closed the Add Node submenu, so re-enter first.
      fireEvent.keyDown(screen.getByText('Add Node'), { key: 'Enter' });
      const text = openSubGroup(openCategory('Action', 'action'), 'action', 'text');
      expect(subTriggerLabels(text)).toEqual([]);
      expect(labelsIn(text)).toEqual(['Find & Replace', 'Join Text', 'Split Text']);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    'gives every trigger and row a leading icon, in both modes',
    () => {
      renderPalette();

      const triggers = Array.from(
        document.querySelectorAll(
          '[data-testid="add-node-palette"] [data-slot="context-menu-sub-trigger"]',
        ),
      );
      expect(triggers.length).toBe(ADD_NODE_GROUPS.length);
      for (const trigger of triggers) {
        expect(trigger.querySelector('svg'), trigger.textContent ?? '').not.toBeNull();
      }

      const popup = openCategory('Action', 'action');
      const entries = Array.from(
        popup.querySelectorAll('[data-slot="context-menu-item"], [data-slot="context-menu-sub-trigger"]'),
      );
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.querySelector('svg'), entry.textContent ?? '').not.toBeNull();
      }
      const videoOps = openSubGroup(popup, 'action', 'video');
      for (const el of videoOps.querySelectorAll(
        '[data-slot="context-menu-item"], [data-slot="context-menu-sub-trigger"]',
      )) {
        expect(el.querySelector('svg'), el.textContent ?? '').not.toBeNull();
      }
      const timeOps = openSubGroup(videoOps, 'action', 'video:time');
      for (const row of timeOps.querySelectorAll('[data-slot="context-menu-item"]')) {
        expect(row.querySelector('svg'), row.textContent ?? '').not.toBeNull();
      }

      search('continuum');
      const items = Array.from(document.querySelectorAll('[data-slot="command-item"]')).filter(
        (el) => !el.hasAttribute('hidden'),
      );
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.querySelector('svg'), item.textContent ?? '').not.toBeNull();
      }
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

      search('text block');
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

      search('crop');
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

      search('continuum');

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
