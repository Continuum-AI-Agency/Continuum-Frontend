import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { ForgeProvenance, ForgeProvenanceResponse } from '@continuum/contracts';

// Spread over the real client: `mock.module` outlives this file, so only the read this panel makes
// is replaced.
const realApi = await import('@/StudioCanvas/nodes/api-render/apiRendersApi');
let response: ForgeProvenanceResponse = { provenance: null };
const getProvenance = mock(async (_brandId: string, _assetId: string) => response);
mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  ...realApi,
  apiRendersApi: { ...realApi.apiRendersApi, getProvenance },
}));

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ProvenancePanel } from './ProvenancePanel';

const BRAND = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
const TEMPLATE = '33333333-3333-4333-8333-333333333333';
const SET = '44444444-4444-4444-8444-444444444444';
const ROW = '55555555-5555-4555-8555-555555555555';

const PROVENANCE: ForgeProvenance = {
  assetId: ASSET,
  templateAssetId: TEMPLATE,
  templateName: 'StarCraft Promo',
  templateKey: '133',
  renderSetId: SET,
  renderSetName: 'Launch week',
  rowId: ROW,
  labelPath: ['Spain', 'Madrid'],
  format: 'story_9_16.mp4',
  renderJobId: '66666666-6666-4666-8666-666666666666',
  renderRequestId: null,
};

afterEach(() => {
  cleanup();
  getProvenance.mockClear();
  response = { provenance: null };
});

describe('ProvenancePanel', () => {
  it('names the template, set, row and format, and links back into Forge and to a re-render', async () => {
    response = { provenance: PROVENANCE };
    render(<ProvenancePanel brandId={BRAND} assetId={ASSET} />);

    const panel = await screen.findByRole('region', { name: 'Forge render' });
    expect(getProvenance).toHaveBeenCalledWith(BRAND, ASSET);
    expect(panel.textContent).toContain('TemplateStarCraft Promo');
    expect(panel.textContent).toContain('SetLaunch week');
    expect(panel.textContent).toContain('RowSpain › Madrid');
    expect(panel.textContent).toContain('Formatstory_9_16.mp4');
    expect(screen.getByRole('link', { name: /Open in Forge/ }).getAttribute('href')).toBe(
      `/forge?template=${TEMPLATE}&set=${SET}&row=${ROW}`,
    );
    expect(screen.getByRole('link', { name: /Re-render/ }).getAttribute('href')).toBe(
      `/forge?template=${TEMPLATE}&set=${SET}&row=${ROW}&rerender=1`,
    );
  });

  it('leaves out what it does not know, and offers no re-render without the row', async () => {
    response = {
      provenance: { ...PROVENANCE, renderSetId: null, renderSetName: null, rowId: null },
    };
    render(<ProvenancePanel brandId={BRAND} assetId={ASSET} />);

    const panel = await screen.findByRole('region', { name: 'Forge render' });
    expect(panel.textContent).not.toContain('Set');
    expect(screen.getByRole('link', { name: /Open in Forge/ }).getAttribute('href')).toBe(
      `/forge?template=${TEMPLATE}`,
    );
    expect(screen.queryByRole('link', { name: /Re-render/ })).toBeNull();
  });

  it('renders nothing for an asset Forge did not render', async () => {
    const { container } = render(<ProvenancePanel brandId={BRAND} assetId={ASSET} />);
    await waitFor(() => expect(getProvenance).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the read fails', async () => {
    getProvenance.mockImplementationOnce(async () => {
      throw new Error('500');
    });
    const { container } = render(<ProvenancePanel brandId={BRAND} assetId={ASSET} />);
    await waitFor(() => expect(getProvenance).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe('');
  });
});
