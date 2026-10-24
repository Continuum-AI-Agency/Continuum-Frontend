/**
 * The render-set tabs on their own.
 *
 * What this guards: every set is a tab with its row count, the open one selected; the open set's
 * description and what its renders say — counted from the template's cached jobs page, never a
 * total that page cannot know — sit under the strip; a description is written in place, Enter
 * saves exactly the trimmed text and Esc sends nothing; switching and New set go through the
 * grid's discard guard; a double-click renames; many sets are one filter away. Saving, conflicts
 * and deleting through the API are the grid's, and RenderGrids.test.tsx covers them.
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { ApiRenderJob, ApiRenderJobListResponse, ForgeRenderSet } from '@continuum/contracts';

const listJobsMock = mock(async () => {
  throw new Error('the tabs must read the cached jobs page, not fetch its own');
});
const shareRenderSetMock = mock(async (_brandId: string, _setId: string) => ({
  shareLinkId: '66666666-6666-4666-8666-666666666661',
  path: '/share/tok123',
  assetCount: 4,
}));
const shareRenderSetZipMock = mock(async (_brandId: string, _setId: string) => ({
  path: '/api/ai-studio/renders/shared/teaser.zip?token=tok',
  expiresAt: '2026-10-29T00:00:00.000Z',
}));
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listJobs: listJobsMock,
    shareRenderSet: shareRenderSetMock,
    shareRenderSetZip: shareRenderSetZipMock,
  },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  screen,
  render as testingRender,
  waitFor,
  within,
} from '@testing-library/react';
import type React from 'react';
import { installPickerDomGlobals } from '@/components/automations/workspace/pickers/pickerTestHarness';
import { registerToastSink } from '@/components/ui/toast-imperative';
import { ApiError } from '@/lib/api/errors';
import { RenderSetTabs, rendersBySet, rendersLine, templateJobsKey } from './RenderSetTabs';

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
  shareRenderSetMock.mockClear();
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

describe('RenderSetTabs', () => {
  const setup = (over: Partial<React.ComponentProps<typeof RenderSetTabs>> = {}) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(
      templateJobsKey(BRAND, '133'),
      page([job(LAUNCH.id, new Date(Date.now() - 2 * 3_600_000).toISOString())]),
    );
    const props = {
      brandId: BRAND,
      templateKey: '133',
      contractHash: 'hash',
      sets: [LAUNCH, TEASER],
      activeSet: LAUNCH as ForgeRenderSet | null,
      activeRows: 6,
      dirty: false,
      confirmDiscard: mock((action: () => void) => action()),
      canCreate: true,
      draftAvailable: false,
      onSwitch: mock((_set: ForgeRenderSet) => undefined),
      onNew: mock(async (_name: string) => undefined),
      onRename: mock(async (_set: ForgeRenderSet, _name: string) => undefined),
      onDescribe: mock(async (_set: ForgeRenderSet, _description: string | null) => undefined),
      onDelete: mock(async (_set: ForgeRenderSet) => undefined),
      onDuplicate: mock((_set: ForgeRenderSet) => undefined),
      onHistory: mock((_set: ForgeRenderSet) => undefined),
      onUpdate: mock((_set: ForgeRenderSet) => undefined),
      onSettings: mock((_set: ForgeRenderSet) => undefined),
      onImportDraft: mock(() => undefined),
      ...over,
    };
    testingRender(<RenderSetTabs {...props} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    const tab = (name: string | RegExp) => screen.getByRole('tab', { name });
    return { props, tab };
  };

  test('every set is a tab with its rows; the open one is selected, and says what it is for', () => {
    const { tab } = setup();
    const launch = tab(/Launch week/);
    expect(launch.textContent).toContain('6');
    expect(launch.getAttribute('aria-selected')).toBe('true');
    expect(tab(/Teaser/).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tablist', { name: 'Render sets' })).toBeTruthy();
    // Under the strip: the open set's description and its renders.
    expect(screen.getByRole('button', { name: 'Spain first' })).toBeTruthy();
    expect(screen.getByText('1 render · 2h ago')).toBeTruthy();
    expect(listJobsMock).not.toHaveBeenCalled();
  });

  test('Enter saves the trimmed description once; Esc and an unchanged Enter send nothing', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Spain first' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Description of Launch week' }), {
      key: 'Enter',
    });
    expect(props.onDescribe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Spain first' }));
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', {
      name: 'Description of Launch week',
    });
    expect(field.maxLength).toBe(500);
    fireEvent.change(field, { target: { value: 'Draft copy' } });
    expect(screen.getByText('10/500')).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(props.onDescribe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Spain first' }));
    const again = screen.getByRole('textbox', { name: 'Description of Launch week' });
    fireEvent.change(again, { target: { value: '  Short cut\nfor stories  ' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(props.onDescribe).toHaveBeenCalledTimes(1);
    expect(props.onDescribe.mock.calls[0]).toEqual([LAUNCH, 'Short cut for stories']);
  });

  test('clearing a description saves null', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Spain first' }));
    const field = screen.getByRole('textbox', { name: 'Description of Launch week' });
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.onDescribe.mock.calls[0]).toEqual([LAUNCH, null]);
  });

  test('switching and New set ask the grid first; the open set is not reopened', () => {
    const { props, tab } = setup();
    fireEvent.click(tab(/Launch week/));
    expect(props.confirmDiscard).not.toHaveBeenCalled();
    fireEvent.click(tab(/Teaser/));
    expect(props.confirmDiscard).toHaveBeenCalledTimes(1);
    expect(props.onSwitch.mock.calls[0]).toEqual([TEASER]);
    fireEvent.click(screen.getByRole('button', { name: 'New render set' }));
    expect(props.confirmDiscard).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog', { name: 'New render set' })).toBeTruthy();
  });

  test('a double-click renames the tab in place: Enter sends the new name, Esc nothing', () => {
    const { props, tab } = setup();
    fireEvent.doubleClick(tab(/Teaser/));
    const field = screen.getByRole('textbox', { name: 'Rename Teaser' });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(props.onRename).not.toHaveBeenCalled();
    fireEvent.doubleClick(tab(/Teaser/));
    const again = screen.getByRole('textbox', { name: 'Rename Teaser' });
    fireEvent.change(again, { target: { value: 'Stories' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(props.onRename.mock.calls[0]).toEqual([TEASER, 'Stories']);
  });

  test('the open set’s menu opens its delivery settings', async () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Launch week' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Settings/ }));
    expect(props.onSettings.mock.calls[0]).toEqual([LAUNCH]);
  });

  test('All sets filters every set and opens the one picked', async () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /All sets/ }));
    const filter = await screen.findByLabelText('Filter render sets');
    fireEvent.change(filter, { target: { value: 'tea' } });
    await waitFor(() =>
      expect(screen.queryAllByRole('option', { name: /Launch week/ })).toHaveLength(0),
    );
    fireEvent.click(screen.getByRole('option', { name: /Teaser/ }));
    expect(props.onSwitch.mock.calls[0]).toEqual([TEASER]);
  });

  describe('Share render set', () => {
    // A sink per test, not a module mock: `mock.module` outlives this file in a multi-file run.
    const toasts: Array<{ title: string; variant: unknown }> = [];
    let unregister = () => {};
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = mock(async (_text: string) => undefined);
    beforeEach(() => {
      toasts.length = 0;
      unregister = registerToastSink(({ title, variant }) =>
        toasts.push({ title: String(title), variant }),
      );
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    });
    afterEach(() => {
      unregister();
      writeText.mockClear();
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
    });

    const share = async (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
      fireEvent.click(await screen.findByRole('menuitem', { name: /Share render set/ }));
    };

    test('copies the Library link for the set and says how many renders it holds', async () => {
      setup();
      await share('Launch week');
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share/tok123`),
      );
      expect(shareRenderSetMock.mock.calls[0]).toEqual([BRAND, LAUNCH.id]);
      expect(toasts.at(-1)?.title).toBe('Link copied — 4 renders, revocable from the Library');
    });

    test('a set with nothing in the Library yet says so, and copies nothing', async () => {
      shareRenderSetMock.mockImplementationOnce(async () => {
        throw new ApiError('render_set_not_in_library', 409, undefined, {
          error: 'render_set_not_in_library',
        });
      });
      setup();
      await share('Launch week');
      await waitFor(() => expect(toasts).toHaveLength(1));
      expect(toasts[0]?.title).toBe(
        'Nothing from “Launch week” is in the Library yet. Render it first, then share.',
      );
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  // UTEC 2026-09-29: 48 finished renders across a batch and its retry were packaged by a custom
  // script. The set's own menu hands over the one zip, manifest included.
  describe('Download set', () => {
    const toasts: string[] = [];
    let unregister = () => {};
    const assign = spyOn(window.location, 'assign').mockImplementation(() => {});
    beforeEach(() => {
      toasts.length = 0;
      unregister = registerToastSink(({ title }) => toasts.push(String(title)));
    });
    afterEach(() => {
      unregister();
      assign.mockClear();
      shareRenderSetZipMock.mockClear();
    });
    const download = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Actions for Launch week' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: /Download set/ }));
    };

    test('mints the set’s zip link and opens it', async () => {
      setup();
      await download();
      await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
      expect(shareRenderSetZipMock.mock.calls[0]).toEqual([BRAND, LAUNCH.id]);
      expect(String(assign.mock.calls[0]?.[0])).toEndWith(
        '/api/ai-studio/renders/shared/teaser.zip?token=tok',
      );
    });

    test('a set with nothing finished says so and downloads nothing', async () => {
      shareRenderSetZipMock.mockImplementationOnce(async () => {
        throw new ApiError('render_batch_not_ready', 409, undefined, {
          error: 'render_batch_not_ready',
        });
      });
      setup();
      await download();
      await waitFor(() =>
        expect(toasts).toEqual(['Nothing from “Launch week” has finished rendering yet.']),
      );
      expect(assign).not.toHaveBeenCalled();
    });
  });

  test('rows that are in no set read as the open, unsaved one', () => {
    setup({ activeSet: null, activeRows: 3, sets: [TEASER] });
    const unsaved = screen.getByRole('tab', { name: /Unsaved set/ });
    expect(unsaved.textContent).toContain('3');
    expect(unsaved.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Teaser/ }).getAttribute('aria-selected')).toBe('false');
  });
});
