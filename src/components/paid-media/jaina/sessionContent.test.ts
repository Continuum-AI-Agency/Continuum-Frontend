import { describe, expect, it } from 'bun:test';
import { agentMentionReferenceSchema } from '@/lib/agent-references';
import type { CreativeArtifact } from '@/lib/jaina/schemas';
import { jainaSessionContent } from './sessionContent';
import type { JainaChatMessage } from './types';

function turn(id: string, creatives: Partial<CreativeArtifact>[]): JainaChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    createdAt: '2026-09-24T00:00:00Z',
    artifacts: {
      creatives: creatives.map((creative, index) => ({
        id: `${id}-${index}`,
        type: 'creative',
        url: `https://cdn/${id}-${index}.png`,
        ...creative,
      })),
    },
  };
}

describe('jainaSessionContent', () => {
  it('lists creatives we can point at, newest first, as media_asset references keyed by asset_id', () => {
    const items = jainaSessionContent([
      turn('a', [{ asset_id: 'asset-1', headline: 'Summer sale' }, { headline: 'Meta CDN only' }]),
      { id: 'u', role: 'user', content: 'again', createdAt: '2026-09-24T00:00:01Z' },
      turn('b', [{ asset_id: 'asset-2', format: 'video', thumbnail_url: 'https://cdn/thumb.jpg' }]),
    ]);

    expect(items.map((item) => item.key)).toEqual(['media_asset:asset-2', 'media_asset:asset-1']);
    expect(items[0]?.label).toBe('Creative 3');
    expect(items[0]?.preview).toEqual({ url: 'https://cdn/thumb.jpg', kind: 'image' });
    expect(items[0]?.reference?.metadata?.kind).toBe('video');
    expect(items[1]?.label).toBe('Summer sale');
    for (const item of items) {
      const reference = agentMentionReferenceSchema.parse(item.reference);
      expect(reference.id).toBe(String(reference.metadata?.assetId));
    }
  });

  it('shows a re-emitted creative once', () => {
    const items = jainaSessionContent([
      turn('a', [{ asset_id: 'asset-1' }]),
      turn('b', [{ asset_id: 'asset-1', headline: 'Final' }]),
    ]);
    expect(items.map((item) => item.label)).toEqual(['Final']);
  });
});
