import { describe, expect, it } from 'bun:test';
import { agentAttachmentSchema } from './agent-references';

describe('agentAttachmentSchema', () => {
  it('accepts a Library-backed attachment with durable asset identity', () => {
    const parsed = agentAttachmentSchema.parse({
      assetId: 'asset-123',
      versionId: 'version-456',
      url: 'https://signed.example/image.png',
      name: 'image.png',
      mediaType: 'image/png',
      storagePath: 'brand-1/assets/asset-123/image.png',
    });

    expect(parsed.assetId).toBe('asset-123');
    expect(parsed.versionId).toBe('version-456');
  });

  it('keeps legacy URL-only transcript attachments readable', () => {
    expect(
      agentAttachmentSchema.safeParse({
        url: 'https://signed.example/legacy.png',
        name: 'legacy.png',
      }).success,
    ).toBe(true);
  });
});
