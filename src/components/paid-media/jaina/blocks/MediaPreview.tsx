'use client';

import { type ReactNode, useState } from 'react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromJainaMediaEntry } from '@/components/chat/media/media';
import type { MediaMapEntry } from '@/lib/jaina/schemas';

type MediaPreviewProps = {
  entry: MediaMapEntry;
  children: ReactNode;
};

export function MediaPreview({ entry, children }: MediaPreviewProps) {
  const [visible, setVisible] = useState(false);
  // A media-map entry carries no brand/account context, so an expired URL
  // degrades to the branded fallback tile (no re-resolve path from here).
  const media = mediaFromJainaMediaEntry(entry);

  return (
    <button
      type="button"
      aria-label={`Preview ${entry.entity_type} ${entry.entity_id}`}
      className="relative inline-block cursor-pointer border-b border-dashed border-primary/40 bg-transparent p-0 text-left font-[inherit] text-[length:inherit] text-primary/90 transition-colors hover:text-primary"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && media ? (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-border/60 bg-popover p-1 shadow-lg">
          <span className="relative block h-40 w-40 overflow-hidden rounded-md">
            <ChatMediaThumb media={media} fallbackSeed={entry.entity_type} />
          </span>
        </span>
      ) : null}
    </button>
  );
}
