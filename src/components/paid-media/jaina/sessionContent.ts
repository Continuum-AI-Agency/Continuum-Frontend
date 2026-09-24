import type { AgentMentionReference, AgentMentionSuggestion } from '@/lib/agent-references';
import type { JainaChatMessage } from './types';

const LABEL_MAX = 48;

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat;
}

/**
 * The creatives Jaina generated in this session, newest first, as `media_asset` chips. Only a
 * creative with an `asset_id` is listed: that id is what the Backend resolves back to the real
 * pixels (resolveLibraryMediaContext), whereas a Meta-CDN creative has nothing of ours to point at.
 */
export function jainaSessionContent(
  messages: readonly JainaChatMessage[],
): AgentMentionSuggestion[] {
  const byAsset = new Map<string, AgentMentionSuggestion>();
  let ordinal = 0;
  for (const message of messages) {
    for (const creative of message.artifacts?.creatives ?? []) {
      ordinal += 1;
      const assetId = creative.asset_id;
      if (!assetId) continue;
      const kind = creative.format === 'video' ? 'video' : 'image';
      const copy = creative.headline || creative.post_copy || creative.description;
      const label = copy ? shorten(copy) : `Creative ${ordinal}`;
      // Folded into the sent metadata by PromptInput, so never a data: URL.
      const previewUrl = [creative.thumbnail_url, creative.url].find((url) =>
        /^https?:\/\//.test(url ?? ''),
      );
      const reference = {
        id: assetId,
        type: 'media_asset',
        label,
        source: 'jaina',
        metadata: {
          assetId,
          kind,
          ...(previewUrl ? { previewUrl, previewKind: kind } : {}),
          ...(copy ? { description: copy.slice(0, 240) } : {}),
        },
      } satisfies AgentMentionReference;
      byAsset.delete(assetId);
      byAsset.set(assetId, {
        key: `media_asset:${assetId}`,
        label,
        type: 'media_asset',
        source: 'jaina',
        group: 'This session',
        description: [creative.platform, creative.format].filter(Boolean).join(' · '),
        reference,
        // A video's thumbnail is a still, so it previews as an image.
        preview: { url: previewUrl, kind: previewUrl === creative.thumbnail_url ? 'image' : kind },
      });
    }
  }
  return [...byAsset.values()].reverse();
}
