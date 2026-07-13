'use client';

import { BookmarkIcon, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker';
import { MessageScrollerItem } from '@/components/ui/message-scroller';
import { cn } from '@/lib/utils';

export type ChatMarkerKind = 'milestone' | 'status' | 'session';

type ChatMarkerProps = {
  kind: ChatMarkerKind;
  label: string;
  icon?: ReactNode;
  // Present when the marker is itself a navigation target, which is what makes a milestone
  // reachable from the minimap. Status lines are transient and never anchored.
  id?: string;
  className?: string;
};

export function ChatMarker({ kind, label, icon, id, className }: ChatMarkerProps) {
  const isStatus = kind === 'status';

  const marker = (
    <Marker
      variant={isStatus ? 'default' : 'separator'}
      role={isStatus ? 'status' : undefined}
      className={cn(isStatus && 'animate-pulse', className)}
    >
      <MarkerIcon>
        {icon ?? (isStatus ? <Loader2 className="animate-spin" /> : <BookmarkIcon />)}
      </MarkerIcon>
      <MarkerContent>{label}</MarkerContent>
    </Marker>
  );

  if (!id) {
    return marker;
  }

  return (
    <MessageScrollerItem messageId={id} scrollAnchor>
      {marker}
    </MessageScrollerItem>
  );
}
