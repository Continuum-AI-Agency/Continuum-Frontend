import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DesignArrangement, DesignLayersResponse, TemplateRevision } from '@continuum/contracts';

const LAYERS: DesignLayersResponse = {
  source: 'photoshop',
  artboards: [{ id: null, name: 'PAUTAS-15', w: 1200, h: 1200 }],
  layers: [
    { id: 22, name: '<Rectángulo>', kind: 'pixel', artboardId: null, hidden: false },
    { id: 5, name: 'LOGO VIVO', kind: 'pixel', artboardId: null, hidden: false },
    { id: 17, name: 'DE DESCUENTO', kind: 'text', artboardId: null, hidden: false },
  ],
  arrangements: [],
};
let read: () => Promise<DesignLayersResponse> = async () => LAYERS;
const saved = mock(async (_assetId: string, _request: unknown) => ({}) as TemplateRevision);
const sources = { ...(await import('@/lib/library/templateSources')) };
mock.module('@/lib/library/templateSources', () => ({
  ...sources,
  fetchDesignLayers: () => read(),
  saveTemplateRevision: saved,
}));

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DesignLayersPanel } from './DesignLayersPanel';

afterEach(() => {
  cleanup();
  saved.mockClear();
  read = async () => LAYERS;
});

const names = (list: HTMLElement) =>
  within(list).getAllByRole('listitem').map((item) => item.textContent?.trim());
const props = {
  brandId: 'brand-1',
  assetId: 'asset-1',
  revisionId: 'revision-1',
  expectedHeadRevisionId: 'head-1',
};

const openPanel = async (onSaved: (revision: TemplateRevision) => unknown = () => {}) => {
  render(<DesignLayersPanel {...props} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole('button', { name: /Arrangements · extra formats/ }));
  await screen.findByText(/Reading the file’s layers/).catch(() => undefined);
  await screen.findByRole('list', { name: 'PAUTAS-15 as the file stacks it' });
};

describe('DesignLayersPanel', () => {
  test('does not fetch design layers until the panel is expanded', async () => {
    const reads = mock(async () => LAYERS);
    read = reads;
    render(<DesignLayersPanel {...props} onSaved={() => {}} />);
    expect(reads).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Arrangements · extra formats/ }));
    await screen.findByRole('list', { name: 'PAUTAS-15 as the file stacks it' });
    expect(reads).toHaveBeenCalledTimes(1);
  });

  test('edits stack order and saves a new immutable variant revision pinned to the opened head', async () => {
    const onSaved = mock(() => {});
    await openPanel(onSaved);
    const fileStack = screen.getByRole('list', { name: 'PAUTAS-15 as the file stacks it' });
    expect(names(fileStack)).toEqual(['DE DESCUENTO', 'LOGO VIVO', '<Rectángulo>']);

    fireEvent.click(screen.getByRole('button', { name: 'New arrangement' }));
    const stack = screen.getByRole('list', { name: /PAUTAS-15 · 2 stack/ });
    fireEvent.click(within(stack).getByRole('button', { name: 'Send DE DESCUENTO backward' }));
    fireEvent.click(within(stack).getByRole('button', { name: 'Send DE DESCUENTO backward' }));
    expect(names(stack)).toEqual(['LOGO VIVO', '<Rectángulo>', 'DE DESCUENTO']);
    expect(names(fileStack)).toEqual(['DE DESCUENTO', 'LOGO VIVO', '<Rectángulo>']);

    fireEvent.change(screen.getByPlaceholderText('Name the new variant'), {
      target: { value: 'Oferta detrás' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save as immutable variant' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    const [assetId, request] = saved.mock.calls[0]!;
    expect(assetId).toBe('asset-1');
    expect(request).toMatchObject({
      brandId: 'brand-1',
      parentRevisionId: 'revision-1',
      expectedHeadRevisionId: 'head-1',
      name: 'Oferta detrás',
      edits: {
        arrangement: { name: 'Oferta detrás', artboardId: null, order: [17, 22, 5] },
        layers: [],
        slots: [],
        orders: [],
      },
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  test('appends a revision to the selected immutable variant and can reset its arrangement', async () => {
    read = async () => ({
      ...LAYERS,
      arrangements: [{ name: 'Alt', artboardId: null, order: [17, 22, 5] }],
    });
    render(<DesignLayersPanel {...props} variantId="variant-1" onSaved={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Arrangements · extra formats/ }));
    const arrangement = await screen.findByRole('region', { name: 'Arrangement Alt' });
    expect(names(within(arrangement).getByRole('list', { name: 'Alt stack' }))).toEqual([
      'LOGO VIVO', '<Rectángulo>', 'DE DESCUENTO',
    ]);
    fireEvent.click(within(arrangement).getByRole('button', { name: 'Reset to the file’s order' }));
    expect(names(within(arrangement).getByRole('list', { name: 'Alt stack' }))).toEqual([
      'DE DESCUENTO', 'LOGO VIVO', '<Rectángulo>',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Save arrangement revision' }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(saved.mock.calls[0]?.[1]).toMatchObject({
      brandId: 'brand-1', parentRevisionId: 'revision-1',
      expectedHeadRevisionId: 'head-1', variantId: 'variant-1',
      edits: { arrangement: { name: 'Alt', artboardId: null, order: [22, 5, 17] } },
    });
  });

  test('reports unsupported sources without attempting a save', async () => {
    read = async () => { throw new Error('layer order can be changed only for Photoshop imports'); };
    render(<DesignLayersPanel {...props} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Arrangements · extra formats/ }));
    expect(await screen.findByText(/layer order can be changed only for Photoshop imports/)).toBeTruthy();
    expect(saved).not.toHaveBeenCalled();
  });
});
