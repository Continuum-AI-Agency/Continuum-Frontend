/**
 * The AI draft in the Render tab: a brief, how many rows and how many variations of each go to
 * suggestRows, and the answer is handed to the grid — which shows the rows as proposed. Varying one
 * row sends that row and only the keys ticked. A writer that is down says so in plain words. On a
 * template, the button only opens Render with the draft asked for.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const BRAND = '22222222-2222-4222-8222-222222222222';
const PARENT = '44444444-4444-4444-8444-444444444444';

const ANSWER = {
  rows: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      parentId: null,
      label: 'Weekend deal',
      overrides: { headline: 'Weekend deal', price: 19 },
    },
  ],
  assets: [],
  dropped: [],
  unfilled: [],
};
const suggestRows = mock(async (_input: unknown): Promise<unknown> => ANSWER);

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { suggestRows },
}));

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { installPickerDomGlobals } from '@/components/automations/workspace/pickers/pickerTestHarness';
import { AiDraftDialog, DraftWithAiButton } from './AiVariationsDialog';

// Base UI waits on a MutationObserver as a popup or dialog animates; happy-dom's, lifted per file
// (a global shim in the shared setup drops other files' tests).
installPickerDomGlobals();

const variable = (key: string, label: string, kind: string) => ({
  key,
  label,
  kind,
  required: false,
  multiple: false,
  accept: [],
  options: [],
  description: null,
  reserved: false,
  role: null,
  roleSource: null,
  charBudget: null,
  comps: [],
  sample: null,
  placement: null,
});

const CONTRACT = {
  template: { key: '133', contractHash: 'hash-133' },
  variables: [
    variable('headline', 'Headline', 'text'),
    variable('price', 'Price', 'number'),
    { ...variable('logo', 'Logo', 'image'), reserved: true },
  ],
  outputs: [],
} as never;

beforeEach(() => suggestRows.mockClear());
afterEach(cleanup);

const brief = (text: string) =>
  fireEvent.change(screen.getByLabelText('Brief'), { target: { value: text } });

describe('AiDraftDialog', () => {
  test('new rows: the brief, the row count and variations of each reach the writer; the answer goes to the grid', async () => {
    const onDrafted = mock((_response: unknown) => undefined);
    const onOpenChange = mock((_open: boolean) => undefined);
    render(
      <AiDraftDialog
        open
        onOpenChange={onOpenChange}
        brandId={BRAND}
        bindingId={null}
        contract={CONTRACT}
        parent={null}
        onDrafted={onDrafted}
      />,
    );
    brief('Two late-night offers');
    fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Variations of each'), { target: { value: '9' } });
    // Four rows with four variations each is the twenty one draft may return.
    expect(screen.getByText('20 rows in all')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));

    await waitFor(() => expect(onDrafted).toHaveBeenCalledWith(ANSWER));
    expect(suggestRows.mock.calls[0]?.[0]).toEqual({
      brandId: BRAND,
      templateKey: '133',
      contractHash: 'hash-133',
      prompt: 'Two late-night offers',
      count: 4,
      forksPerRow: 4,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('variations of one row send the row and only the keys ticked', async () => {
    render(
      <AiDraftDialog
        open
        onOpenChange={() => undefined}
        brandId={BRAND}
        bindingId={null}
        contract={CONTRACT}
        parent={{ id: PARENT, label: 'Base', values: { headline: 'Hola', price: 10 } }}
        onDrafted={() => undefined}
      />,
    );
    expect(screen.queryByLabelText('Logo')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Price' }));
    brief('Punchier');
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    await waitFor(() => expect(suggestRows).toHaveBeenCalledTimes(1));
    expect(suggestRows.mock.calls[0]?.[0]).toMatchObject({
      count: 3,
      forksPerRow: 0,
      varyKeys: ['headline'],
      parent: { id: PARENT, label: 'Base', values: { headline: 'Hola', price: 10 } },
    });
  });

  test('an unavailable writer is said plainly and nothing reaches the grid', async () => {
    suggestRows.mockImplementationOnce(async () => {
      throw new Error('503 suggest_unavailable');
    });
    const onDrafted = mock((_response: unknown) => undefined);
    render(
      <AiDraftDialog
        open
        onOpenChange={() => undefined}
        brandId={BRAND}
        bindingId={null}
        contract={CONTRACT}
        parent={null}
        onDrafted={onDrafted}
      />,
    );
    brief('Anything');
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The AI writer is unavailable right now',
    );
    expect(onDrafted).not.toHaveBeenCalled();
  });

  test('nothing usable says why, with what could not be filled', async () => {
    suggestRows.mockImplementationOnce(async () => ({
      ...ANSWER,
      rows: [],
      unfilled: ['Hero: no Library picture matched the brief'],
    }));
    render(
      <AiDraftDialog
        open
        onOpenChange={() => undefined}
        brandId={BRAND}
        bindingId={null}
        contract={CONTRACT}
        parent={null}
        onDrafted={() => undefined}
      />,
    );
    brief('Anything');
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Hero: no Library picture matched the brief',
    );
  });
});

describe('DraftWithAiButton', () => {
  test('opens Render with the draft asked for; an unpublished template cannot', () => {
    const onOpenRender = mock((_intent: unknown) => undefined);
    const { rerender } = render(
      <DraftWithAiButton templateKey="133" onOpenRender={onOpenRender} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Draft rows with AI' }));
    expect(onOpenRender).toHaveBeenCalledWith({ templateKey: '133', draftWithAi: true });

    rerender(<DraftWithAiButton templateKey={null} onOpenRender={onOpenRender} />);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Draft rows with AI' }).disabled,
    ).toBe(true);
    expect(screen.getByText('Available once this template is published.')).toBeTruthy();
  });
});
