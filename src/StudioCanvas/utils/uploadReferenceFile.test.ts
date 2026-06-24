import { describe, it, expect, mock } from 'bun:test';
import { uploadReferenceFile, REFERENCE_UPLOAD_BUCKET } from './uploadReferenceFile';

const makeFile = () => new File([new Uint8Array([1, 2, 3])], 'ref.png', { type: 'image/png' });

describe('uploadReferenceFile', () => {
  it('drives processing -> ready and swaps the node to a signed URL', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const updateNodeData = mock((_id: string, data: Record<string, unknown>) => {
      updates.push(data);
    });
    const uploadAsset = mock(async () => ({
      assetId: 'asset-1',
      storagePath: 'brand/asset-1/ref.png',
      signedUrl: 'https://x.supabase.co/sign/ref.png?token=t',
    }));

    const result = await uploadReferenceFile(
      { nodeId: 'n1', file: makeFile(), brandId: 'brand-1', field: 'image' },
      { updateNodeData, uploadAsset },
    );

    expect(result).toEqual({
      signedUrl: 'https://x.supabase.co/sign/ref.png?token=t',
      storagePath: 'brand/asset-1/ref.png',
      bucket: REFERENCE_UPLOAD_BUCKET,
    });
    // first update marks processing and clears any prior error
    expect(updates[0]).toEqual({ referenceStatus: 'processing', referenceError: undefined });
    // final update carries the signed URL + storage pointers + ready
    expect(updates[1]).toMatchObject({
      image: 'https://x.supabase.co/sign/ref.png?token=t',
      sourcePath: 'brand/asset-1/ref.png',
      bucket: REFERENCE_UPLOAD_BUCKET,
      sourceUrl: 'https://x.supabase.co/sign/ref.png?token=t',
      referenceStatus: 'ready',
    });
  });

  it('sets the video field when field is video', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const updateNodeData = mock((_id: string, data: Record<string, unknown>) => updates.push(data));
    const uploadAsset = mock(async () => ({ assetId: 'a', storagePath: 'p/v.mp4', signedUrl: 'https://x/v.mp4?t=1' }));

    await uploadReferenceFile(
      { nodeId: 'n1', file: makeFile(), brandId: 'b', field: 'video' },
      { updateNodeData, uploadAsset },
    );

    expect(updates[1]).toMatchObject({ video: 'https://x/v.mp4?t=1', referenceStatus: 'ready' });
  });

  it('marks error with the server message and returns null when upload fails (base64 preview kept)', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const updateNodeData = mock((_id: string, data: Record<string, unknown>) => updates.push(data));
    const uploadAsset = mock(async () => {
      throw new Error('File exceeds 50 MB limit');
    });

    const result = await uploadReferenceFile(
      { nodeId: 'n1', file: makeFile(), brandId: 'b' },
      { updateNodeData, uploadAsset },
    );

    expect(result).toBeNull();
    expect(updates[0]).toEqual({ referenceStatus: 'processing', referenceError: undefined });
    expect(updates[1]).toEqual({ referenceStatus: 'error', referenceError: 'File exceeds 50 MB limit' });
  });
});
