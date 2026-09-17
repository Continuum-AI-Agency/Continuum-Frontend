/**
 * "Draft rows with AI": a prompt and a count go to suggestRows, the rows are saved as a new
 * render set against the template's contract, and the Render tab is asked to open on that set. A
 * writer that is down says so in plain words instead of a status code.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const BRAND = '22222222-2222-4222-8222-222222222222';
const BINDING = '33333333-3333-4333-8333-333333333333';
const SET_ID = '44444444-4444-4444-8444-444444444444';

const listEnvironments = mock(async () => ({
  items: [
    {
      bindingId: BINDING,
      workspace: 'Continuum_app',
      environmentKey: 'prod',
      clientKey: 'starcraft_b17d81',
      isDefault: true,
      status: 'ready',
    },
  ],
}));
const listTemplates = mock(async () => ({ items: [] }));
const getContract = mock(async () => ({
  template: { key: '133', contractHash: 'hash-133' },
  outputs: [
    { id: 'square', label: 'Square', ratio: '1:1' },
    { id: 'story', label: 'Story', ratio: '9:16' },
  ],
}));
const suggestRows = mock(async (_input: unknown) => ({
  rows: [
    { label: 'Weekend deal', variables: { headline: 'Weekend deal', price: 19 } },
    { label: '', variables: { headline: 'Late night' } },
  ],
  dropped: [],
}));
const createRenderSet = mock(async (input: { rows: unknown[] }) => ({
  id: SET_ID,
  rows: input.rows,
}));

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { listEnvironments, listTemplates, getContract, suggestRows, createRenderSet },
}));
mock.module('@/components/ui/toast-imperative', () => ({
  toast: { success: () => undefined, error: () => undefined },
}));

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AiVariationsDialog } from './AiVariationsDialog';

beforeEach(() => {
  for (const fn of [listEnvironments, getContract, suggestRows, createRenderSet]) fn.mockClear();
});
afterEach(cleanup);

async function draft(prompt: string, count: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Draft rows with AI' }));
  fireEvent.change(await screen.findByLabelText('Prompt'), { target: { value: prompt } });
  fireEvent.change(screen.getByLabelText('How many'), { target: { value: count } });
  fireEvent.click(screen.getByRole('button', { name: 'Draft rows' }));
}

describe('AiVariationsDialog', () => {
  test('suggested rows become a new render set and Render opens on it', async () => {
    const onOpenRender = mock((_intent: unknown) => undefined);
    render(<AiVariationsDialog brandId={BRAND} templateKey="133" onOpenRender={onOpenRender} />);

    await draft('Two late-night offers', '2');

    await waitFor(() =>
      expect(onOpenRender).toHaveBeenCalledWith({ templateKey: '133', renderSetId: SET_ID }),
    );
    expect(suggestRows.mock.calls[0]?.[0]).toEqual({
      brandId: BRAND,
      templateKey: '133',
      contractHash: 'hash-133',
      prompt: 'Two late-night offers',
      count: 2,
    });
    const created = createRenderSet.mock.calls[0]?.[0] as unknown as {
      bindingId: string;
      name: string;
      templateKey: string;
      contractHash: string;
      rows: Array<{
        id: string;
        parentId: string | null;
        label: string;
        overrides: unknown;
        outputIds: string[];
      }>;
    };
    expect(created).toMatchObject({
      bindingId: BINDING,
      name: 'Two late-night offers',
      templateKey: '133',
      contractHash: 'hash-133',
    });
    expect(
      created.rows.map(({ parentId, label, overrides, outputIds }) => ({
        parentId,
        label,
        overrides,
        outputIds,
      })),
    ).toEqual([
      {
        parentId: null,
        label: 'Weekend deal',
        overrides: { headline: 'Weekend deal', price: 19 },
        outputIds: ['square', 'story'],
      },
      {
        parentId: null,
        label: 'Variation 2',
        overrides: { headline: 'Late night' },
        outputIds: ['square', 'story'],
      },
    ]);
    expect(created.rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('an unavailable writer is said plainly and nothing is saved', async () => {
    suggestRows.mockImplementationOnce(async () => {
      throw new Error('503 suggest_unavailable');
    });
    const onOpenRender = mock((_intent: unknown) => undefined);
    render(<AiVariationsDialog brandId={BRAND} templateKey="133" onOpenRender={onOpenRender} />);

    await draft('Anything', '3');

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The AI writer is unavailable right now',
    );
    expect(createRenderSet).not.toHaveBeenCalled();
    expect(onOpenRender).not.toHaveBeenCalled();
  });

  test('an unpublished template cannot draft', () => {
    render(<AiVariationsDialog brandId={BRAND} templateKey={null} />);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Draft rows with AI' }).disabled,
    ).toBe(true);
    expect(screen.getByText('Available once this template is published.')).toBeTruthy();
  });
});
