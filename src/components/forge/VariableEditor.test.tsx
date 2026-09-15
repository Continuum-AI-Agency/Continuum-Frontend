/**
 * The variable editor as a list plus inspector: saved defaults (which persist on the edits, not the
 * variables) show up as the Default, and an unsaved draft survives a failed save and clears only
 * once the save has actually landed.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';

mock.module('@/components/forge/BrandColorField', () => ({
  BrandColorField: ({ label, value }: { label: string; value: string | null }) => (
    <input aria-label={label} value={value ?? ''} readOnly />
  ),
}));
mock.module('@/components/organic/primitives/MediaSelectPopover', () => ({
  MediaSelectPopover: ({ anchor }: { anchor: React.ReactNode }) => anchor,
}));

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TemplateSlotEdit, TemplateVariable } from '@/lib/library/templateSources';
import { VariableEditor } from './VariableEditor';

afterEach(cleanup);

function variable(overrides: Partial<TemplateVariable>): TemplateVariable {
  return {
    key: 'Headline',
    label: 'Headline',
    kind: 'text',
    required: false,
    multiple: false,
    accept: [],
    options: [],
    description: null,
    reserved: false,
    role: null,
    roleSource: null,
    charBudget: 24,
    comps: ['Main 1x1', 'Story 9x16'],
    sample: null,
    placement: null,
    ...overrides,
  };
}

const VARIABLES = [
  variable({ required: true }),
  variable({ key: 'Brand colour', label: 'Brand colour', kind: 'color', charBudget: null }),
];

function renderEditor(onSave: (edits: TemplateSlotEdit[]) => Promise<boolean>) {
  return render(
    <VariableEditor
      brandId="22222222-2222-4222-8222-222222222222"
      variables={VARIABLES}
      savedDefaults={{ Headline: 'Saved copy', 'Brand colour': '#ff6600' }}
      parseState="parsed"
      saving={false}
      onSave={onSave}
    />,
  );
}

describe('VariableEditor', () => {
  test('a list and an inspector, no table, with saved defaults as the Default', () => {
    const { container } = renderEditor(async () => true);
    expect(container.querySelector('table')).toBeNull();

    // Each row carries its kind's icon, and only a required variable its marker.
    const [headline, colour] = within(screen.getByRole('list', { name: 'Variables' })).getAllByRole(
      'button',
    );
    const iconOf = (row: HTMLElement) =>
      [...row.querySelectorAll('svg')].map((svg) => svg.classList.value);
    expect(iconOf(headline!)).toHaveLength(1);
    expect(iconOf(colour!)).toHaveLength(1);
    expect(iconOf(headline!)).not.toEqual(iconOf(colour!));
    expect(within(headline!).getByRole('img', { name: 'required' })).toBeTruthy();
    expect(within(colour!).queryByRole('img', { name: 'required' })).toBeNull();

    expect((screen.getByLabelText('Headline default') as HTMLInputElement).value).toBe(
      'Saved copy',
    );

    fireEvent.click(screen.getByRole('button', { name: /Brand colour/ }));
    expect((screen.getByLabelText('Brand colour default') as HTMLInputElement).value).toBe(
      '#ff6600',
    );
    expect(screen.getByText('Story 9x16')).toBeTruthy();
  });

  test('a failed save keeps the draft; a successful one clears it', async () => {
    let answer = false;
    const onSave = mock(async (_edits: TemplateSlotEdit[]) => answer);
    renderEditor(onSave);

    fireEvent.change(screen.getByLabelText('Headline default'), { target: { value: 'New copy' } });
    expect(screen.getByText('1 variable changed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toEqual([{ slotKey: 'Headline', defaultValue: 'New copy' }]);
    // Refused: the edit is still on screen and still counted.
    expect(screen.getByText('1 variable changed')).toBeTruthy();
    expect((screen.getByLabelText('Headline default') as HTMLInputElement).value).toBe('New copy');

    answer = true;
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    // A count, not `queryByText(...)).toBeNull()`: a failing poll would make bun pretty-print the
    // live element, React fiber graph and all, and that blocks the event loop for seconds.
    await waitFor(() => expect(screen.queryAllByText('1 variable changed')).toHaveLength(0));
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  test('what a save sent is settled; an edit typed while it was in flight stays a draft', async () => {
    const answers: Array<(saved: boolean) => void> = [];
    const onSave = mock(
      (_edits: TemplateSlotEdit[]) => new Promise<boolean>((resolve) => answers.push(resolve)),
    );
    renderEditor(onSave);

    fireEvent.change(screen.getByLabelText('Headline default'), { target: { value: 'New copy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    // Typed while the save is still in flight: a new field on the same slot, and another slot.
    fireEvent.change(screen.getByLabelText('Max chars'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Brand colour/ }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Accent' } });

    answers[0]!(true);
    await waitFor(() => expect(screen.getByText('2 variables changed')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    // The default already landed; sending it again would overwrite whatever the server has now.
    expect(onSave.mock.calls[1]?.[0]).toEqual([
      { slotKey: 'Headline', charBudget: 30 },
      { slotKey: 'Brand colour', publicName: 'Accent' },
    ]);
    answers[1]!(true);
    await waitFor(() => expect(screen.queryAllByText(/variables? changed/)).toHaveLength(0));
  });
});
