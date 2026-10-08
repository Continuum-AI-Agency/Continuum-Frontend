import { expect, mock, test } from 'bun:test';
import { libraryUploadRefusal } from '@continuum/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';

const uploaded = {
  assetId: 'asset-aep',
  versionId: 'version-aep',
  storagePath: 'brand-1/asset-aep/project.aep',
  signedUrl: 'https://signed.example/project.aep',
  thumbnailPath: null,
  previewState: 'unsupported' as const,
};
const uploadMediaAsset = mock(async () => uploaded);

// A partial mock.module deletes every other export for the whole process, so the
// size gate the hook calls before queueing is carried too.
mock.module('@/lib/library/uploadMediaAsset', () => ({
  uploadMediaAsset,
  uploadSizeRefusal: (file: File) =>
    libraryUploadRefusal({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
}));

const { useMediaUpload } = await import('./useMediaUpload');

test('a completed AEP upload is exposed to the Library so it can show the new template', async () => {
  const onUploaded = mock(() => undefined);
  const { result } = renderHook(() => useMediaUpload('brand-1', { onUploaded }));
  const file = new File(['aep bytes'], 'project.aep', { type: 'application/octet-stream' });

  await act(async () => {
    await result.current.uploadFiles([file]);
  });

  await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
  expect(onUploaded).toHaveBeenCalledWith({ file, uploaded });
});

test('every dropped file is queued; the ones it cannot take are named with the reason', async () => {
  const { result } = renderHook(() => useMediaUpload('brand-1'));
  const unknown = new File(['mail'], 'thread.msg', { type: '' });
  const font = new File(['font'], 'Brand.otf', { type: 'font/otf' });
  const huge = new File(['x'], 'shoot.mov', { type: 'video/quicktime' });
  Object.defineProperty(huge, 'size', { value: 600 * 1024 * 1024 });

  await act(async () => {
    await result.current.uploadFiles([unknown, font, huge]);
  });

  const byName = new Map(result.current.uploads.map((item) => [item.name, item]));
  expect([...byName.keys()]).toEqual(['thread.msg', 'Brand.otf', 'shoot.mov']);
  expect(byName.get('thread.msg')?.refused).toBeUndefined();
  expect(byName.get('Brand.otf')).toMatchObject({ status: 'error', refused: true });
  expect(byName.get('Brand.otf')?.error).toContain('Brand.otf is a font');
  expect(byName.get('shoot.mov')).toMatchObject({
    status: 'error',
    refused: true,
    error: 'shoot.mov is 600 MB — uploads are capped at 500 MB right now.',
  });
  await waitFor(() => expect(uploadMediaAsset).toHaveBeenCalledWith(expect.objectContaining({ file: unknown })));
});
