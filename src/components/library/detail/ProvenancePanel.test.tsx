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

// The canvas half reads media.assets / asset_lineage / asset_versions with the viewer's
// browser client. A tiny in-memory PostgREST: filters are applied for real, so a row
// for another brand or another asset cannot leak into what the panel shows.
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
const readsByTable: Record<string, number> = {};
function fakeQuery(table: string) {
  readsByTable[table] = (readsByTable[table] ?? 0) + 1;
  const filters: Array<(row: Row) => boolean> = [];
  const rows = () => (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)));
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    not: (column: string, operator: string, value: unknown) => {
      if (column !== 'parameters->>roomId' || operator !== 'is' || value !== null) {
        throw new Error(`unexpected filter ${column} ${operator}`);
      }
      filters.push((row) => (row.parameters as Row | null)?.roomId != null);
      return builder;
    },
    order: async () => ({ data: rows(), error: null }),
    in: async (column: string, values: unknown[]) => ({
      data: rows().filter((row) => values.includes(row[column])),
      error: null,
    }),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
  };
  return builder;
}
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    schema: (schema: string) => {
      if (schema !== 'media') throw new Error(`unexpected schema ${schema}`);
      return { from: fakeQuery };
    },
  }),
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
  tables = {};
  for (const table of Object.keys(readsByTable)) delete readsByTable[table];
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

describe('ProvenancePanel — canvas origin', () => {
  const ROOM = '77777777-7777-4777-8777-777777777777';
  const OTHER_ROOM = '88888888-8888-4888-8888-888888888888';
  const V3 = '99999999-9999-4999-8999-999999999999';

  const asset = (originRef: Row | null, brandId = BRAND) => ({
    id: ASSET,
    brand_id: brandId,
    origin_ref: originRef,
  });

  it('links an asset made in the canvas back to its room and node', async () => {
    tables = { assets: [asset({ kind: 'canvas', roomId: ROOM, nodeId: 'gen-1' })] };
    render(<ProvenancePanel brandId={BRAND} assetId={ASSET} />);

    const section = await screen.findByTestId('library-canvas-origin');
    expect(section.textContent).toContain('Made in canvas');
    expect(screen.getByRole('link', { name: /Open room/ }).getAttribute('href')).toBe(
      `/ai-studio?roomId=${ROOM}&focusNodeId=gen-1`,
    );
    // No lineage rows means no version lookup.
    expect(readsByTable.asset_versions).toBeUndefined();
    expect(screen.queryByRole('region', { name: 'Forge render' })).toBeNull();
  });

  it('names a canvas revision with its version and links the node it came from', async () => {
    tables = {
      assets: [asset({ kind: 'upload' })],
      asset_lineage: [
        {
          brand_id: BRAND,
          derived_asset_id: ASSET,
          derived_version_id: V3,
          operation: 'canvas_revision',
          parameters: { roomId: OTHER_ROOM, nodeId: 'img-4' },
        },
        // An edge with no room cannot be linked, and another asset's edge is not this one's.
        {
          brand_id: BRAND,
          derived_asset_id: ASSET,
          derived_version_id: V3,
          operation: 'canvas_generation',
          parameters: {},
        },
        {
          brand_id: BRAND,
          derived_asset_id: TEMPLATE,
          derived_version_id: V3,
          operation: 'canvas_revision',
          parameters: { roomId: ROOM },
        },
      ],
      asset_versions: [{ id: V3, version_number: 3 }],
    };
    render(<ProvenancePanel brandId={BRAND} assetId={ASSET} />);

    const section = await screen.findByTestId('library-canvas-origin');
    expect(section.textContent).toContain('Revised from canvas (v3)');
    const links = screen.getAllByRole('link', { name: /Open node/ });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe(`/ai-studio?roomId=${OTHER_ROOM}&focusNodeId=img-4`);
  });

  it('does not repeat the origin link for the lineage edge of the same node', async () => {
    tables = {
      assets: [asset({ kind: 'canvas', roomId: ROOM, nodeId: 'gen-1' })],
      asset_lineage: [
        {
          brand_id: BRAND,
          derived_asset_id: ASSET,
          derived_version_id: V3,
          operation: 'canvas_generation',
          parameters: { roomId: ROOM, nodeId: 'gen-1' },
        },
      ],
      asset_versions: [{ id: V3, version_number: 1 }],
    };
    render(<ProvenancePanel brandId={BRAND} assetId={ASSET} />);

    await screen.findByTestId('library-canvas-origin');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('shows the Forge render and the canvas origin side by side', async () => {
    response = { provenance: PROVENANCE };
    tables = { assets: [asset({ kind: 'canvas', roomId: ROOM })] };
    render(<ProvenancePanel brandId={BRAND} assetId={ASSET} />);

    await screen.findByRole('region', { name: 'Forge render' });
    const section = await screen.findByTestId('library-canvas-origin');
    expect(section.querySelector('a')?.getAttribute('href')).toBe(`/ai-studio?roomId=${ROOM}`);
  });

  it('renders nothing for an asset that did not come from a canvas', async () => {
    tables = {
      assets: [
        asset({ kind: 'upload' }),
        // Same id, other brand: the brand filter keeps it out.
        asset({ kind: 'canvas', roomId: ROOM }, TEMPLATE),
      ],
    };
    const { container } = render(<ProvenancePanel brandId={BRAND} assetId={ASSET} />);
    await waitFor(() => expect(readsByTable.asset_lineage).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toBe('');
  });
});
