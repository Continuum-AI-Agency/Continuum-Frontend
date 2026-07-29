import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';

const uploadMediaAsset = mock(async () => ({
  assetId: 'asset-9',
  versionId: 'version-9',
  storagePath: 'brand-1/assets/asset-9/shot.png',
  signedUrl: 'https://signed.example/shot.png',
  thumbnailPath: null,
  previewState: 'ready' as const,
}));

mock.module('@/lib/library/uploadMediaAsset', () => ({ uploadMediaAsset }));

const { MAX_ATTACHMENT_BYTES, useChatAttachments } = await import('./useChatAttachments');

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function renderController() {
  return renderHook(() => useChatAttachments({ brandId: 'brand-1', sessionId: 'session-1' }));
}

describe('useChatAttachments', () => {
  beforeEach(() => {
    uploadMediaAsset.mockClear();
  });

  afterEach(() => {
    mock.restore();
  });

  it('uploads an added file once into the Library and resolves its durable identity', async () => {
    const { result } = renderController();

    act(() => {
      result.current.add([makeFile('shot.png', 'image/png', 2048)]);
    });

    expect(result.current.files[0]?.status).toBe('uploading');
    expect(result.current.isUploading).toBe(true);

    await waitFor(() => expect(result.current.files[0]?.status).toBe('ready'));

    expect(result.current.files[0]?.assetId).toBe('asset-9');
    expect(result.current.files[0]?.url).toBe('https://signed.example/shot.png');
    expect(result.current.files[0]?.storagePath).toBe('brand-1/assets/asset-9/shot.png');
    expect(result.current.isUploading).toBe(false);
    expect(uploadMediaAsset).toHaveBeenCalledTimes(1);
  });

  it('scopes the Library upload to the active brand', async () => {
    const { result } = renderController();

    act(() => {
      result.current.add([makeFile('shot.png', 'image/png', 10)]);
    });
    await waitFor(() => expect(result.current.files[0]?.status).toBe('ready'));

    const [params] = uploadMediaAsset.mock.calls[0] as unknown as [
      { brandId: string; file: File },
    ];
    expect(params.brandId).toBe('brand-1');
    expect(params.file.name).toBe('shot.png');
  });

  it('rejects a file over the size cap without attempting an upload', async () => {
    const { result } = renderController();

    act(() => {
      result.current.add([makeFile('huge.png', 'image/png', MAX_ATTACHMENT_BYTES + 1)]);
    });

    expect(result.current.files[0]?.status).toBe('error');
    expect(result.current.isUploading).toBe(false);
    expect(uploadMediaAsset).not.toHaveBeenCalled();
  });

  it('marks the attachment errored when the upload throws, leaving it without a url', async () => {
    uploadMediaAsset.mockImplementationOnce(async () => {
      throw new Error('bucket unavailable');
    });
    const { result } = renderController();

    act(() => {
      result.current.add([makeFile('shot.png', 'image/png', 10)]);
    });

    await waitFor(() => expect(result.current.files[0]?.status).toBe('error'));
    expect(result.current.files[0]?.error).toBe('bucket unavailable');
    expect(result.current.files[0]?.url).toBeUndefined();
  });

  it('retries a failed Library upload using the retained File handle', async () => {
    uploadMediaAsset.mockImplementationOnce(async () => {
      throw new Error('bucket unavailable');
    });
    const { result } = renderController();

    act(() => {
      result.current.add([makeFile('shot.png', 'image/png', 10)]);
    });
    await waitFor(() => expect(result.current.files[0]?.status).toBe('error'));

    const id = result.current.files[0]?.id as string;
    await act(async () => {
      await result.current.retry(id);
    });
    await waitFor(() => expect(result.current.files[0]?.status).toBe('ready'));
    expect(result.current.files[0]?.assetId).toBe('asset-9');
    expect(uploadMediaAsset).toHaveBeenCalledTimes(2);
  });

  it('removes and clears attachments', async () => {
    const { result } = renderController();

    act(() => {
      result.current.add([makeFile('a.png', 'image/png', 10), makeFile('b.png', 'image/png', 10)]);
    });
    await waitFor(() => expect(result.current.files).toHaveLength(2));

    act(() => {
      result.current.remove(result.current.files[0]?.id as string);
    });
    expect(result.current.files).toHaveLength(1);

    act(() => {
      result.current.clear();
    });
    expect(result.current.files).toHaveLength(0);
  });

  it('errors without uploading when no brand is selected', () => {
    const { result } = renderHook(() =>
      useChatAttachments({ brandId: null, sessionId: 'session-1' }),
    );

    act(() => {
      result.current.add([makeFile('shot.png', 'image/png', 10)]);
    });

    expect(result.current.files[0]?.status).toBe('error');
    expect(uploadMediaAsset).not.toHaveBeenCalled();
  });
});
