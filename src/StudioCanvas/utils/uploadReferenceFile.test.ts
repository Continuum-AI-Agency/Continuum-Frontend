import { describe, expect, it, mock } from 'bun:test';
import type { StudioNode } from '../types';
import {
  REFERENCE_UPLOAD_BUCKET,
  stageAndUploadReferenceFile,
  uploadReferenceFile,
} from './uploadReferenceFile';
import { serializeWorkflowSnapshot } from './workflowSerialization';

const makeFile = () => new File([new Uint8Array([1, 2, 3])], 'ref.png', { type: 'image/png' });

describe('uploadReferenceFile', () => {
  it('keeps the base64 preview in memory until the durable upload settles', async () => {
    let resolveUpload:
      | ((value: {
          assetId: string;
          versionId: string;
          storagePath: string;
          signedUrl: string;
        }) => void)
      | undefined;
    const uploadAsset = mock(
      () =>
        new Promise<{
          assetId: string;
          versionId: string;
          storagePath: string;
          signedUrl: string;
        }>((resolve) => {
          resolveUpload = resolve;
        }),
    );
    let nodeData: Record<string, unknown> = {};
    const updateNodeData = mock((_id: string, patch: Record<string, unknown>) => {
      nodeData = { ...nodeData, ...patch };
    });
    let persistedData: Record<string, unknown> | undefined;
    const triggerSave = mock(() => {
      const snapshot = serializeWorkflowSnapshot(
        [
          {
            id: 'n1',
            type: 'image',
            position: { x: 0, y: 0 },
            data: nodeData,
          },
        ] as StudioNode[],
        [],
        'bezier',
      );
      persistedData = snapshot.nodes[0]?.data as Record<string, unknown>;
    });

    const pending = stageAndUploadReferenceFile(
      {
        nodeId: 'n1',
        file: makeFile(),
        brandId: 'brand-1',
        field: 'image',
        previewData: {
          image: 'data:image/png;base64,AQID',
          originalImage: 'data:image/png;base64,AQID',
          fileName: 'ref.png',
        },
      },
      { updateNodeData, triggerSave, uploadAsset },
    );

    expect(nodeData).toMatchObject({
      image: 'data:image/png;base64,AQID',
      originalImage: 'data:image/png;base64,AQID',
      fileName: 'ref.png',
      referenceStatus: 'processing',
    });
    expect(triggerSave).not.toHaveBeenCalled();

    resolveUpload?.({
      assetId: 'asset-1',
      versionId: '11111111-1111-4111-8111-111111111111',
      storagePath: 'brand-1/asset-1/ref.png',
      signedUrl: 'https://x.supabase.co/sign/ref.png?token=t',
    });
    await pending;

    expect(nodeData).toMatchObject({
      image: 'https://x.supabase.co/sign/ref.png?token=t',
      assetId: 'asset-1',
      assetVersionId: '11111111-1111-4111-8111-111111111111',
      sourcePath: 'brand-1/asset-1/ref.png',
      referenceStatus: 'ready',
    });
    expect(triggerSave).toHaveBeenCalledTimes(1);
    expect(persistedData).toMatchObject({
      image: 'https://x.supabase.co/sign/ref.png?token=t',
      assetId: 'asset-1',
      assetVersionId: '11111111-1111-4111-8111-111111111111',
      sourcePath: 'brand-1/asset-1/ref.png',
      referenceStatus: 'ready',
    });
  });

  it('drives processing -> ready and swaps the node to a signed URL', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const updateNodeData = mock((_id: string, data: Record<string, unknown>) => {
      updates.push(data);
    });
    const triggerSave = mock(() => {});
    const uploadAsset = mock(async () => ({
      assetId: 'asset-1',
      versionId: '11111111-1111-4111-8111-111111111111',
      storagePath: 'brand/asset-1/ref.png',
      signedUrl: 'https://x.supabase.co/sign/ref.png?token=t',
    }));

    const result = await uploadReferenceFile(
      { nodeId: 'n1', file: makeFile(), brandId: 'brand-1', field: 'image' },
      { updateNodeData, triggerSave, uploadAsset },
    );

    expect(result).toEqual({
      assetId: 'asset-1',
      assetVersionId: '11111111-1111-4111-8111-111111111111',
      signedUrl: 'https://x.supabase.co/sign/ref.png?token=t',
      storagePath: 'brand/asset-1/ref.png',
      bucket: REFERENCE_UPLOAD_BUCKET,
    });
    // first update marks processing and clears any prior error
    expect(updates[0]).toEqual({ referenceStatus: 'processing', referenceError: undefined });
    // final update carries the signed URL + storage pointers + ready
    expect(updates[1]).toMatchObject({
      image: 'https://x.supabase.co/sign/ref.png?token=t',
      assetId: 'asset-1',
      assetVersionId: '11111111-1111-4111-8111-111111111111',
      sourcePath: 'brand/asset-1/ref.png',
      bucket: REFERENCE_UPLOAD_BUCKET,
      sourceUrl: 'https://x.supabase.co/sign/ref.png?token=t',
      referenceStatus: 'ready',
    });
    expect(triggerSave).toHaveBeenCalledTimes(1);
  });

  it('keeps the library asset id the upload registered, so the reference stays traceable', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const updateNodeData = mock((_id: string, data: Record<string, unknown>) => {
      updates.push(data);
    });
    const uploadAsset = mock(async () => ({
      assetId: 'asset-1',
      versionId: '11111111-1111-4111-8111-111111111111',
      storagePath: 'brand/asset-1/ref.png',
      signedUrl: 'https://x.supabase.co/sign/ref.png?token=t',
    }));

    await uploadReferenceFile(
      { nodeId: 'n1', file: makeFile(), brandId: 'brand-1', field: 'image' },
      { updateNodeData, uploadAsset },
    );

    expect(updates[1].assetId).toBe('asset-1');
    expect(updates[1].assetVersionId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('sets the video field when field is video', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const updateNodeData = mock((_id: string, data: Record<string, unknown>) => updates.push(data));
    const uploadAsset = mock(async () => ({
      assetId: 'a',
      versionId: '22222222-2222-4222-8222-222222222222',
      storagePath: 'p/v.mp4',
      signedUrl: 'https://x/v.mp4?t=1',
    }));

    await uploadReferenceFile(
      { nodeId: 'n1', file: makeFile(), brandId: 'b', field: 'video' },
      { updateNodeData, uploadAsset },
    );

    expect(updates[1]).toMatchObject({ video: 'https://x/v.mp4?t=1', referenceStatus: 'ready' });
  });

  it('marks error with the server message and returns null when upload fails (base64 preview kept)', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const updateNodeData = mock((_id: string, data: Record<string, unknown>) => updates.push(data));
    const triggerSave = mock(() => {});
    const uploadAsset = mock(async () => {
      throw new Error('File exceeds 50 MB limit');
    });

    const result = await uploadReferenceFile(
      { nodeId: 'n1', file: makeFile(), brandId: 'b' },
      { updateNodeData, triggerSave, uploadAsset },
    );

    expect(result).toBeNull();
    expect(updates[0]).toEqual({ referenceStatus: 'processing', referenceError: undefined });
    expect(updates[1]).toEqual({
      referenceStatus: 'error',
      referenceError: 'File exceeds 50 MB limit',
    });
    expect(triggerSave).not.toHaveBeenCalled();
  });
});
