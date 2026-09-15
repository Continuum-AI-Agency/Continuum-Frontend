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

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  variable({}),
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
    await waitFor(() => expect(screen.queryByText('1 variable changed')).toBeNull());
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});
