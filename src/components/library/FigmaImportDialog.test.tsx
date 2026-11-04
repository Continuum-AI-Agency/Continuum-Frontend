import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { FigmaImportedAsset } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as figmaClient from '@/lib/library/figma';

// The client's own HTTP shape is pinned in lib/library/figma.test.ts; here only the two calls the
// dialog makes are replaced, and the rest of the module (errors, messages) stays real.
const importFigmaFrames = mock(
  async (_input: {
    brandId: string;
    fileKey: string;
    nodeIds: string[];
  }): Promise<FigmaImportedAsset[]> => [],
);
const listFigmaFrames = mock(async () => ({ fileName: 'Launch', modifiedAt: null, frames: [] }));
mock.module('@/lib/library/figma', () => ({ ...figmaClient, importFigmaFrames, listFigmaFrames }));

const { FigmaImportDialog } = await import('./FigmaImportDialog');

const BRAND = '11111111-1111-4111-8111-111111111111';
const ASSET = '21111111-1111-4111-8111-111111111111';
const LINK = 'https://www.figma.com/design/AbC123/Launch?node-id=12-34';

function openWithLink(onImported: (assets: FigmaImportedAsset[]) => void = () => undefined): void {
  render(<FigmaImportDialog brandId={BRAND} onImported={onImported} />);
  fireEvent.click(screen.getByRole('button', { name: /figma/i }));
}

beforeEach(() => {
  importFigmaFrames.mockReset();
  listFigmaFrames.mockClear();
});
afterEach(cleanup);

describe('FigmaImportDialog', () => {
  test('a link to a frame imports that frame without spending a Figma read on a listing', async () => {
    importFigmaFrames.mockResolvedValue([
      { assetId: ASSET, versionId: ASSET, figmaNodeId: '12:34', status: 'created' },
    ]);
    const onImported = mock((_assets: FigmaImportedAsset[]) => undefined);
    openWithLink(onImported);
    fireEvent.change(await screen.findByLabelText('Figma link'), { target: { value: LINK } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByText('The linked frame is ready to import.');
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(importFigmaFrames).toHaveBeenCalledWith({
      brandId: BRAND,
      fileKey: 'AbC123',
      nodeIds: ['12:34'],
    });
    expect(listFigmaFrames).not.toHaveBeenCalled();
  });

  test('a missing font is named with what to do, not shown as a code', async () => {
    importFigmaFrames.mockRejectedValue(
      new figmaClient.FigmaApiError('figma_fonts_missing', ['Avenir 800']),
    );
    openWithLink();
    fireEvent.change(await screen.findByLabelText('Figma link'), { target: { value: LINK } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Add Avenir 800 to the brand');
  });

  test("a link to a page lists the file's frames instead of failing again", async () => {
    importFigmaFrames.mockRejectedValue(new figmaClient.FigmaApiError('figma_node_not_a_frame'));
    listFigmaFrames.mockResolvedValueOnce({
      fileName: 'Launch',
      modifiedAt: null,
      frames: [
        { id: '5:6', name: 'Hero', type: 'FRAME', pageName: 'Ads', width: 1080, height: 1080 },
      ],
    } as never);
    openWithLink();
    fireEvent.change(await screen.findByLabelText('Figma link'), {
      target: { value: 'https://www.figma.com/design/AbC123/Launch?node-id=0-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }));

    expect(await screen.findByText('Hero')).toBeTruthy();
    expect(listFigmaFrames).toHaveBeenCalledWith(BRAND, 'AbC123');
    // The page id is not kept: nothing invisible stays selected.
    expect(screen.getByText('Select up to 5 frames')).toBeTruthy();
  });
});
