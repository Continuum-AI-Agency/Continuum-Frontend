import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  chooseOption,
  installPickerDomGlobals,
  openSelect,
} from '@/components/automations/workspace/pickers/pickerTestHarness';

const contract = () => ({
  template: {
    key: '133',
    name: 'Hero',
    environment: 'Continuum_app',
    contractVersion: '1',
    contractHash: 'hash',
    contractSource: 'template_forge' as const,
    outputKinds: ['video' as const],
    variableCount: 0,
    previewUrl: null,
    updatedAt: null,
    ratios: [],
    sourceAssetId: null,
    fontsMissing: null,
  },
  variables: [],
  fonts: [],
  layout: null,
  divergence: [],
  outputs: [
    { id: 'square', label: 'Square', ratio: '1:1', mediaType: 'MP4 Video (RGB)', frameRate: 59.94 },
    { id: 'story', label: 'Story', ratio: '9:16', mediaType: 'MOV Video (RGBA)', frameRate: 25 },
    { id: 'poster', label: 'Poster', ratio: null, mediaType: 'JPG image (RGB)', frameRate: null },
  ],
  encode: {
    stored: { default: { fps: 25 } },
    defaults: {
      mp4: { fps: '30000/1001', audio: { sampleRate: 44100 } },
      mov: { fps: 25, audio: { sampleRate: 48000 } },
    },
  },
});

const DEFAULT_BINDING = '33333333-3333-4333-8333-333333333333';
const OTHER_BINDING = '44444444-4444-4444-8444-444444444444';

const getContract = mock(
  async (_brandId: string, _templateKey: string, _bindingId?: string | null) => contract(),
);
const listEnvironments = mock(async () => ({ items: [{ bindingId: DEFAULT_BINDING }] }));
const listTemplates = mock(async (_brandId: string, _bindingId?: string | null) => ({
  items: [] as Array<{ key: string }>,
}));
const request = mock(async () => ({ before: {}, after: {}, fired: true }));

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { getContract, listEnvironments, listTemplates },
}));
// `request` too: other modules import the bare function, and Bun shares this mock across a multi-file run.
mock.module('@/lib/api/http', () => ({ http: { request }, request }));

const { OutputSettingsPanel } = await import('./OutputSettingsPanel');

installPickerDomGlobals();

/** What a Select shows closed: its chosen value, or what it inherits. */
const shown = (label: string) =>
  screen.getByRole('combobox', { name: label }).querySelector('[data-slot="select-value"]')
    ?.textContent;
/** Every option a Select offers, read with it open. */
function optionsOf(label: string): string[] {
  openSelect(label);
  const list = document.getElementById(
    screen.getByRole('combobox', { name: label }).getAttribute('aria-controls') ?? '',
  );
  if (!list) throw new Error(`${label} opened no listbox`);
  const options = within(list)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');
  fireEvent.keyDown(list, { key: 'Escape' });
  return options;
}
const fileBox = (name: string) => screen.getByRole('checkbox', { name });

beforeEach(() => {
  for (const fn of [getContract, listEnvironments, listTemplates, request]) fn.mockClear();
});
afterEach(cleanup);

describe('OutputSettingsPanel', () => {
  test('a contract without output settings renders nothing', async () => {
    getContract.mockImplementationOnce(async () => ({ ...contract(), encode: undefined }) as never);
    const { container } = render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() => expect(getContract).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toBe('');
  });

  test('a contract that cannot be read renders nothing, not the raw error', async () => {
    getContract.mockImplementationOnce(async () => {
      throw new Error('template_contract_not_found');
    });
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { container } = render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
      await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
      expect(container.textContent).toBe('');
    } finally {
      warn.mockRestore();
    }
  });

  test('a template in a non-default workspace reads its contract from that workspace', async () => {
    listEnvironments.mockImplementationOnce(async () => ({
      items: [{ bindingId: DEFAULT_BINDING }, { bindingId: OTHER_BINDING }],
    }));
    listTemplates.mockImplementation(async (_brandId, bindingId) => ({
      items: bindingId === OTHER_BINDING ? [{ key: '133' }] : [],
    }));
    render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() => expect(shown('Frame rate')).toBe('25 fps'));
    expect(getContract).toHaveBeenCalledWith('brand-1', '133', OTHER_BINDING);
  });

  test('an unset field shows what it inherits; a reset clears the stored override', async () => {
    render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() => expect(shown('Frame rate')).toBe('25 fps'));

    // The template default tab inherits the fleet default of every container it renders.
    expect(shown('Sample rate')).toBe('Inherited: 44.1 kHz / 48 kHz');

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Frame rate to inherited' }));
    expect(shown('Frame rate')).toBe('Inherited: 29.97 fps / 25 fps');

    fireEvent.click(save);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]).toEqual([
      {
        path: '/api/ai-studio/templates/133/encode',
        method: 'PUT',
        body: { brandId: 'brand-1', encode: {} },
      },
    ]);
    await waitFor(() => expect(getContract).toHaveBeenCalledTimes(2));
  });

  test('each output shows only the knobs its container uses, inheriting the template default', async () => {
    render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() => expect(shown('Frame rate')).toBe('25 fps'));

    fireEvent.click(screen.getByRole('tab', { name: 'Square' }));
    await waitFor(() => expect(shown('Frame rate')).toBe('Inherited: 25 fps'));
    expect(optionsOf('Frame rate')).toEqual([
      'Inherited: 25 fps',
      'Match the comp (59.94 fps)',
      '23.976 fps',
      '24 fps',
      '25 fps',
      '29.97 fps',
      '30 fps',
      '50 fps',
      '59.94 fps',
      '60 fps',
    ]);
    expect(screen.queryByRole('combobox', { name: 'Quality (CRF)' })).not.toBeNull();
    expect(screen.queryByRole('combobox', { name: 'ProRes profile' })).toBeNull();
    expect(optionsOf('Audio codec')).toEqual(['Fleet default', 'aac']);

    fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'ProRes profile' })).not.toBeNull(),
    );
    expect(screen.queryByRole('combobox', { name: 'Quality (CRF)' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Poster' }));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Stills take no output settings. Frame rate and files apply to animated formats.',
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole('combobox', { name: 'Frame rate' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'MXF (DNxHR)' })).toBeNull();
  });

  test('a frame rate off the standard list stays visible and chosen', async () => {
    getContract.mockImplementationOnce(async () => ({
      ...contract(),
      encode: { ...contract().encode, stored: { default: { fps: '2997/125' } } },
    }));
    render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() => expect(shown('Frame rate')).toBe('23.976 fps'));
    expect(optionsOf('Frame rate')).toHaveLength(11);
  });

  test('choosing a frame rate stores it as the rate the fleet reads', async () => {
    render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() => expect(shown('Frame rate')).toBe('25 fps'));
    openSelect('Frame rate');
    chooseOption('29.97 fps');
    await waitFor(() => expect(shown('Frame rate')).toBe('29.97 fps'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]).toEqual([
      {
        path: '/api/ai-studio/templates/133/encode',
        method: 'PUT',
        body: { brandId: 'brand-1', encode: { default: { fps: '30000/1001' } } },
      },
    ]);
  });

  test('files: the own container is on; each file shows its own knobs; the last file stays on', async () => {
    render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() => expect(shown('Frame rate')).toBe('25 fps'));
    fireEvent.click(screen.getByRole('tab', { name: 'Square' }));
    await waitFor(() => expect(fileBox('MP4').getAttribute('aria-checked')).toBe('true'));
    expect(fileBox('MOV (ProRes)').getAttribute('aria-checked')).toBe('false');
    expect(fileBox('MXF (DNxHR)').getAttribute('aria-checked')).toBe('false');
    // The one file this MP4 output makes cannot be turned off, and the panel says why.
    expect(fileBox('MP4').hasAttribute('data-disabled')).toBe(true);
    expect(screen.getByText('MP4 stays on: every render delivers at least one file.')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'ProRes profile' })).toBeNull();

    // MOV on: its ProRes profile and PCM audio appear, and MP4 may now go.
    fireEvent.click(screen.getByText('MOV (ProRes)'));
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'ProRes profile' })).not.toBeNull(),
    );
    expect(fileBox('MP4').hasAttribute('data-disabled')).toBe(false);
    expect(optionsOf('Audio codec')).toEqual(['Fleet default', 'aac', 'pcm_s16le', 'pcm_s24le']);

    // MP4 off: CRF leaves with it. MOV is now the last file.
    fireEvent.click(screen.getByText('MP4'));
    await waitFor(() =>
      expect(screen.queryByRole('combobox', { name: 'Quality (CRF)' })).toBeNull(),
    );
    expect(fileBox('MOV (ProRes)').hasAttribute('data-disabled')).toBe(true);

    // MP4 back on is the template's own state again, so it is unset rather than stored.
    fireEvent.click(screen.getByText('MXF (DNxHR)'));
    fireEvent.click(screen.getByText('MP4'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]).toEqual([
      {
        path: '/api/ai-studio/templates/133/encode',
        method: 'PUT',
        body: {
          brandId: 'brand-1',
          encode: {
            default: { fps: 25 },
            outputs: { square: { files: { mov: true, mxf: true } } },
          },
        },
      },
    ]);
  });

  test('an output style sets every file at once; a hand-made mix reads as custom', async () => {
    render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() => expect(shown('Frame rate')).toBe('25 fps'));
    fireEvent.click(screen.getByRole('tab', { name: 'Square' }));
    await waitFor(() => expect(shown('Output style')).toBe('Web'));

    openSelect('Output style');
    chooseOption(/^Broadcast/);
    await waitFor(() => expect(shown('Output style')).toBe('Broadcast'));
    expect(fileBox('MXF (DNxHR)').getAttribute('aria-checked')).toBe('true');
    expect(fileBox('MOV (ProRes)').getAttribute('aria-checked')).toBe('false');
    expect(fileBox('MP4').getAttribute('aria-checked')).toBe('true');

    // A GIF on top is no style any more; the toggles stay the way to a custom mix.
    fireEvent.click(screen.getByText('GIF (loop)'));
    await waitFor(() => expect(shown('Output style')).toBe('Custom mix'));

    // Leaves the scope already inherits stay unset: MP4 is this output's own file.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]).toEqual([
      {
        path: '/api/ai-studio/templates/133/encode',
        method: 'PUT',
        body: {
          brandId: 'brand-1',
          encode: {
            default: { fps: 25 },
            outputs: { square: { files: { mxf: true, gif: true } } },
          },
        },
      },
    ]);
  });

  test('on outputs with different own files, a style pins the files both must make', async () => {
    render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() => expect(shown('Frame rate')).toBe('25 fps'));
    // Square makes an MP4 and Story a MOV: no one style names both.
    expect(shown('Output style')).toBe('Custom mix');

    openSelect('Output style');
    chooseOption(/^Edit master/);
    await waitFor(() => expect(shown('Output style')).toBe('Edit master'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]).toEqual([
      {
        path: '/api/ai-studio/templates/133/encode',
        method: 'PUT',
        body: {
          brandId: 'brand-1',
          encode: { default: { fps: 25, files: { mp4: true, mov: true } } },
        },
      },
    ]);
  });

  test('a stills-only template says settings apply to animated formats, and nothing else', async () => {
    getContract.mockImplementationOnce(async () => ({
      ...contract(),
      outputs: [contract().outputs[2]!],
    }));
    const { container } = render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() =>
      expect(container.textContent).toBe(
        'Stills take no output settings. Frame rate and files apply to animated formats.',
      ),
    );
    expect(screen.queryByRole('tab')).toBeNull();
  });

  test('a template with no named outputs is stills-only when its comp runs one frame', async () => {
    getContract.mockImplementationOnce(async () => ({
      ...contract(),
      template: { ...contract().template, motion: { durationSec: 1 / 25, frameRate: 25 } },
      outputs: [],
      encode: undefined,
    }));
    const { container } = render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() =>
      expect(container.textContent).toBe(
        'Stills take no output settings. Frame rate and files apply to animated formats.',
      ),
    );
  });
});
