'use client';

import { Circle, type LucideIcon, Mic, Monitor, Square, Video } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useMemo as useUiConfigMemo } from 'react';
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
import { useUiErrorMessage } from '@/i18n/errors';
import { isRecordingSupported, type RecordingSource, useMediaRecorder } from './useMediaRecorder';

export type { RecordingSource } from './useMediaRecorder';

function useLocalSourcesMessages() {
  const translateConfig = useUiTranslations('studio');
  return useUiConfigMemo(() => {
    const value: ReadonlyArray<{
      source: RecordingSource;
      label: string;
      icon: LucideIcon;
    }> = [
      {
        source: 'screen',
        label: translateConfig('screen_6e56137e'),
        icon: Monitor,
      },
      {
        source: 'camera',
        label: translateConfig('camera_03494b0d'),
        icon: Video,
      },
      {
        source: 'mic',
        label: translateConfig('voice_over_mic_cfea5bf5'),
        icon: Mic,
      },
    ];
    return value;
  }, [translateConfig]);
}

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
  const SOURCES = useLocalSourcesMessages();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');

  const { show } = useToast();
  const { state, elapsedSec, start, stop } = useMediaRecorder(onRecorded);
  const supported = isRecordingSupported();

  const begin = (source: RecordingSource) => {
    start(source).catch((cause: unknown) => {
      const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
      show({
        title: denied
          ? translateUi('recording_cancelled_f77093b3')
          : translateUi('could_not_start_recording_290853e8'),
        description: denied
          ? translateUi('permission_was_denied_or_the_picker_09c8bd32')
          : uiErrorText(cause),
        variant: 'warning',
      });
    });
  };

  if (state === 'recording') {
    return (
      <div className="flex h-7 items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 pr-0.5 pl-2.5 text-xs">
        <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden />
        <span className="tabular-nums">{formatElapsed(elapsedSec)}</span>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={translateUi('stop_recording_3d591e82')}
          onClick={stop}
        >
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
                  {state === 'starting'
                    ? translateUi('starting_bbe5fc3b')
                    : translateUi('record_bfdd5106')}
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom">
          {translateUi('record_screen_camera_or_voice_over_f2283bbb')}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent className="w-48">
        <DropdownMenuGroup>
          {!supported && (
            <DropdownMenuLabel>
              {translateUi('recording_isn_t_supported_in_this_b_8799569b')}
            </DropdownMenuLabel>
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
