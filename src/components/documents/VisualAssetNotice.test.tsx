import { afterEach, describe, expect, mock, test } from 'bun:test';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@/components/library/__tests__/renderWithCreativeI18n';
import { VisualAssetNotice } from './VisualAssetNotice';

const BRAND = '22222222-2222-4222-8222-222222222222';
const png = new File([new Uint8Array([137, 80, 78, 71])], 'team-photo.png', { type: 'image/png' });
const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
const ttf = new File([new Uint8Array([0, 1, 0, 0])], 'Brand-Bold.ttf', { type: 'font/ttf' });

afterEach(cleanup);

function renderNotice(files: File[], uploadToLibrary = mock(async () => undefined)) {
  const onKeepInKnowledge = mock((_files: File[]) => undefined);
  const onSettled = mock((_files: File[]) => undefined);
  render(
    <VisualAssetNotice
      brandId={BRAND}
      files={files}
      onKeepInKnowledge={onKeepInKnowledge}
      onSettled={onSettled}
      uploadToLibrary={uploadToLibrary}
    />,
  );
  return { onKeepInKnowledge, onSettled, uploadToLibrary };
}

describe('VisualAssetNotice', () => {
  test('a font and an SVG can only go to the Library, never Knowledge', () => {
    renderNotice([svg, ttf]);
    expect(screen.getByRole('button', { name: 'Send to Library instead' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Keep .* in Knowledge/ })).toBeNull();
  });

  test('a raster image may be kept in Knowledge when the person chooses', () => {
    const { onKeepInKnowledge, onSettled, uploadToLibrary } = renderNotice([png, ttf]);
    fireEvent.click(screen.getByRole('button', { name: 'Keep the image in Knowledge' }));
    expect(onKeepInKnowledge).toHaveBeenCalledWith([png]);
    expect(onSettled).toHaveBeenCalledWith([png]);
    expect(uploadToLibrary).not.toHaveBeenCalled();
  });

  test('sending uploads images to the Library and opens the font review for fonts', async () => {
    const { onKeepInKnowledge, onSettled, uploadToLibrary } = renderNotice([png, svg, ttf]);
    fireEvent.click(screen.getByRole('button', { name: 'Send to Library instead' }));
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith([png, svg, ttf]));
    expect(uploadToLibrary).toHaveBeenCalledTimes(2);
    expect(uploadToLibrary).toHaveBeenCalledWith(png, BRAND);
    expect(uploadToLibrary).toHaveBeenCalledWith(svg, BRAND);
    expect(onKeepInKnowledge).not.toHaveBeenCalled();
    expect(await screen.findByLabelText('Font family')).toBeTruthy();
  });

  test('a failed Library upload is named, not dropped silently', async () => {
    const failing = mock(async (file: File) => {
      if (file === svg) throw new Error('storage down');
    });
    renderNotice([png, svg], failing);
    fireEvent.click(screen.getByRole('button', { name: 'Send to Library instead' }));
    expect((await screen.findByTestId('visual-asset-failed')).textContent).toContain('logo.svg');
  });
});
