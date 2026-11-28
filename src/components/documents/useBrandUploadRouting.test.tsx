import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { ReactNode } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
} from '@/components/library/__tests__/renderWithCreativeI18n';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useBrandUploadRouting } from './useBrandUploadRouting';

const BRAND = '22222222-2222-4222-8222-222222222222';
const pdf = new File(['%PDF'], 'guidelines.pdf', { type: 'application/pdf' });
const png = new File([new Uint8Array([137, 80, 78, 71])], 'menu.png', { type: 'image/png' });
const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
const ttf = new File([new Uint8Array([0, 1, 0, 0])], 'Brand-Bold.ttf', { type: 'font/ttf' });

afterEach(cleanup);

function setup(sendToLibrary = mock(async (file: File) => ({ assetId: `asset-${file.name}` }))) {
  const uploadDocuments = mock(async (_files: File[]) => undefined);
  const removeFromLibrary = mock(async (_brandId: string, _assetIds: string[]) => undefined);
  const { result } = renderHook(
    () =>
      useBrandUploadRouting({
        brandId: BRAND,
        uploadDocuments,
        deps: { sendToLibrary, removeFromLibrary },
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>,
    },
  );
  return { result, uploadDocuments, sendToLibrary, removeFromLibrary };
}

describe('useBrandUploadRouting', () => {
  test('one drop goes to three homes without asking: documents, Library, font review', async () => {
    const { result, uploadDocuments, sendToLibrary } = setup();
    await act(() => result.current.route([pdf, png, svg, ttf]));

    expect(uploadDocuments).toHaveBeenCalledWith([pdf]);
    expect(sendToLibrary.mock.calls.map(([file]) => file)).toEqual([png, svg]);
    expect(result.current.fontFiles).toEqual([ttf]);
    expect(await screen.findByText('2 files went to your Library')).toBeTruthy();
  });

  test('an image that was really text can be read instead; its Library copy is removed', async () => {
    const { result, uploadDocuments, removeFromLibrary } = setup();
    await act(() => result.current.route([png, svg]));

    fireEvent.click(await screen.findByRole('button', { name: 'Read its text instead' }));
    await waitFor(() => expect(uploadDocuments).toHaveBeenLastCalledWith([png]));
    expect(removeFromLibrary).toHaveBeenCalledWith(BRAND, ['asset-menu.png']);
  });

  test('an SVG alone offers no text reading', async () => {
    const { result } = setup();
    await act(() => result.current.route([svg]));
    expect(await screen.findByText('1 file went to your Library')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Read/ })).toBeNull();
  });

  test('a failed Library upload is named, not dropped silently', async () => {
    const { result } = setup(
      mock(async (file: File) => {
        if (file === svg) throw new Error('storage down');
        return { assetId: 'asset-1' };
      }),
    );
    await act(() => result.current.route([png, svg]));
    expect(await screen.findByText(/Not saved to your Library: logo\.svg/)).toBeTruthy();
  });
});
