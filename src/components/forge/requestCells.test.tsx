import { afterEach, describe, expect, test } from 'bun:test';
import type {
  ApiRenderFitVerdict,
  ApiRenderTemplateContract,
  ApiRenderVariable,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CellContext } from '@tanstack/react-table';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installPickerDomGlobals } from '@/components/automations/workspace/pickers/pickerTestHarness';
import { type RequestRow, seedRow } from '@/components/forge/renderRequestRows';
import {
  type RequestGridMeta,
  type RequestRowActions,
  StatusCell,
  VariableCell,
} from '@/components/forge/requestCells';

installPickerDomGlobals();
afterEach(cleanup);

const variable = (over: Partial<ApiRenderVariable>): ApiRenderVariable =>
  ({
    key: 'headline',
    label: 'Headline',
    kind: 'text',
    required: true,
    multiple: false,
    accept: [],
    options: [],
    description: null,
    reserved: false,
    sample: 'TU PRIMER MES',
    defaultValue: null,
    charBudget: null,
    placement: null,
    clip: null,
    sourceSlotKey: null,
    ...over,
  }) as ApiRenderVariable;

/** Every action the cell calls, by name — the grid's part is only to record them here. */
function recordActions() {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const actions = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args: unknown[]) =>
          calls.push({ name: String(name), args }),
    },
  ) as RequestRowActions;
  return { calls, actions };
}

function renderCell(item: ApiRenderVariable, row: RequestRow, actions: RequestRowActions) {
  const meta: RequestGridMeta = {
    brandId: '22222222-2222-4222-8222-222222222222',
    contract: { variables: [item], layout: null } as unknown as ApiRenderTemplateContract,
    rows: [row],
    clientErrors: new Map(),
    actions,
    selectedIds: [],
    hiddenColumns: 0,
    generating: false,
    liveFit: new Map(),
  };
  const context = {
    row: { original: row },
    column: { columnDef: { meta: { variable: item } } },
    table: { options: { meta } },
  } as unknown as CellContext<RequestRow, unknown>;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <VariableCell {...context} />
    </QueryClientProvider>,
  );
}

describe('text values beyond the template sample', () => {
  test.each([
    ['Draw Bet', '4.10', 3],
    ['Draw Bet', '3.65', 3],
    ['Left Team', 'Alianza Atlético', 12],
    ['Right Team', 'Deportivo Garcilaso', 12],
  ] as const)('%s keeps %s without presenting a character limit', (label, value, charBudget) => {
    const field = variable({ label, charBudget });
    const row = { ...seedRow([field], 'Base'), values: { headline: value } };
    const { actions, calls } = recordActions();
    const { container } = renderCell(field, row, actions);
    const input = screen.getByRole('textbox', { name: label }) as HTMLInputElement;

    expect(input.value).toBe(value);
    expect(input.hasAttribute('maxlength')).toBe(false);
    expect(container.textContent).not.toContain(`${value.length}/${charBudget}`);
    fireEvent.change(input, { target: { value: `${value}0` } });
    expect(calls).toContainEqual({ name: 'setValue', args: [row.id, 'headline', `${value}0`] });
  });
});

describe('defaults read apart from typed input', () => {
  test('the artboard copy a row was seeded with is muted and tagged; typed text is not', () => {
    const headline = variable({});
    const { actions } = recordActions();
    renderCell(headline, seedRow([headline], 'Base'), actions);
    expect(screen.getByLabelText('Headline').classList.contains('text-muted-foreground')).toBe(
      true,
    );
    expect(screen.getByText('Default').title).toBe('From the design — type to replace');
    cleanup();

    renderCell(headline, { ...seedRow([headline], 'Base'), values: { headline: 'Mío' } }, actions);
    expect(screen.getByLabelText('Headline').classList.contains('text-muted-foreground')).toBe(
      false,
    );
    expect(screen.queryByText('Default')).toBeNull();
  });

  test('a root row resets typed text to the artboard copy, or to nothing over a saved default', () => {
    const headline = variable({});
    const { calls, actions } = recordActions();
    const typed = { ...seedRow([headline], 'Base'), values: { headline: 'Mío' } };
    renderCell(headline, typed, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Headline to default' }));
    expect(calls).toEqual([{ name: 'setValue', args: [typed.id, 'headline', 'TU PRIMER MES'] }]);
    cleanup();

    calls.length = 0;
    renderCell(variable({ defaultValue: 'GO FAST' }), typed, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Headline to default' }));
    expect(calls).toEqual([{ name: 'setValue', args: [typed.id, 'headline', undefined] }]);
    cleanup();

    // Nothing to reset while the cell already holds the default.
    renderCell(headline, seedRow([headline], 'Base'), actions);
    expect(screen.queryByRole('button', { name: 'Reset Headline to default' })).toBeNull();
  });

  test('an empty media slot with a saved Library default says Default, not Choose', () => {
    const { actions } = recordActions();
    const hero = variable({ key: 'hero', label: 'Hero', kind: 'image', sample: null });
    const row = seedRow([], 'Base');
    renderCell(
      { ...hero, defaultValue: { assetId: '77777777-7777-4777-8777-777777777777' } },
      row,
      actions,
    );
    expect(screen.getByRole('button', { name: 'Choose Hero' }).textContent).toBe('Default');
    cleanup();

    renderCell(hero, row, actions);
    expect(screen.getByRole('button', { name: 'Choose Hero' }).textContent).toBe('Choose');
  });

  test('an unset switch shows the saved default it renders, tagged', () => {
    const { actions } = recordActions();
    const badge = variable({
      key: 'show_badge',
      label: 'Show Badge',
      kind: 'boolean',
      required: false,
      sample: 'false',
      defaultValue: true,
      sourceSlotKey: 'boolean__show-badge',
    });
    renderCell(badge, seedRow([badge], 'Base'), actions);
    expect(screen.getByText('Shown')).toBeTruthy();
    expect(screen.getByText('Default').title).toBe(
      'The template’s saved default — switch to replace',
    );
  });
});

// The status reads the Live kit's fit (`useLiveFit`) and the row's own errors; nothing is fetched.
describe('the status column, with no preflight', () => {
  const hero = variable({ key: 'hero', label: 'Hero', kind: 'image', required: false });
  const renderStatus = (
    verdicts: Array<Partial<ApiRenderFitVerdict>>,
    errors: Record<string, string> = {},
  ) => {
    const row = seedRow([], 'Base');
    const meta = {
      brandId: '22222222-2222-4222-8222-222222222222',
      contract: { variables: [hero], layout: null } as unknown as ApiRenderTemplateContract,
      rows: [row],
      clientErrors: new Map([[row.id, errors]]),
      actions: recordActions().actions,
      selectedIds: [],
      hiddenColumns: 0,
      generating: false,
      liveFit: new Map([
        [
          row.id,
          new Map(
            verdicts.map((verdict) => [
              'hero',
              {
                key: 'hero',
                subject: 'media',
                unknownReason: null,
                ...verdict,
              } as ApiRenderFitVerdict,
            ]),
          ),
        ],
      ]),
    } satisfies RequestGridMeta;
    const context = {
      row: { original: row },
      table: { options: { meta } },
    } as unknown as CellContext<RequestRow, unknown>;
    return render(<StatusCell {...context} />);
  };
  const hover = (text: string) => {
    const trigger = screen.getByText(text).closest('button')!;
    fireEvent.mouseEnter(trigger);
    fireEvent.focus(trigger);
  };

  test('a fit that lands reads Ready', () => {
    renderStatus([{ state: 'ok', why: 'lands inside the canvas' }]);
    expect(screen.getByText('Ready')).toBeTruthy();
  });

  test('a wrong value reads Invalid, and says which field', async () => {
    renderStatus([], { hero: 'One item only' });
    hover('Invalid');
    expect(await screen.findByText('Hero: One item only')).toBeTruthy();
  });

  test('a frame placement cannot settle reads "AI check after render", and says why', async () => {
    renderStatus([{ state: 'unknown', unknownReason: 'rigged', why: 'placed by a rig' }]);
    expect(screen.queryAllByText('Needs judge')).toHaveLength(0);
    hover('AI check after render');
    expect(
      await screen.findByText(
        'An AI model checks the finished frame after it renders, because where an image lands couldn’t be measured.',
      ),
    ).toBeTruthy();
  });

  test('a slot a re-parse would make measurable reads "Needs review", and the hover says what to do', async () => {
    renderStatus([
      {
        state: 'unknown',
        unknownReason: 'unplaced',
        why: 'this template has no measured placement for the slot',
      },
    ]);
    hover('Needs review');
    expect(await screen.findByText(/Re-parse the template to check it\.$/)).toBeTruthy();
  });
});
