import { expect, mock, test } from 'bun:test';
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

mock.module('@/lib/library/uploadMediaAsset', () => ({ uploadMediaAsset }));

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
