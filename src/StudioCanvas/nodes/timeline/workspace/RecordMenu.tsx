'use client';

import { Circle, type LucideIcon, Mic, Monitor, Square, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isRecordingSupported, type RecordingSource, useMediaRecorder } from './useMediaRecorder';

export type { RecordingSource } from './useMediaRecorder';

const SOURCES: ReadonlyArray<{ source: RecordingSource; label: string; icon: LucideIcon }> = [
  { source: 'screen', label: 'Screen', icon: Monitor },
  { source: 'camera', label: 'Camera', icon: Video },
  { source: 'mic', label: 'Voice-over (mic)', icon: Mic },
];

function formatElapsed(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  return `${String(minutes).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
}

export function RecordMenu({
  onRecorded,
  disabled = false,
}: {
  onRecorded: (file: File) => void | Promise<void>;
  disabled?: boolean;
}) {
  const { show } = useToast();
  const { state, elapsedSec, start, stop } = useMediaRecorder(onRecorded);
  const supported = isRecordingSupported();

  const begin = (source: RecordingSource) => {
    start(source).catch((cause: unknown) => {
      const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
      show({
        title: denied ? 'Recording cancelled' : 'Could not start recording',
        description: denied
          ? 'Permission was denied or the picker was closed.'
          : cause instanceof Error
            ? cause.message
            : 'The browser refused the recording device.',
        variant: 'warning',
      });
    });
  };

  if (state === 'recording') {
    return (
      <div className="flex h-7 items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 pr-0.5 pl-2.5 text-xs">
        <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden />
        <span className="tabular-nums">{formatElapsed(elapsedSec)}</span>
        <Button type="button" size="icon-xs" variant="ghost" aria-label="Stop recording" onClick={stop}>
          <Square className="fill-current" />
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled || state === 'starting'}
                >
                  <Circle data-icon="inline-start" className="fill-destructive text-destructive" />
                  {state === 'starting' ? 'Starting…' : 'Record'}
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom">Record screen, camera or voice-over</TooltipContent>
      </Tooltip>
      <DropdownMenuContent className="w-48">
        <DropdownMenuGroup>
          {!supported && (
            <DropdownMenuLabel>Recording isn&apos;t supported in this browser</DropdownMenuLabel>
          )}
          {SOURCES.map(({ source, label, icon: Icon }) => (
            <DropdownMenuItem key={source} disabled={!supported} onClick={() => begin(source)}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
