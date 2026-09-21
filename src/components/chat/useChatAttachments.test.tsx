import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';

const uploadMediaAsset = mock(async () => ({
  assetId: 'asset-9',
  versionId: 'version-9',
  storagePath: 'brand-1/assets/asset-9/shot.png',
  signedUrl: 'https://signed.example/shot.png',
  thumbnailPath: null,
  previewState: 'ready' as const,
}));

const uploadEphemeralChatDocument = mock(async () => ({
  documentId: 'document-1',
  storagePath: 'brand-1/document-1/v1/pasted-text.txt',
  name: 'pasted-text.txt',
  expiresAt: '2026-10-01T00:00:00.000Z',
}));

let documentRows: Record<string, unknown>[] = [];
const selectDocumentRows = mock(async () => ({ data: documentRows, error: null }));
const selectDocuments = mock(() => ({ in: selectDocumentRows }));
const fromDocuments = mock(() => ({ select: selectDocuments }));
const schemaDocuments = mock(() => ({ from: fromDocuments }));

type RealtimeSubscription = {
  bindings: Array<{ onRow: (row: Record<string, unknown>) => void }>;
  onSubscribed?: () => void | Promise<void>;
};
let realtimeSubscription: RealtimeSubscription | null = null;
const subscribeToPostgresChanges = mock((subscription: RealtimeSubscription) => {
  realtimeSubscription = subscription;
  return () => {};
});

mock.module('@/lib/library/uploadMediaAsset', () => ({ uploadMediaAsset }));
mock.module('@/lib/documents/uploadEphemeralChatDocument', () => ({
  uploadEphemeralChatDocument,
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ schema: schemaDocuments }),
}));
mock.module('@/lib/supabase/realtime', () => ({ subscribeToPostgresChanges }));
// The stale window is shortened so the timeout test does not take two minutes. 100ms left
// no slack at all — the whole render/effect cycle had to finish inside ~40ms or the
// heartbeat landed after the deadline it was meant to push back, which made the test fail
// about four runs in five on a loaded machine. 900ms keeps it sub-two-seconds with 300ms of
// slack on either side of every checkpoint.
mock.module('@/components/documents/useDocuments', () => ({ STALE_PROCESSING_MS: 900 }));

const { MAX_ATTACHMENT_BYTES, useChatAttachments } = await import('./useChatAttachments');

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

// The controller now raises the ephemeral-document notice itself, so it needs the real
// toast provider rather than each of the three chat surfaces duplicating that logic.
const withToast = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

function renderController() {
  return renderHook(() => useChatAttachments({ brandId: 'brand-1', sessionId: 'session-1' }), {
    wrapper: withToast,
  });
}

describe('useChatAttachments', () => {
  beforeEach(() => {
    uploadMediaAsset.mockClear();
    uploadEphemeralChatDocument.mockClear();
    selectDocumentRows.mockClear();
    documentRows = [];
    realtimeSubscription = null;
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

    const [params] = uploadMediaAsset.mock.calls[0] as unknown as [{ brandId: string; file: File }];
    expect(params.brandId).toBe('brand-1');
    expect(params.file.name).toBe('shot.png');
  });

  it('adds pasted text as ready inline context without upload or indexing', () => {
    const { result } = renderController();

    act(() => {
      result.current.addInlineText('First line\nSecond line');
    });

    expect(result.current.files).toEqual([
      expect.objectContaining({
        kind: 'inline-text',
        name: 'pasted-text.txt',
        type: 'text/plain',
        status: 'ready',
        text: 'First line\nSecond line',
      }),
    ]);
    expect(result.current.isUploading).toBe(false);
    expect(uploadMediaAsset).not.toHaveBeenCalled();
    expect(uploadEphemeralChatDocument).not.toHaveBeenCalled();
    expect(realtimeSubscription).toBeNull();
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

  it('backfills a document that finished indexing before realtime subscribed', async () => {
    documentRows = [
      {
        id: 'document-1',
        status: 'ready',
        progress_step: 'ready',
        error_message: null,
        updated_at: '2026-09-17T18:20:00.000Z',
      },
    ];
    const { result } = renderController();

    act(() => {
      result.current.add([makeFile('pasted-text.txt', 'text/plain', 2048)]);
    });
    await waitFor(() => expect(result.current.files[0]?.status).toBe('indexing'));
    expect(realtimeSubscription).not.toBeNull();

    await act(async () => {
      await realtimeSubscription?.onSubscribed?.();
    });

    expect(result.current.files[0]?.status).toBe('ready');
    expect(result.current.isUploading).toBe(false);
  });

  it('surfaces a document error that landed before realtime subscribed', async () => {
    documentRows = [
      {
        id: 'document-1',
        status: 'error',
        progress_step: 'error',
        error_message: 'Text extraction failed',
        updated_at: '2026-09-17T18:20:00.000Z',
      },
    ];
    const { result } = renderController();

    act(() => {
      result.current.add([makeFile('pasted-text.txt', 'text/plain', 2048)]);
    });
    await waitFor(() => expect(result.current.files[0]?.status).toBe('indexing'));

    await act(async () => {
      await realtimeSubscription?.onSubscribed?.();
    });

    expect(result.current.files[0]?.status).toBe('error');
    expect(result.current.files[0]?.error).toBe('Text extraction failed');
    expect(result.current.hasErrors).toBe(true);
  });

  it('measures an indexing timeout from the latest server progress heartbeat', async () => {
    const { result } = renderController();

    act(() => {
      result.current.add([makeFile('pasted-text.txt', 'text/plain', 2048)]);
    });
    await waitFor(() => expect(result.current.files[0]?.status).toBe('indexing'));
    expect(realtimeSubscription).not.toBeNull();

    // A progress heartbeat two thirds of the way through the window pushes the deadline out
    // by a fresh full window.
    await new Promise((resolve) => setTimeout(resolve, 600));
    act(() => {
      realtimeSubscription?.bindings[0]?.onRow({
        id: 'document-1',
        status: 'processing',
        progress_step: 'embedding',
        updated_at: new Date().toISOString(),
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Past the ORIGINAL deadline (900ms) and still indexing — which only holds because the
    // heartbeat moved it. Without it this would already read 'error'.
    expect(result.current.files[0]?.status).toBe('indexing');
    await waitFor(() => expect(result.current.files[0]?.status).toBe('error'), { timeout: 900 });
    expect(result.current.files[0]?.error).toBe('Indexing timed out');
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
    const { result } = renderHook(
      () => useChatAttachments({ brandId: null, sessionId: 'session-1' }),
      { wrapper: withToast },
    );

    act(() => {
      result.current.add([makeFile('shot.png', 'image/png', 10)]);
    });

    expect(result.current.files[0]?.status).toBe('error');
    expect(uploadMediaAsset).not.toHaveBeenCalled();
  });
});
