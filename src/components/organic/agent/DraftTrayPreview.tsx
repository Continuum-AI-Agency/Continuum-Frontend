'use client';

import { type ChatMediaRef, chatMediaRefKey } from '@continuum/contracts';
import { FileText } from 'lucide-react';
import { useMemo } from 'react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import type { AgentMentionSuggestion } from '@/lib/agent-references';
import { useChatMediaTiles } from '@/lib/media/chatMediaRefs';

/**
 * A session-tray tile's still, signed from the draft ref the way a chat strip is: a ≤480 px
 * still, never the original, and every tile the tray opens with in one POST. The URL the
 * session's frames carried is not trusted; it may have lapsed while it sat in history.
 */
export function DraftTrayPreview({
  brandId,
  item,
}: {
  brandId: string;
  item: AgentMentionSuggestion;
}) {
  const draftId = item.reference?.id;
  const refs = useMemo<ChatMediaRef[]>(
    () => (draftId ? [{ type: 'draft', draftId }] : []),
    [draftId],
  );
  const { tiles, recover } = useChatMediaTiles(brandId, refs);
  const tile = refs[0] ? tiles.get(chatMediaRefKey(refs[0])) : undefined;
  if (!tile?.thumbUrl) {
    return <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
  }
  return (
    <ChatMediaThumb
      media={{ id: tile.key, url: tile.thumbUrl, kind: 'image', name: item.label }}
      fallbackSeed={item.label}
      onRecover={() => recover(tile.key)}
    />
  );
}
