import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

const getContract = mock(async () => contract());
const request = mock(async () => ({ before: {}, after: {}, fired: true }));

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: { getContract },
}));
mock.module('@/lib/api/http', () => ({ http: { request } }));

const { OutputSettingsPanel } = await import('./OutputSettingsPanel');

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;

beforeEach(() => {
  getContract.mockClear();
  request.mockClear();
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

  test('an unset field shows what it inherits; a reset clears the stored override', async () => {
    render(<OutputSettingsPanel brandId="brand-1" templateKey="133" />);
    await waitFor(() => expect(select('Frame rate').value).toBe('25'));

    // The template default tab inherits the fleet default of every container it renders.
    expect(select('Sample rate').value).toBe('');
    expect(select('Sample rate').options[0]?.textContent).toBe('Inherited: 44.1 kHz / 48 kHz');

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Frame rate to inherited' }));
    expect(select('Frame rate').value).toBe('');
    expect(select('Frame rate').options[0]?.textContent).toBe('Inherited: 29.97 / 25');

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
    await waitFor(() => expect(select('Frame rate').value).toBe('25'));

    fireEvent.click(screen.getByRole('tab', { name: 'Square' }));
    await waitFor(() => expect(select('Frame rate').value).toBe(''));
    expect(select('Frame rate').options[0]?.textContent).toBe('Inherited: 25');
    expect([...select('Frame rate').options].map((option) => option.textContent)).toContain(
      'Match comp (59.94)',
    );
    expect(screen.queryByLabelText('Quality (CRF)')).not.toBeNull();
    expect(screen.queryByLabelText('ProRes profile')).toBeNull();
    expect([...select('Audio codec').options].map((option) => option.value)).toEqual(['', 'aac']);

    fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
    await waitFor(() => expect(screen.queryByLabelText('ProRes profile')).not.toBeNull());
    expect(screen.queryByLabelText('Quality (CRF)')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Poster' }));
    await waitFor(() => expect(screen.getByText('Stills take no output settings.')).toBeTruthy());
    expect(screen.queryByLabelText('Frame rate')).toBeNull();
  });
});
