'use client';
import { CircleCheck, CircleX, RotateCw, TriangleAlert } from 'lucide-react';

import React from 'react';
import {
  type CanvasConnectionState,
  deriveCanvasConnectionState,
  type RealtimeStatus,
} from './canvasConnectionState';

interface CanvasSyncStatusProps {
  status: RealtimeStatus;
  dbStatus: RealtimeStatus;
  isSaving: boolean;
  isCollaborative?: boolean;
  roomsLoading?: boolean;
  hasRoom?: boolean;
}

const PILL = 'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border';

export function CanvasSyncStatus({
  status,
  dbStatus,
  isSaving,
  isCollaborative = false,
  roomsLoading = false,
  hasRoom = true,
}: CanvasSyncStatusProps) {
  const state: CanvasConnectionState = deriveCanvasConnectionState({
    roomsLoading,
    hasRoom,
    status,
    dbStatus,
    isSaving,
    isCollaborative,
  });

  switch (state) {
    case 'workspace-loading':
      return (
        <div
          className={`${PILL} bg-muted text-muted-foreground border-border`}
          title="Loading your workspace…"
        >
          <RotateCw className="w-3.5 h-3.5 animate-spin opacity-70" />
          <span>Loading workspace...</span>
        </div>
      );

    case 'idle':
      return (
        <div
          className={`${PILL} bg-muted text-muted-foreground border-border`}
          title="No workspace open yet."
        >
          <CircleCheck className="w-3.5 h-3.5" />
          <span>Ready</span>
        </div>
      );

    case 'sync-error':
      return (
        <div
          className={`${PILL} bg-red-500/10 text-red-600 border-red-500/20`}
          title="Database sync failed. Reload to retry."
        >
          <CircleX className="w-3.5 h-3.5" />
          <span>Sync Error</span>
        </div>
      );

    case 'live-disconnected':
      return (
        <div
          className={`${PILL} bg-amber-500/10 text-amber-600 border-amber-500/20`}
          title="Presence disconnected. cursors may lag."
        >
          <TriangleAlert className="w-3.5 h-3.5" />
          <span>Live Disconnected</span>
        </div>
      );

    case 'saving':
      return (
        <div className={`${PILL} bg-blue-500/10 text-blue-600 border-blue-500/20`}>
          <RotateCw className="w-3.5 h-3.5 animate-spin" />
          <span>Saving...</span>
        </div>
      );

    case 'saved-locally':
      return (
        <div
          className={`${PILL} bg-muted text-muted-foreground border-border`}
          title="Offline — your work is saved locally and syncs when you reconnect."
        >
          <CircleCheck className="w-3.5 h-3.5" />
          <span>Saved locally</span>
        </div>
      );

    case 'connecting':
      return (
        <div className={`${PILL} bg-amber-500/10 text-amber-600 border-amber-500/20`}>
          <RotateCw className="w-3.5 h-3.5 animate-spin" />
          <span>Connecting...</span>
        </div>
      );

    default:
      return (
        <div className={`${PILL} bg-green-500/10 text-green-600 border-green-500/20`}>
          <CircleCheck className="w-3.5 h-3.5" />
          <span>Saved</span>
        </div>
      );
  }
}
