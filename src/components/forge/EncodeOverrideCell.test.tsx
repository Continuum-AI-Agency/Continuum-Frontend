import { afterEach, expect, test } from 'bun:test';
import type { ApiRenderTemplateContract } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import {
  chooseOption,
  installPickerDomGlobals,
  openSelect,
} from '@/components/automations/workspace/pickers/pickerTestHarness';
import { EncodeOverrideCell } from '@/components/forge/EncodeOverrideCell';
import type { RequestRow } from '@/components/forge/renderRequestRows';

installPickerDomGlobals();
afterEach(cleanup);

const OUTPUTS: ApiRenderTemplateContract['outputs'] = [
  { id: 'square', label: 'Square', ratio: '1:1', mediaType: 'MP4 Video (RGB)', frameRate: 30 },
  { id: 'story', label: 'Story', ratio: '9:16', mediaType: 'MP4 Video (RGB)', frameRate: 30 },
];

const ROOT: RequestRow = {
  id: 'root',
  parentId: null,
  label: 'Root',
  values: {},
  clearedKeys: [],
  outputIds: [],
  media: {},
  check: { state: 'idle' },
};

/** The grid's part: it owns the rows and applies each patch the cell sends. */
function Harness({ outputs, seen }: { outputs: typeof OUTPUTS; seen: RequestRow[] }) {
  const [rows, setRows] = useState([ROOT]);
  seen.splice(0, seen.length, ...rows);
  return (
    <EncodeOverrideCell
      row={rows[0]!}
      rows={rows}
      outputs={outputs}
      onChange={(patch) => setRows((current) => [{ ...current[0]!, ...patch }])}
    />
  );
}

const cell = () => screen.getByRole('button', { name: /^Output settings: / });

test('the closed cell reads the row summary; 25 fps and MXF land on the row', async () => {
  const seen: RequestRow[] = [];
  render(<Harness outputs={OUTPUTS} seen={seen} />);
  expect(cell().textContent).toBe('Template default');

  fireEvent.click(cell());
  openSelect('Frame rate');
  chooseOption('25 fps');
  await waitFor(() => expect(cell().textContent).toBe('25 fps'));
  fireEvent.click(screen.getByText('MXF (DNxHR)'));
  await waitFor(() => expect(cell().textContent).toBe('25 fps · MP4 + MXF'));
  expect(seen[0]?.encode).toEqual({ default: { fps: 25, files: { mxf: true } } });

  // Unticking MXF again is the template's own state: the key goes, nothing is left behind.
  fireEvent.click(screen.getByText('MXF (DNxHR)'));
  await waitFor(() => expect(cell().textContent).toBe('25 fps'));
  expect(seen[0]?.encode).toEqual({ default: { fps: 25 } });
});

test('a style swaps the whole file set on the row in one change', async () => {
  const seen: RequestRow[] = [];
  render(<Harness outputs={OUTPUTS} seen={seen} />);
  fireEvent.click(cell());
  openSelect('Output style');
  chooseOption(/^Social loop/);
  await waitFor(() => expect(cell().textContent).toBe('MP4 + GIF'));
  expect(seen[0]?.encode).toEqual({ default: { files: { gif: true } } });

  // GIF off and MOV on land together: the row is Edit master, not a GIF-and-MOV mix.
  openSelect('Output style');
  chooseOption(/^Edit master/);
  await waitFor(() => expect(cell().textContent).toBe('MP4 + MOV'));
  expect(seen[0]?.encode).toEqual({ default: { files: { mov: true } } });
});

test('the scope is a Select of the formats; settings without a summary still read as custom', async () => {
  const seen: RequestRow[] = [];
  render(<Harness outputs={OUTPUTS} seen={seen} />);
  fireEvent.click(cell());
  openSelect('Output settings scope');
  chooseOption('Story · 9:16');
  await waitFor(() =>
    expect(
      screen
        .getByRole('combobox', { name: 'Output settings scope' })
        .querySelector('[data-slot="select-value"]')?.textContent,
    ).toBe('Story · 9:16'),
  );
  openSelect('Sample rate');
  chooseOption('48 kHz');
  await waitFor(() => expect(cell().textContent).toBe('1 output adjusted'));
  expect(seen[0]?.encode).toEqual({ outputs: { story: { audio: { sampleRate: 48000 } } } });
  expect(document.querySelectorAll('select')).toHaveLength(0);
});

test('a stills-only template explains itself instead of offering knobs', () => {
  render(
    <Harness
      outputs={[{ id: 'poster', label: 'Poster', ratio: '1:1', mediaType: 'JPG image (RGB)' }]}
      seen={[]}
    />,
  );
  expect(cell().textContent).toBe('Template default');
  fireEvent.click(cell());
  expect(
    screen.getByText(
      'Stills take no output settings. Frame rate and files apply to animated formats.',
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: 'Frame rate' })).toBeNull();
});
