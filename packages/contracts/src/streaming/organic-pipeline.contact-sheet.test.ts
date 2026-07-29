import { describe, expect, it } from 'bun:test';
import { organicReelSceneAssetSchema, organicStoryboardPreviewSchema } from './organic-pipeline';

const panel = (over: Record<string, unknown> = {}) => ({
  role: 'hook',
  bucket: 'media',
  storagePath: 'organic/draft-1/preview/hook.png',
  storageUrl: 'https://example.test/signed',
  ...over,
});

const scene = (over: Record<string, unknown> = {}) => ({
  index: 0,
  role: 'hook' as const,
  prompt: 'Creator holds the jar',
  durationSec: 4,
  ...over,
});

describe('organicStoryboardPreviewSchema — contact sheet join key', () => {
  it('carries the scene index a panel belongs to', () => {
    const parsed = organicStoryboardPreviewSchema.parse(panel({ sceneIndex: 2 }));
    expect(parsed.sceneIndex).toBe(2);
  });

  // Panels persisted before the contact-sheet path existed have no scene to
  // point at, so the key has to stay optional or every old draft stops parsing.
  it('still parses a panel persisted without one', () => {
    expect(organicStoryboardPreviewSchema.parse(panel()).sceneIndex).toBeUndefined();
    expect(organicStoryboardPreviewSchema.parse(panel({ sceneIndex: null })).sceneIndex).toBeNull();
  });

  it('rejects a negative or fractional scene index', () => {
    expect(() => organicStoryboardPreviewSchema.parse(panel({ sceneIndex: -1 }))).toThrow();
    expect(() => organicStoryboardPreviewSchema.parse(panel({ sceneIndex: 1.5 }))).toThrow();
  });
});

describe('organicReelSceneAssetSchema — panel-to-panel frames', () => {
  const frame = { bucket: 'media', storagePath: 'organic/draft-1/preview/hook.png' };

  it('carries the panel a scene animates from and into', () => {
    const parsed = organicReelSceneAssetSchema.parse(
      scene({ firstFrame: frame, lastFrame: { ...frame, assetId: 'asset-9' } }),
    );
    expect(parsed.firstFrame?.storagePath).toBe(frame.storagePath);
    expect(parsed.lastFrame?.assetId).toBe('asset-9');
  });

  it('still parses a scene with no frames — the pre-contact-sheet shape', () => {
    const parsed = organicReelSceneAssetSchema.parse(scene());
    expect(parsed.firstFrame).toBeUndefined();
    expect(parsed.lastFrame).toBeUndefined();
  });

  // Durable coordinates only. A base64 blob here would bloat every placement
  // read and go stale; bytes are downloaded at realization time.
  it('requires durable storage coordinates on a frame', () => {
    expect(() => organicReelSceneAssetSchema.parse(scene({ firstFrame: {} }))).toThrow();
    expect(() =>
      organicReelSceneAssetSchema.parse(scene({ firstFrame: { ...frame, base64: 'AAAA' } })),
    ).toThrow();
  });
});
