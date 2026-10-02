import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DesignArrangement, DesignLayersResponse } from '@continuum/contracts';

const LAYERS: DesignLayersResponse = {
  source: 'photoshop',
  artboards: [{ id: null, name: 'PAUTAS-15', w: 1200, h: 1200 }],
  // Bottom first, as the file stacks it: the offer sits over the photo.
  layers: [
    { id: 22, name: '<Rectángulo>', kind: 'pixel', artboardId: null, hidden: false },
    { id: 5, name: 'LOGO VIVO', kind: 'pixel', artboardId: null, hidden: false },
    { id: 17, name: 'DE DESCUENTO', kind: 'text', artboardId: null, hidden: false },
  ],
  arrangements: [],
};
let read: () => Promise<DesignLayersResponse> = async () => LAYERS;
const saved = mock(async (_assetId: string, _request: unknown) => ({ assetId: 'new-variant' }));
const sources = { ...(await import('@/lib/library/templateSources')) };
mock.module('@/lib/library/templateSources', () => ({
  ...sources,
  fetchDesignLayers: () => read(),
  createTemplateVariant: saved,
}));

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DesignLayersPanel, moveLayer } from './DesignLayersPanel';

afterEach(() => {
  cleanup();
  saved.mockClear();
  read = async () => LAYERS;
});

const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent?.trim());

describe('moveLayer', () => {
  test('one step toward the viewer or away, never past either end', () => {
    expect(moveLayer([1, 2, 3], 1, 1)).toEqual([2, 1, 3]);
    expect(moveLayer([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
    expect(moveLayer([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveLayer([1, 2, 3], 9, 1)).toEqual([1, 2, 3]);
  });
});

describe('DesignLayersPanel', () => {
  test('reads nothing until the tab is shown', async () => {
    const reads = mock(async () => LAYERS);
    read = reads;
    const { rerender } = render(
      <DesignLayersPanel
        brandId="b"
        assetId="a"
        expectedVersionId="v1"
        active={false}
        onSaved={() => {}}
      />,
    );
    expect(reads).not.toHaveBeenCalled();
    rerender(
      <DesignLayersPanel
        brandId="b"
        assetId="a"
        expectedVersionId="v1"
        active
        onSaved={() => {}}
      />,
    );
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
  });

  test('a new arrangement re-stacks the file’s layers and saves the exact order, bottom first', async () => {
    const onSaved = mock(() => {});
    render(
      <DesignLayersPanel brandId="b" assetId="a" expectedVersionId="v1" active onSaved={onSaved} />,
    );
    const [file] = await screen.findAllByRole('list');
    // Front first, the way a layers panel reads.
    expect(names(file!)).toEqual(['DE DESCUENTO', 'LOGO VIVO', '<Rectángulo>']);

    fireEvent.click(screen.getByRole('button', { name: /New variant/ }));
    fireEvent.change(screen.getByLabelText('Variant name'), {
      target: { value: 'Oferta detrás' },
    });
    const arrangement = screen.getByRole('region', { name: 'Variant Oferta detrás' });
    // Send the offer back twice: behind the logo, then behind the photo.
    fireEvent.click(
      within(arrangement).getByRole('button', { name: 'Send DE DESCUENTO backward' }),
    );
    fireEvent.click(
      within(arrangement).getByRole('button', { name: 'Send DE DESCUENTO backward' }),
    );
    expect(names(within(arrangement).getByRole('list'))).toEqual([
      'LOGO VIVO',
      '<Rectángulo>',
      'DE DESCUENTO',
    ]);
    // The file's own stack is untouched.
    expect(names(file!)).toEqual(['DE DESCUENTO', 'LOGO VIVO', '<Rectángulo>']);

    fireEvent.click(screen.getByRole('button', { name: 'Create variant' }));
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith('a', {
        brandId: 'b',
        expectedVersionId: 'v1',
        name: 'Oferta detrás',
        arrangement: { name: 'Oferta detrás', artboardId: null, order: [17, 22, 5] },
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  test('Reset returns an arrangement to the file’s order', async () => {
    read = async () => ({
      ...LAYERS,
      arrangements: [{ name: 'Alt', artboardId: null, order: [17, 22, 5] }],
    });
    render(
      <DesignLayersPanel
        brandId="b"
        assetId="a"
        expectedVersionId="v1"
        active
        onSaved={() => {}}
      />,
    );
    const arrangement = await screen.findByRole('region', { name: 'Variant Alt' });
    fireEvent.click(within(arrangement).getByRole('button', { name: /Reset to the file’s order/ }));
    expect(names(within(arrangement).getByRole('list'))).toEqual([
      'DE DESCUENTO',
      'LOGO VIVO',
      '<Rectángulo>',
    ]);
  });

  test('removing and adding variants keeps unique names and shows errors beside the editor', async () => {
    render(
      <DesignLayersPanel
        brandId="b"
        assetId="a"
        expectedVersionId="v1"
        active
        onSaved={() => {}}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New variant' }));
    fireEvent.click(screen.getByRole('button', { name: 'New variant' }));
    fireEvent.change(screen.getByLabelText('Edit variant'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove PAUTAS-15 · 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'New variant' }));
    expect(screen.getByLabelText('Variant name').getAttribute('value')).toBe('PAUTAS-15 · 2');
    fireEvent.change(screen.getByLabelText('Variant name'), {
      target: { value: ' PAUTAS-15 · 3 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create variant' }));
    expect(screen.getByRole('alert').textContent).toContain('different name');
    expect(saved).not.toHaveBeenCalled();
  });

  test('a template not imported from a design file says why there is nothing to order', async () => {
    read = async () => {
      throw new Error(
        'layer order can be changed on templates imported from a Photoshop or Illustrator file',
      );
    };
    render(
      <DesignLayersPanel
        brandId="b"
        assetId="a"
        expectedVersionId="v1"
        active
        onSaved={() => {}}
      />,
    );
    expect(await screen.findByText(/imported from a Photoshop or Illustrator file/)).toBeTruthy();
  });
});
