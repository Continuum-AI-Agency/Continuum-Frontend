import { describe, expect, it } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { registerGeneratedAssetOperation } from './creativeOperations';

describe('registerGeneratedAssetOperation', () => {
  it('sends the complete provenance graph through the user-scoped Edge client', async () => {
    let invokedBody: unknown;
    const client = {
      functions: {
        invoke: async (_name: string, options: { body: unknown }) => {
          invokedBody = options.body;
          return {
            data: {
              assetId: '31111111-1111-4111-8111-111111111111',
              versionId: '41111111-1111-4111-8111-111111111111',
              lineageCount: 1,
              status: 'created',
            },
            error: null,
          };
        },
      },
    } as unknown as SupabaseClient;

    const result = await registerGeneratedAssetOperation(client, {
      brandId: '11111111-1111-4111-8111-111111111111',
      kind: 'image',
      bucket: 'brand-profile-assets',
      storagePath: '11111111-1111-4111-8111-111111111111/canvas/output.png',
      fileName: 'output.png',
      mimeType: 'image/png',
      source: 'canvas',
      operation: 'canvas_generation',
      originRef: { roomId: 'room-1' },
      sourceAssetIds: ['21111111-1111-4111-8111-111111111111'],
      idempotencyKey: 'canvas:room-1:output.png',
    });

    expect(invokedBody).toEqual(
      expect.objectContaining({
        action: 'register_generated_asset',
        sourceAssetIds: ['21111111-1111-4111-8111-111111111111'],
      }),
    );
    expect(result.lineageCount).toBe(1);
  });
});
