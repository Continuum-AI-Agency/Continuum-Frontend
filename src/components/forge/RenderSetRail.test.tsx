/**
 * The render-sets rail on its own.
 *
 * What this guards: every set is on screen with its row count and what its renders say — counted
 * from the template's cached jobs page, never a total that page cannot know; the open set is
 * marked; a description is written in place, Enter saves exactly the trimmed text and Esc sends
 * nothing; switching and New set go through the grid's discard guard; the rail folds to a strip
 * that still names the open set. Saving, conflicts and deleting through the API are the grid's,
 * and RenderGrids.test.tsx covers them.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { ApiRenderJob, ApiRenderJobListResponse, ForgeRenderSet } from '@continuum/contracts';

const listJobsMock = mock(async () => {
  throw new Error('the rail must read the cached jobs page, not fetch its own');
});
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { listJobs: listJobsMock },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  screen,
  render as testingRender,
  within,
} from '@testing-library/react';
import type React from 'react';
import { installPickerDomGlobals } from '@/components/automations/workspace/pickers/pickerTestHarness';
import { RenderSetRail, rendersBySet, rendersLine, templateJobsKey } from './RenderSetRail';

// Base UI waits on a MutationObserver as a popup or dialog animates; happy-dom's, lifted per file
// (a global shim in the shared setup drops other files' tests).
installPickerDomGlobals();

const BRAND = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-09-15T12:00:00.000Z');

const set = (id: string, name: string, rows: number, description: string | null = null) =>
  ({
    id,
    brandId: BRAND,
    bindingId: '44444444-4444-4444-8444-444444444444',
    name,
    description,
    templateKey: '133',
    contractHash: 'hash',
    revision: 1,
    rows: Array.from({ length: rows }, (_, index) => ({
      id: `${id.slice(0, -2)}${String(index).padStart(2, '0')}`,
      parentId: null,
      label: `Row ${index}`,
      overrides: {},
      clearedKeys: [],
      outputIds: [],
    })),
    createdAt: '2026-09-10T09:00:00.000Z',
    updatedAt: '2026-09-10T09:00:00.000Z',
  }) as ForgeRenderSet;

const LAUNCH = set('55555555-5555-4555-8555-555555555551', 'Launch week', 6, 'Spain first');
const TEASER = set('55555555-5555-4555-8555-555555555552', 'Teaser', 1);

const job = (renderSetId: string | null, createdAt: string, templateKey = '133') =>
  ({ id: crypto.randomUUID(), templateKey, renderSetId, createdAt }) as ApiRenderJob;

const page = (items: ApiRenderJob[], nextCursor: string | null = null) =>
  ({ items, nextCursor }) as ApiRenderJobListResponse;

afterEach(() => {
  cleanup();
  listJobsMock.mockClear();
});

describe('rendersBySet / rendersLine', () => {
  test('counts each set’s renders and keeps its newest, ignoring other templates and loose jobs', () => {
    const { bySet, complete } = rendersBySet(
      page([
        job(LAUNCH.id, '2026-09-15T03:00:00.000Z'),
        job(LAUNCH.id, '2026-09-15T09:00:00.000Z'),
        job(LAUNCH.id, '2026-09-14T09:00:00.000Z'),
        job(TEASER.id, '2026-09-15T11:00:00.000Z', 'another-template'),
        job(null, '2026-09-15T11:30:00.000Z'),
      ]),
      '133',
    );
    expect(complete).toBe(true);
    expect(bySet.get(LAUNCH.id)).toEqual({ count: 3, lastAt: '2026-09-15T09:00:00.000Z' });
    expect(bySet.has(TEASER.id)).toBe(false);
    expect(rendersLine(bySet.get(LAUNCH.id), complete, NOW)).toBe('3 renders · 3h ago');
    expect(rendersLine({ count: 1, lastAt: '2026-09-15T11:00:00.000Z' }, true, NOW)).toBe(
      '1 render · 1h ago',
    );
    expect(rendersLine(undefined, true, NOW)).toBe('No renders yet');
  });

  test('a page with more behind it never claims a total or an absence', () => {
    const { bySet, complete } = rendersBySet(
      page([job(LAUNCH.id, '2026-09-15T09:00:00.000Z')], 'cursor'),
      '133',
    );
    expect(complete).toBe(false);
    expect(rendersLine(bySet.get(LAUNCH.id), complete, NOW)).toBe('1 recent render · 3h ago');
    expect(rendersLine(bySet.get(TEASER.id), complete, NOW)).toBe('No recent renders');
  });
});

describe('RenderSetRail', () => {
  const setup = (over: Partial<React.ComponentProps<typeof RenderSetRail>> = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(
      templateJobsKey(BRAND, '133'),
      page([job(LAUNCH.id, new Date(Date.now() - 2 * 3_600_000).toISOString())]),
    );
    const props = {
      brandId: BRAND,
      templateKey: '133',
      sets: [LAUNCH, TEASER],
      activeSet: LAUNCH,
      activeRows: 6,
      confirmDiscard: mock((action: () => void) => action()),
      canCreate: true,
      draftAvailable: false,
      collapsed: false,
      onCollapsedChange: mock((_collapsed: boolean) => undefined),
      onSwitch: mock((_set: ForgeRenderSet) => undefined),
      onNew: mock(async (_name: string) => undefined),
      onRename: mock(async (_set: ForgeRenderSet, _name: string) => undefined),
      onDescribe: mock(async (_set: ForgeRenderSet, _description: string | null) => undefined),
      onDelete: mock(async (_set: ForgeRenderSet) => undefined),
      onImportDraft: mock(() => undefined),
      ...over,
    };
    testingRender(<RenderSetRail {...props} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    const item = (name: string) =>
      within(screen.getByRole('list', { name: 'Render sets' }))
        .getAllByRole('listitem')
        .find((entry) => within(entry).queryByRole('button', { name: `Open ${name}` }))!;
    return { props, item };
  };

  test('lists every set with its rows, description and renders, and marks the open one', () => {
    const { item } = setup();
    const launch = item('Launch week');
    expect(within(launch).getByText('6 rows')).toBeTruthy();
    expect(within(launch).getByRole('button', { name: 'Spain first' })).toBeTruthy();
    expect(within(launch).getByText('1 render · 2h ago')).toBeTruthy();
    expect(
      within(launch).getByRole('button', { name: 'Open Launch week' }).getAttribute('aria-current'),
    ).toBe('true');

    const teaser = item('Teaser');
    expect(within(teaser).getByText('1 row')).toBeTruthy();
    expect(within(teaser).getByRole('button', { name: 'Add a description' })).toBeTruthy();
    expect(within(teaser).getByText('No renders yet')).toBeTruthy();
    expect(
      within(teaser).getByRole('button', { name: 'Open Teaser' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(listJobsMock).not.toHaveBeenCalled();
  });

  test('Enter saves the trimmed description once; Esc and an unchanged Enter send nothing', () => {
    const { props, item } = setup();
    const teaser = item('Teaser');
    fireEvent.click(within(teaser).getByRole('button', { name: 'Add a description' }));
    const field = within(teaser).getByRole<HTMLTextAreaElement>('textbox', {
      name: 'Description of Teaser',
    });
    expect(field.maxLength).toBe(500);
    fireEvent.change(field, { target: { value: 'Draft copy' } });
    expect(within(teaser).getByText('10/500')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(within(teaser).queryAllByRole('textbox')).toHaveLength(0);
    expect(props.onDescribe).not.toHaveBeenCalled();

    const launch = item('Launch week');
    fireEvent.click(within(launch).getByRole('button', { name: 'Spain first' }));
    fireEvent.keyDown(within(launch).getByRole('textbox'), { key: 'Enter' });
    expect(props.onDescribe).not.toHaveBeenCalled();

    fireEvent.click(within(teaser).getByRole('button', { name: 'Add a description' }));
    const again = within(teaser).getByRole('textbox');
    fireEvent.change(again, { target: { value: '  Short cut\nfor stories  ' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(props.onDescribe).toHaveBeenCalledTimes(1);
    expect(props.onDescribe.mock.calls[0]).toEqual([TEASER, 'Short cut for stories']);
  });

  test('clearing a description saves null', () => {
    const { props, item } = setup();
    const launch = item('Launch week');
    fireEvent.click(within(launch).getByRole('button', { name: 'Spain first' }));
    const field = within(launch).getByRole('textbox');
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.onDescribe.mock.calls[0]).toEqual([LAUNCH, null]);
  });

  test('switching and New set ask the grid first; the open set is not reopened', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Open Launch week' }));
    expect(props.confirmDiscard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open Teaser' }));
    expect(props.confirmDiscard).toHaveBeenCalledTimes(1);
    expect(props.onSwitch.mock.calls[0]).toEqual([TEASER]);
    fireEvent.click(screen.getByRole('button', { name: 'New set' }));
    expect(props.confirmDiscard).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog', { name: 'New render set' })).toBeTruthy();
  });

  test('the name text opens its set; the description and menu keep their own clicks', () => {
    const { props, item } = setup();
    const teaser = item('Teaser');
    fireEvent.click(within(teaser).getByRole('button', { name: 'Add a description' }));
    fireEvent.click(within(teaser).getByRole('button', { name: 'Actions for Teaser' }));
    expect(props.confirmDiscard).not.toHaveBeenCalled();
    expect(within(teaser).getByRole('textbox', { name: 'Description of Teaser' })).toBeTruthy();

    fireEvent.click(within(teaser).getByText('Teaser'));
    expect(props.confirmDiscard).toHaveBeenCalledTimes(1);
    expect(props.onSwitch.mock.calls[0]).toEqual([TEASER]);
  });

  test('rows that are in no set read as the open, unsaved one', () => {
    setup({ activeSet: null, activeRows: 3, sets: [TEASER] });
    const unsaved = within(screen.getByRole('list', { name: 'Render sets' })).getAllByRole(
      'listitem',
    )[0]!;
    expect(within(unsaved).getByText('Unsaved set')).toBeTruthy();
    expect(within(unsaved).getByText('3 rows')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Open Teaser' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  test('folds to a strip that still names the open set, and unfolds', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Hide render sets' }));
    expect(props.onCollapsedChange.mock.calls[0]).toEqual([true]);
    cleanup();

    const folded = setup({ collapsed: true });
    expect(screen.queryAllByRole('list', { name: 'Render sets' })).toHaveLength(0);
    expect(screen.getByText('Launch week')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show render sets' }));
    expect(folded.props.onCollapsedChange.mock.calls[0]).toEqual([false]);
  });
});
