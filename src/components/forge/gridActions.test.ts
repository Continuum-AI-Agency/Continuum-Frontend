import { describe, expect, it, mock } from 'bun:test';
import type { ApiRenderTemplateContract, ApiRenderVariable } from '@continuum/contracts';
import {
  cellActions,
  type GridAction,
  type GridActionContext,
  rowActions,
  selectionActions,
} from '@/components/forge/gridActions';
import { MAX_BATCH_ROWS, type RequestRow } from '@/components/forge/renderRequestRows';
import type { RequestRowActions } from '@/components/forge/requestCells';

// The menu's arithmetic, without a browser: how many rows a preset would add, whether they fit,
// and whether the brief stays reachable when the presets cannot run. Driving 50 rows through a
// real Chrome to assert a subtraction is not worth what it costs.

const variable = (over: Partial<ApiRenderVariable>): ApiRenderVariable =>
  ({
    key: 'headline',
    label: 'Headline',
    kind: 'text',
    required: false,
    multiple: false,
    accept: [],
    options: [],
    description: null,
    reserved: false,
    role: null,
    roleSource: 'declared',
    charBudget: null,
    comps: [],
    sample: null,
    placement: null,
    ...over,
  }) as ApiRenderVariable;

const VARIABLES = [
  variable({}),
  variable({ key: 'accent', label: 'Accent colour', kind: 'color' }),
  variable({ key: 'hero', label: 'Hero image', kind: 'image' }),
  variable({ key: 'logo', label: 'Brand logo', kind: 'image', reserved: true }),
];

const row = (id: string, parentId: string | null = null): RequestRow => ({
  id,
  parentId,
  label: id,
  values: {},
  clearedKeys: [],
  outputIds: [],
  media: {},
  check: { state: 'idle' },
});

const context = (over: Partial<GridActionContext> = {}): GridActionContext => ({
  rows: [row('a')],
  selectedIds: [],
  contract: { variables: VARIABLES } as unknown as ApiRenderTemplateContract,
  actions: {
    generateWithAi: mock(() => {}),
    varyWithAi: mock(() => {}),
  } as unknown as RequestRowActions,
  hiddenColumns: 0,
  generating: false,
  ...over,
});

/** The "Generate with AI" action wherever it sits in a group list. */
const generateIn = (groups: GridAction[][]): GridAction =>
  groups.flat().find((action) => action.id === 'generate-ai')!;
const presetIn = (action: GridAction, count: number): GridAction =>
  action.items!.find((item) => item.id === `generate-ai-${count}`)!;
const briefIn = (action: GridAction): GridAction =>
  action.items!.find((item) => item.id === 'generate-ai-brief')!;

describe('the Generate with AI menu', () => {
  it('offers three presets and the brief beneath them', () => {
    const action = generateIn(rowActions(context(), 'a'));
    expect(action.items?.map((item) => item.label)).toEqual([
      '3 variations',
      '6 variations',
      '12 variations',
      'With a brief…',
    ]);
  });

  it('leaves pictures out of a no-typing draft', () => {
    const spy = mock((_args: { ids: string[]; count: number; varyKeys: string[] }) => {});
    const ctx = context({
      actions: { generateWithAi: spy, varyWithAi: mock(() => {}) } as unknown as RequestRowActions,
    });
    presetIn(generateIn(rowActions(ctx, 'a')), 6).run();
    // hero and the reserved logo are both absent: with no typed brief the Library search falls
    // back to a slot's own label and returns arbitrary assets that pass every downstream check.
    expect(spy.mock.calls[0]![0]).toEqual({
      ids: ['a'],
      count: 6,
      varyKeys: ['headline', 'accent'],
    });
  });

  it('disables only the presets that would not fit, each with the reason', () => {
    // 46 rows: 3 fits (49), 6 and 12 do not.
    const rows = Array.from({ length: MAX_BATCH_ROWS - 4 }, (_, index) => row(`r${index}`));
    const action = generateIn(rowActions(context({ rows }), 'r0'));
    expect(presetIn(action, 3).disabledReason).toBeNull();
    expect(presetIn(action, 6).disabledReason).toContain('at most');
    expect(presetIn(action, 12).disabledReason).toContain('at most');
    // The trigger stays open because something inside it still runs.
    expect(action.disabledReason).toBeNull();
  });

  it('counts the whole selection against the cap, not one row', () => {
    const rows = Array.from({ length: 40 }, (_, index) => row(`r${index}`));
    const ids = ['r0', 'r1', 'r2', 'r3'];
    // 4 rows x 3 each = 12, and 40 + 12 > 50.
    const action = generateIn(selectionActions(context({ rows, selectedIds: ids }), ids));
    expect(presetIn(action, 3).disabledReason).toContain('at most');
  });

  it('refuses more rows than one click should generate for', () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(`r${index}`));
    const ids = rows.slice(0, 6).map((item) => item.id);
    const action = generateIn(selectionActions(context({ rows, selectedIds: ids }), ids));
    expect(action.disabledReason).toContain('at most 5 rows');
  });

  it('says a draft is already running instead of starting a second', () => {
    const action = generateIn(rowActions(context({ generating: true }), 'a'));
    expect(action.disabledReason).toBe('A draft is already running');
    expect(briefIn(action).disabledReason).toBe('A draft is already running');
  });

  it('keeps the brief reachable on a picture cell, where the presets cannot run', () => {
    const action = generateIn([cellActions(context(), 'a', 'hero', null)]);
    expect(action.label).toBe('Vary Hero image');
    expect(presetIn(action, 3).disabledReason).toBe('Pick pictures with a brief');
    // The one that matters: a disabled trigger cannot be opened, which would hide the brief
    // behind the very reason it exists.
    expect(action.disabledReason).toBeNull();
    expect(briefIn(action).disabledReason).toBeNull();
  });

  it('varies only the key the cursor was on', () => {
    const spy = mock((_args: { ids: string[]; count: number; varyKeys: string[] }) => {});
    const ctx = context({
      actions: { generateWithAi: spy, varyWithAi: mock(() => {}) } as unknown as RequestRowActions,
    });
    const action = generateIn([cellActions(ctx, 'a', 'accent', null)]);
    expect(action.label).toBe('Vary Accent colour');
    presetIn(action, 12).run();
    expect(spy.mock.calls[0]![0]).toEqual({ ids: ['a'], count: 12, varyKeys: ['accent'] });
  });

  it('runs the first preset that can run when rendered flat, with no submenu', () => {
    // The selection bar renders actions as plain buttons and ignores `items`.
    const spy = mock((_args: { ids: string[]; count: number; varyKeys: string[] }) => {});
    const ctx = context({
      actions: { generateWithAi: spy, varyWithAi: mock(() => {}) } as unknown as RequestRowActions,
    });
    generateIn(selectionActions(ctx, ['a'])).run();
    expect(spy.mock.calls[0]![0]!.count).toBe(3);
  });
});
