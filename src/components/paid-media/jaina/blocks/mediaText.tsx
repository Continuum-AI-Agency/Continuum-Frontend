"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MediaMap } from "@/lib/jaina/schemas";
import { MediaPreview } from "./MediaPreview";

const MediaMapContext = createContext<MediaMap>({});

export function MediaMapProvider({
  mediaMap,
  children,
}: {
  mediaMap: MediaMap;
  children: ReactNode;
}) {
  return (
    <MediaMapContext.Provider value={mediaMap}>
      {children}
    </MediaMapContext.Provider>
  );
}

export function useMediaMap(): MediaMap {
  return useContext(MediaMapContext);
}

export function processMediaText(
  text: string,
  mediaMap: MediaMap,
): ReactNode[] {
  const keys = Object.keys(mediaMap);
  if (keys.length === 0) return [text];

  const pattern = new RegExp(`(${keys.map(escapeRegExp).join("|")})`, "g");
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const entry = mediaMap[part];
    if (entry) {
      return (
        <MediaPreview key={`${part}-${index}`} entry={entry}>
          {part}
        </MediaPreview>
      );
    }
    return part;
  });
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function MediaText({ children }: { children: string }) {
  const mediaMap = useMediaMap();
  const keys = Object.keys(mediaMap);
  if (keys.length === 0) return <>{children}</>;
  return <>{processMediaText(children, mediaMap)}</>;
}
