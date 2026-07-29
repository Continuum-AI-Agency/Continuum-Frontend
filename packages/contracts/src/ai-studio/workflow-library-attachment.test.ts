import { describe, expect, it } from 'bun:test';
import { workflowEditOpSchema } from './workflow-builder';

describe('workflowEditOpSchema Library attachments', () => {
  it('accepts a stable Library attachment without exposing storage coordinates', () => {
    expect(
      workflowEditOpSchema.parse({
        op: 'attach_library_asset',
        id: 'reference-image',
        asset_id: '11111111-1111-4111-8111-111111111111',
        version_id: '22222222-2222-4222-8222-222222222222',
      }),
    ).toEqual({
      op: 'attach_library_asset',
      id: 'reference-image',
      asset_id: '11111111-1111-4111-8111-111111111111',
      version_id: '22222222-2222-4222-8222-222222222222',
    });
  });
});
