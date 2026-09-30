/**
 * The variable editor as one row per variable that opens in place: saved defaults (which persist on the edits, not the
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
const uploadMediaAsset = mock(async () => ({ assetId: 'asset-1', versionId: 'version-1' }));
const mediaUpload = { ...(await import('@/lib/library/uploadMediaAsset')) };
mock.module('@/lib/library/uploadMediaAsset', () => ({ ...mediaUpload, uploadMediaAsset }));

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TemplateSlotEdit, TemplateVariable } from '@/lib/library/templateSources';
import { VariableEditor } from './VariableEditor';

afterEach(() => {
  cleanup();
  uploadMediaAsset.mockClear();
});

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
  test('a missing image default accepts a file dropped on its own row', async () => {
    const onSave = mock(async (_edits: TemplateSlotEdit[]) => true);
    render(
      <VariableEditor
        brandId="22222222-2222-4222-8222-222222222222"
        variables={[variable({ key: 'Hero', label: 'Hero', kind: 'image', charBudget: null })]}
        savedDefaults={{}}
        parseState="parsed"
        saving={false}
        onSave={onSave}
      />,
    );
    const target = screen.getByRole('group', { name: 'Default image for Hero' });
    const file = new File(['image'], 'hero.png', { type: 'image/png' });
    const dataTransfer = { types: ['Files'], files: [file] };
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() =>
      expect(uploadMediaAsset).toHaveBeenCalledWith({
        file,
        brandId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith([
        { slotKey: 'Hero', defaultValue: { assetId: 'asset-1', versionId: 'version-1' } },
      ]),
    );
  });

  test('one row per variable, no table, with saved defaults as the Default', () => {
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

  test('a label that is still the layer name reads as words; the Name field keeps what is stored', () => {
    render(
      <VariableEditor
        brandId="22222222-2222-4222-8222-222222222222"
        variables={[variable({ key: 'ref_price_text', label: 'ref_price_text' })]}
        savedDefaults={{}}
        parseState="parsed"
        saving={false}
        onSave={async () => true}
      />,
    );
    const row = within(screen.getByRole('list', { name: 'Variables' })).getByRole('button');
    expect(within(row).getByText('Price text')).toBeTruthy();
    expect(screen.getByLabelText('Price text default')).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('ref_price_text');
  });

  test('a failed save keeps the draft; a successful one clears it', async () => {
    let answer = false;
    const onSave = mock(async (_edits: TemplateSlotEdit[]) => answer);
    renderEditor(onSave);

    fireEvent.change(screen.getByLabelText('Headline default'), { target: { value: 'New copy' } });
    expect(screen.getByText('1 changed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toEqual([{ slotKey: 'Headline', defaultValue: 'New copy' }]);
    // Refused: the edit is still on screen and still counted.
    expect(screen.getByText('1 changed')).toBeTruthy();
    expect((screen.getByLabelText('Headline default') as HTMLInputElement).value).toBe('New copy');

    answer = true;
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    // A count, not `queryByText(...)).toBeNull()`: a failing poll would make bun pretty-print the
    // live element, React fiber graph and all, and that blocks the event loop for seconds.
    await waitFor(() => expect(screen.queryAllByText('1 changed')).toHaveLength(0));
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  test('a field not asked reads Not asked, cannot be required, and asking for it is a saved edit', async () => {
    const onSave = mock(async (_edits: TemplateSlotEdit[]) => true);
    render(
      <VariableEditor
        brandId="22222222-2222-4222-8222-222222222222"
        variables={[
          variable({
            key: 'image__rosa',
            label: 'ROSA',
            kind: 'image',
            charBudget: null,
            exposed: false,
          }),
        ]}
        savedDefaults={{}}
        parseState="parsed"
        saving={false}
        onSave={onSave}
      />,
    );
    expect(
      within(screen.getByRole('list', { name: 'Variables' })).getByText('Not asked'),
    ).toBeTruthy();
    expect(screen.getByText('Every row renders what the file has')).toBeTruthy();
    const ask = screen.getByRole('switch', { name: 'Ask per row' });
    expect(ask.getAttribute('aria-checked')).toBe('false');
    const required = screen.getByRole('switch', { name: 'Required' });
    expect(
      required.getAttribute('aria-disabled') ?? required.getAttribute('data-disabled'),
    ).not.toBeNull();

    fireEvent.click(ask);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toEqual([{ slotKey: 'image__rosa', exposed: true }]);
  });

  // Two on/off ideas share one control shape: whether a row is ASKED (above) and whether a layer
  // is SHOWN. A layer switch says Shown/Hidden and what hiding does; any other checkbox On/Off.
  test('a layer switch default reads Shown or Hidden and says what hiding does', async () => {
    render(
      <VariableEditor
        brandId="22222222-2222-4222-8222-222222222222"
        variables={[
          variable({
            key: 'boolean__show-carrera',
            label: 'Show Carrera',
            kind: 'boolean',
            charBudget: null,
          }),
          variable({
            key: 'boolean__dark-mode',
            label: 'Dark mode',
            kind: 'boolean',
            charBudget: null,
          }),
        ]}
        savedDefaults={{ 'boolean__show-carrera': true, 'boolean__dark-mode': false }}
        parseState="parsed"
        saving={false}
        onSave={mock(async () => true)}
      />,
    );
    const list = within(screen.getByRole('list', { name: 'Variables' }));
    expect(list.getAllByText('Shown').length).toBeGreaterThan(0);
    expect(list.getAllByText('Off').length).toBeGreaterThan(0);
    expect(list.queryAllByText('Hidden')).toHaveLength(0);
    // The first variable opens by default.
    expect(await screen.findByText(/Hidden makes this layer invisible in the render/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Show Carrera default' }));
    await waitFor(() => expect(screen.getAllByText('Hidden').length).toBeGreaterThan(0));
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
    await waitFor(() => expect(screen.getByText('2 changed')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    // The default already landed; sending it again would overwrite whatever the server has now.
    expect(onSave.mock.calls[1]?.[0]).toEqual([
      { slotKey: 'Headline', charBudget: 30 },
      { slotKey: 'Brand colour', publicName: 'Accent' },
    ]);
    answers[1]!(true);
    await waitFor(() => expect(screen.queryAllByText(/^\d+ changed$/)).toHaveLength(0));
  });

  test('filters narrow the rows; a meaning claimed twice is counted in the footer and blocks the save', async () => {
    render(
      <VariableEditor
        brandId="22222222-2222-4222-8222-222222222222"
        variables={[
          variable({ role: 'headline' }),
          variable({ key: 'Subhead', label: 'Subhead', role: 'headline' }),
          variable({ key: 'Hero', label: 'Hero', kind: 'image', charBudget: null }),
        ]}
        savedDefaults={{}}
        parseState="parsed"
        saving={false}
        onSave={async () => true}
      />,
    );
    const rows = () =>
      within(screen.getByRole('list', { name: 'Variables' }))
        .getAllByRole('listitem')
        .map((row) => row.querySelector('button span')?.textContent);
    expect(rows()).toHaveLength(3);
    expect(screen.getByText('1 meaning clash')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Media' }));
    await waitFor(() => expect(screen.getAllByText('1 of 3')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Unassigned' }));
    await waitFor(() => expect(screen.getAllByText('1 of 3')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    await waitFor(() => expect(screen.getAllByText('2 of 3')).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Headline default'), { target: { value: 'Copy' } });
    expect(screen.getByText('1 changed')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
