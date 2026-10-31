'use client';

// A pending edit to a live campaign, at chat size: the same Read pieces and the same campaign
// model the companion pane draws (option 27), compact — changes first, the budget before →
// after, and "Open in canvas". Approving stays on the approval card below it.

import type { LiveChangePreviewPayload } from '@continuum/contracts';
import * as React from 'react';
import { campaignViewFromLiveChange } from '@/lib/campaign-canvas/lectura';
import { LecturaView } from './LecturaView';

export function LiveChangeChatCard({
  preview,
  onOpen,
}: {
  preview: LiveChangePreviewPayload;
  /** Absent where no canvas sits beside the chat: the card then only reads. */
  onOpen?: () => void;
}) {
  const model = React.useMemo(() => campaignViewFromLiveChange(preview), [preview]);
  return <LecturaView size="chat" model={model} title={preview.subject} onOpen={onOpen} />;
}
