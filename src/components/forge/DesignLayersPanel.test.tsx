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
let read: () => Promise<DesignLayersResponse | null> = async () => LAYERS;
const saved = mock(
  async (
    _brandId: string,
    _assetId: string,
    save: { arrangements: DesignArrangement[]; saveTo: string; name?: string },
  ) => ({
    assetId: save.saveTo === 'new_variant' ? 'child' : 'a',
    versionId: 'v2',
    parseState: 'parsed',
    comps: ['PAUTAS-15', ...save.arrangements.map((arrangement) => arrangement.name)],
    arrangements: save.arrangements,
  }),
);
const sources = { ...(await import('@/lib/library/templateSources')) };
mock.module('@/lib/library/templateSources', () => ({
  ...sources,
  fetchDesignLayers: () => read(),
  saveDesignArrangements: saved,
}));

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { DesignLayersPanel } from './DesignLayersPanel';

afterEach(() => {
  cleanup();
  saved.mockClear();
  read = async () => LAYERS;
});

const panel = (props: Partial<ComponentProps<typeof DesignLayersPanel>> = {}) => (
  <DesignLayersPanel brandId="b" assetId="a" onVariant={false} onSaved={() => {}} {...props} />
);
const names = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent?.trim());
const open = async () =>
  fireEvent.click(await screen.findByRole('button', { name: /Arrangements · extra formats/ }));

describe('DesignLayersPanel', () => {
  test('reads the design file only when the section is expanded', async () => {
    const reads = mock(async () => LAYERS);
    read = reads;
    render(panel());
    expect(reads).not.toHaveBeenCalled();
    await open();
    await waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
  });

  test('on the golden import an arrangement saves as a NEW named variant, bottom first', async () => {
    const onSaved = mock(() => {});
    const onOpenVariant = mock((_id: string) => {});
    render(panel({ onSaved, onOpenVariant }));
    await open();
    const file = await screen.findByRole('list', { name: 'PAUTAS-15 as the file stacks it' });
    // Front first, the way a layers panel reads; the file's own stack cannot be dragged.
    expect(names(file)).toEqual(['DE DESCUENTO', 'LOGO VIVO', '<Rectángulo>']);
    expect(within(file).queryByRole('button', { name: /Drag/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /New arrangement/ }));
    fireEvent.change(screen.getByLabelText('Arrangement name'), {
      target: { value: 'Oferta detrás' },
    });
    const arrangement = screen.getByRole('region', { name: 'Arrangement Oferta detrás' });
    // Send the offer back twice: behind the logo, then behind the photo.
    for (let i = 0; i < 2; i++)
      fireEvent.click(
        within(arrangement).getByRole('button', { name: 'Send DE DESCUENTO backward' }),
      );
    expect(names(within(arrangement).getByRole('list'))).toEqual([
      'LOGO VIVO',
      '<Rectángulo>',
      'DE DESCUENTO',
    ]);
    expect(names(file)).toEqual(['DE DESCUENTO', 'LOGO VIVO', '<Rectángulo>']);

    // The golden source has no save-in-place, and a new variant needs a name.
    expect(screen.queryByRole('button', { name: 'Save arrangements' })).toBeNull();
    const fork = screen.getByRole('button', { name: 'Save as new variant' });
    expect(fork.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Arrangement variant name'), {
      target: { value: 'Promo stacks' },
    });
    fireEvent.click(fork);
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith('b', 'a', {
        arrangements: [{ name: 'Oferta detrás', artboardId: null, order: [17, 22, 5] }],
        saveTo: 'new_variant',
        name: 'Promo stacks',
      }),
    );
    await waitFor(() => expect(onOpenVariant).toHaveBeenCalledWith('child'));
    expect(onSaved).toHaveBeenCalled();
  });

  test('on an arrangement variant, Save writes that variant', async () => {
    read = async () => ({
      ...LAYERS,
      arrangements: [{ name: 'Alt', artboardId: null, order: [22, 5, 17] }],
    });
    render(panel({ onVariant: true }));
    await open();
    const arrangement = await screen.findByRole('region', { name: 'Arrangement Alt' });
    fireEvent.click(
      within(arrangement).getByRole('button', { name: 'Bring <Rectángulo> forward' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Save arrangements' }));
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith('b', 'a', {
        arrangements: [{ name: 'Alt', artboardId: null, order: [5, 22, 17] }],
        saveTo: 'this_variant',
      }),
    );
  });

  test('Reset returns an arrangement to the file’s order', async () => {
    read = async () => ({
      ...LAYERS,
      arrangements: [{ name: 'Alt', artboardId: null, order: [17, 22, 5] }],
    });
    render(panel());
    await open();
    const arrangement = await screen.findByRole('region', { name: 'Arrangement Alt' });
    fireEvent.click(within(arrangement).getByRole('button', { name: 'Reset to the file’s order' }));
    expect(names(within(arrangement).getByRole('list'))).toEqual([
      'DE DESCUENTO',
      'LOGO VIVO',
      '<Rectángulo>',
    ]);
  });

  test('a template with no design stack says so instead of an empty editor', async () => {
    read = async () => null;
    render(panel());
    await open();
    expect(await screen.findByText('This template has no design arrangements.')).toBeTruthy();
  });
});
