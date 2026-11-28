import { afterEach, beforeAll, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';

type Outcome = { ok: true; assetId: string } | { ok: false; error: unknown };

let releaseUpload: () => void = () => {};
let tagSucceeds = true;
const uploadTaggedLibraryImages = mock(
  async (
    input: { brandId: string; files: readonly File[]; tag: 'logo' | 'reference' },
    onSettled: (index: number, outcome: Outcome) => void,
  ) => {
    for (const [index, file] of input.files.entries()) {
      if (file.name.startsWith('slow')) await new Promise<void>((done) => (releaseUpload = done));
      if (file.name.startsWith('broken'))
        onSettled(index, { ok: false, error: new Error('Storage quota reached') });
      else onSettled(index, { ok: true, assetId: `id-${index}` });
    }
    return { tagged: tagSucceeds };
  },
);

const setBrandLogoFromLibrary = mock(
  async (brandId: string, assetId: string) => `${brandId}/branding/${assetId}.png`,
);

mock.module('@/lib/onboarding/libraryAssets', () => ({
  uploadTaggedLibraryImages,
  setBrandLogoFromLibrary,
  isChosenBrandLogo: (path: string | null) => Boolean(path) && !path?.startsWith('http'),
}));

const storedFonts: { family: string; weight: number | null; style: string; format: string }[] = [
  { family: 'Acme Sans', weight: 700, style: 'normal', format: 'woff2' },
];
mock.module('@/lib/library/templateSources', () => ({
  fetchBrandFonts: async () => storedFonts,
  uploadBrandFont: async ({ family }: { family: string }) => {
    storedFonts.push({ family, weight: 400, style: 'normal', format: 'woff2' });
    return { family, format: 'woff2', bytes: 1 };
  },
}));

const uploadBrandDocument = mock(async ({ file }: { file: File }) => ({
  documentId: 'doc-1',
  storagePath: `brand-1/${file.name}`,
  document: {},
  state: { documents: [{ name: file.name }] },
}));
mock.module('@/lib/documents/uploadBrandDocument', () => ({ uploadBrandDocument }));
const uploadMediaAsset = mock(async () => ({ assetId: 'asset-1' }));
mock.module('@/lib/library/uploadMediaAsset', () => ({ uploadMediaAsset }));

// happy-dom has no font loading. The stub records what was registered so the test can see a
// specimen was drawn from the picked file, under a private family name.
const addedFaces: string[] = [];
beforeAll(() => {
  globalThis.FontFace = class {
    constructor(readonly family: string) {}
    load() {
      return Promise.resolve(this);
    }
  } as unknown as typeof FontFace;
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { add: (face: { family: string }) => addedFaces.push(face.family), delete: () => true },
  });
});

const { BrandLibraryAssets } = await import('./BrandLibraryAssets');

afterEach(() => {
  cleanup();
  uploadTaggedLibraryImages.mockClear();
  setBrandLogoFromLibrary.mockClear();
  tagSucceeds = true;
});

const noLogo = { path: null, onChange: async () => {} };

const png = (name: string) => new File(['x'], name, { type: 'image/png' });
const pick = (tag: 'logo' | 'reference', files: File[]) =>
  fireEvent.change(screen.getByTestId(`brand-library-${tag}-input`), { target: { files } });

test('a drop of logos goes up as one tagged batch and previews from the local files', async () => {
  render(<BrandLibraryAssets brandId="brand-1" brandLogo={noLogo} onBusyChange={() => {}} />);
  pick('logo', [png('logo-dark.png'), png('logo-icon.png')]);

  const zone = screen.getByTestId('brand-library-logo');
  await waitFor(() => expect(within(zone).getAllByText('In your Library')).toHaveLength(2));
  expect(uploadTaggedLibraryImages).toHaveBeenCalledTimes(1);
  const [input] = uploadTaggedLibraryImages.mock.calls[0];
  expect(input.tag).toBe('logo');
  expect(input.files.map((file) => file.name)).toEqual(['logo-dark.png', 'logo-icon.png']);
  for (const img of zone.querySelectorAll('img')) {
    expect(img.getAttribute('src')).toStartWith('blob:');
  }
  expect(within(zone).getByRole('link', { name: 'View in Library' }).getAttribute('href')).toBe(
    '/library?tags=logo',
  );
});

test('reference images are tagged reference', async () => {
  render(<BrandLibraryAssets brandId="brand-1" brandLogo={noLogo} onBusyChange={() => {}} />);
  pick('reference', [png('moodboard.png')]);
  await waitFor(() => expect(uploadTaggedLibraryImages).toHaveBeenCalledTimes(1));
  expect(uploadTaggedLibraryImages.mock.calls[0][0].tag).toBe('reference');
});

test('uploads that landed untagged say so instead of claiming success', async () => {
  tagSucceeds = false;
  render(<BrandLibraryAssets brandId="brand-1" brandLogo={noLogo} onBusyChange={() => {}} />);
  pick('logo', [png('logo.png')]);
  expect(await screen.findByText(/Saved to your Library, but not tagged “logo”/)).toBeTruthy();
});

test('a failed upload shows its reason and the rest of the drop still lands', async () => {
  render(<BrandLibraryAssets brandId="brand-1" brandLogo={noLogo} onBusyChange={() => {}} />);
  pick('reference', [png('broken.png'), png('fine.png')]);
  const zone = screen.getByTestId('brand-library-reference');
  await waitFor(() =>
    expect(zone.querySelector('[data-status="error"]')?.textContent).toContain('broken.png'),
  );
  expect(zone.querySelector('[data-status="done"]')?.textContent).toContain('fine.png');
});

test('Continue is held while an upload is in flight', async () => {
  const onBusyChange = mock((_busy: boolean) => {});
  render(<BrandLibraryAssets brandId="brand-1" brandLogo={noLogo} onBusyChange={onBusyChange} />);
  pick('logo', [png('slow.png')]);
  await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(true));
  releaseUpload();
  await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
});

test('held fonts are listed in plain words, with no specimen for a face we only hold', async () => {
  render(<BrandLibraryAssets brandId="brand-1" brandLogo={noLogo} onBusyChange={() => {}} />);
  const fonts = screen.getByTestId('brand-library-fonts');
  expect(await within(fonts).findByText('Acme Sans')).toBeTruthy();
  expect(within(fonts).getByText('Saved')).toBeTruthy();
  expect(within(fonts).queryByText(/in the engine|No specimen/)).toBeNull();
  expect(within(fonts).queryByTestId('font-specimen')).toBeNull();
});

test('a font saved this session is previewed from the file that was picked', async () => {
  render(<BrandLibraryAssets brandId="brand-1" brandLogo={noLogo} onBusyChange={() => {}} />);
  const fonts = screen.getByTestId('brand-library-fonts');
  await within(fonts).findByText('Acme Sans');

  const fontInput = fonts.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(fontInput, {
    target: { files: [new File(['ttf'], 'Brandface-Regular.ttf', { type: 'font/ttf' })] },
  });
  const dialog = await screen.findByRole('dialog');
  await waitFor(() =>
    expect(within(dialog).getByTestId('font-specimen').getAttribute('data-ready')).toBe('true'),
  );
  fireEvent.change(within(dialog).getByLabelText('Font family'), {
    target: { value: 'Brandface' },
  });
  fireEvent.change(within(dialog).getByLabelText('Weight (optional)'), {
    target: { value: '400' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: /add to engine/i }));

  await waitFor(() => expect(within(fonts).getByText('Brandface')).toBeTruthy());
  const row = within(fonts).getByText('Brandface').parentElement as HTMLElement;
  await waitFor(() =>
    expect(within(row).getByTestId('font-specimen').getAttribute('data-ready')).toBe('true'),
  );
  expect(addedFaces.every((family) => family.startsWith('specimen-'))).toBe(true);
});

test('the first logo dropped becomes the brand logo when the brand has not chosen one', async () => {
  const onChange = mock(async (_path: string) => {});
  render(
    <BrandLibraryAssets
      brandId="brand-1"
      brandLogo={{ path: 'https://acme.com/scraped-logo.png', onChange }}
      onBusyChange={() => {}}
    />,
  );
  pick('logo', [png('logo-full.png'), png('logo-icon.png')]);

  const zone = screen.getByTestId('brand-library-logo');
  expect(await within(zone).findByText('Brand logo')).toBeTruthy();
  expect(setBrandLogoFromLibrary).toHaveBeenCalledTimes(1);
  expect(setBrandLogoFromLibrary).toHaveBeenCalledWith('brand-1', 'id-0');
  expect(onChange).toHaveBeenCalledWith('brand-1/branding/id-0.png');
  // Only the other logo offers the switch.
  expect(within(zone).getAllByRole('button', { name: 'Use as brand logo' })).toHaveLength(1);
});

test('a logo the brand already chose stays until they pick another', async () => {
  const onChange = mock(async (_path: string) => {});
  render(
    <BrandLibraryAssets
      brandId="brand-1"
      brandLogo={{ path: 'brand-1/branding/logo.png', onChange }}
      onBusyChange={() => {}}
    />,
  );
  pick('logo', [png('logo-dark.png')]);
  const zone = screen.getByTestId('brand-library-logo');
  const use = await within(zone).findByRole('button', { name: 'Use as brand logo' });
  expect(setBrandLogoFromLibrary).not.toHaveBeenCalled();

  fireEvent.click(use);
  expect(await within(zone).findByText('Brand logo')).toBeTruthy();
  expect(setBrandLogoFromLibrary).toHaveBeenCalledWith('brand-1', 'id-0');
});

test('reference images never offer to become the brand logo', async () => {
  render(<BrandLibraryAssets brandId="brand-1" brandLogo={noLogo} onBusyChange={() => {}} />);
  pick('reference', [png('moodboard.png')]);
  const zone = screen.getByTestId('brand-library-reference');
  await within(zone).findByText('In your Library');
  expect(within(zone).queryByRole('button', { name: 'Use as brand logo' })).toBeNull();
  expect(setBrandLogoFromLibrary).not.toHaveBeenCalled();
});

test('a document or a font dropped on an image zone goes where it is used, not refused', async () => {
  const onDocumentsChange = mock(() => undefined);
  render(
    <BrandLibraryAssets
      brandId="brand-1"
      brandLogo={noLogo}
      onBusyChange={() => {}}
      onDocumentsChange={onDocumentsChange}
    />,
  );
  const guide = new File(['%PDF'], 'brand-guide.pdf', { type: 'application/pdf' });
  const face = new File([new Uint8Array([0, 1, 0, 0])], 'Acme-Bold.ttf', { type: 'font/ttf' });
  pick('logo', [guide, face]);

  const zone = within(screen.getByTestId('brand-library-logo'));
  expect(await zone.findByText('Moved to Brand documents')).toBeTruthy();
  expect(await zone.findByText('Moved to Fonts')).toBeTruthy();
  expect(uploadBrandDocument).toHaveBeenCalledWith({
    brandId: 'brand-1',
    file: guide,
    syncOnboardingState: true,
  });
  expect(onDocumentsChange).toHaveBeenCalledWith({ documents: [{ name: 'brand-guide.pdf' }] });
  expect(uploadTaggedLibraryImages).not.toHaveBeenCalled();
  // The font goes to the review, prefilled from the file.
  expect(await screen.findByLabelText('Font family')).toBeTruthy();
});
