'use client';
import { CircleCheck, CircleX, RotateCw, TriangleAlert } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';

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
  const translateUi = useUiTranslations('studio');

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
          title={translateUi('loading_your_workspace_d7b46510')}
        >
          <RotateCw className="w-3.5 h-3.5 animate-spin opacity-70" />
          <span>{translateUi('loading_workspace_6fce2f5f')}</span>
        </div>
      );

    case 'idle':
      return (
        <div
          className={`${PILL} bg-muted text-muted-foreground border-border`}
          title={translateUi('no_workspace_open_yet_d5ee45a5')}
        >
          <CircleCheck className="w-3.5 h-3.5" />
          <span>{translateUi('ready_5fa7aac5')}</span>
        </div>
      );

    case 'sync-error':
      return (
        <div
          className={`${PILL} bg-red-500/10 text-red-600 border-red-500/20`}
          title={translateUi('database_sync_failed_reload_to_retr_916c8660')}
        >
          <CircleX className="w-3.5 h-3.5" />
          <span>{translateUi('sync_error_0cfdb0c8')}</span>
        </div>
      );

    case 'live-disconnected':
      return (
        <div
          className={`${PILL} bg-amber-500/10 text-amber-600 border-amber-500/20`}
          title={translateUi('presence_disconnected_cursors_may_l_173d1e22')}
        >
          <TriangleAlert className="w-3.5 h-3.5" />
          <span>{translateUi('live_disconnected_d480ffa7')}</span>
        </div>
      );

    case 'saving':
      return (
        <div className={`${PILL} bg-blue-500/10 text-blue-600 border-blue-500/20`}>
          <RotateCw className="w-3.5 h-3.5 animate-spin" />
          <span>{translateUi('saving_dc85af8f')}</span>
        </div>
      );

    case 'saved-locally':
      return (
        <div
          className={`${PILL} bg-muted text-muted-foreground border-border`}
          title={translateUi('offline_your_work_is_saved_locally__d52f8015')}
        >
          <CircleCheck className="w-3.5 h-3.5" />
          <span>{translateUi('saved_locally_ea2c9daa')}</span>
        </div>
      );

    case 'connecting':
      return (
        <div className={`${PILL} bg-amber-500/10 text-amber-600 border-amber-500/20`}>
          <RotateCw className="w-3.5 h-3.5 animate-spin" />
          <span>{translateUi('connecting_5f04ae9e')}</span>
        </div>
      );

    default:
      return (
        <div className={`${PILL} bg-green-500/10 text-green-600 border-green-500/20`}>
          <CircleCheck className="w-3.5 h-3.5" />
          <span>{translateUi('saved_b5c120b3')}</span>
        </div>
      );
  }
}
