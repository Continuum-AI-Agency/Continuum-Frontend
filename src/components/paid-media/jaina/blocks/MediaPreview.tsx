"use client";

import { useState, type ReactNode } from "react";
import type { MediaMapEntry } from "@/lib/jaina/schemas";

type MediaPreviewProps = {
  entry: MediaMapEntry;
  children: ReactNode;
};

export function MediaPreview({ entry, children }: MediaPreviewProps) {
  const [visible, setVisible] = useState(false);
  const src = entry.thumbnail_url ?? entry.image_url;

  return (
    <span
      className="relative inline-block cursor-pointer border-b border-dashed border-primary/40 text-primary/90 transition-colors hover:text-primary"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && src ? (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-border/60 bg-popover p-1 shadow-lg">
          <img
            src={src}
            alt={`${entry.entity_type} ${entry.entity_id}`}
            className="block h-auto max-h-40 w-auto max-w-48 rounded-md object-contain"
            loading="lazy"
          />
        </span>
      ) : null}
    </span>
  );
}
