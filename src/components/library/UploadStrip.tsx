'use client';

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUp,
  Clock,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { UploadItem, UploadMoveDirection } from './useMediaUpload';

type Props = {
  uploads: UploadItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  // Reordering only matters while something is still waiting; omit to hide it.
  onMove?: (id: string, direction: UploadMoveDirection) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function UploadStrip({ uploads, onPause, onResume, onRetry, onCancel, onMove }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
    >
      {uploads.map((u, index) => (
        <div
          key={u.id}
          data-testid="upload-item"
          data-status={u.status}
          data-upload-name={u.name}
          className={cn(
            'min-w-0 rounded-lg border px-3 py-2 text-xs',
            (u.status === 'uploading' || u.status === 'queued') &&
              'border-border/60 bg-muted/50 text-muted-foreground',
            u.status === 'paused' &&
              'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
            u.status === 'done' &&
              'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            u.status === 'error' &&
              'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
          )}
          title={u.status === 'error' ? u.error : u.name}
        >
          <div className="flex min-w-0 items-center gap-2">
            {u.status === 'queued' && <Clock className="size-3.5 shrink-0" />}
            {u.status === 'uploading' && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
            {u.status === 'paused' && <Pause className="size-3.5 shrink-0" />}
            {u.status === 'done' && <Check className="size-3.5 shrink-0" />}
            {u.status === 'error' && <AlertCircle className="size-3.5 shrink-0" />}
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{u.name}</span>
            <span className="shrink-0 tabular-nums">{u.progress}%</span>
            {onMove && u.status !== 'done' && u.status !== 'uploading' ? (
              <>
                <UploadAction
                  testId="upload-move-top"
                  label={`Upload ${u.name} next`}
                  disabled={index === 0}
                  onClick={() => onMove(u.id, 'top')}
                >
                  <ChevronsUp className="size-3.5" />
                </UploadAction>
                <UploadAction
                  testId="upload-move-up"
                  label={`Move ${u.name} up`}
                  disabled={index === 0}
                  onClick={() => onMove(u.id, 'up')}
                >
                  <ArrowUp className="size-3.5" />
                </UploadAction>
                <UploadAction
                  testId="upload-move-down"
                  label={`Move ${u.name} down`}
                  disabled={index === uploads.length - 1}
                  onClick={() => onMove(u.id, 'down')}
                >
                  <ArrowDown className="size-3.5" />
                </UploadAction>
              </>
            ) : null}
            {u.status === 'uploading' ? (
              <UploadAction
                testId="upload-pause"
                label={`Pause ${u.name}`}
                onClick={() => onPause(u.id)}
              >
                <Pause className="size-3.5" />
              </UploadAction>
            ) : null}
            {u.status === 'paused' ? (
              <UploadAction
                testId="upload-resume"
                label={`Resume ${u.name}`}
                onClick={() => onResume(u.id)}
              >
                <Play className="size-3.5" />
              </UploadAction>
            ) : null}
            {u.status === 'error' ? (
              <UploadAction
                testId="upload-retry"
                label={`Retry ${u.name}`}
                onClick={() => onRetry(u.id)}
              >
                <RotateCcw className="size-3.5" />
              </UploadAction>
            ) : null}
            {u.status !== 'done' ? (
              <UploadAction
                testId="upload-cancel"
                label={`Cancel ${u.name}`}
                onClick={() => onCancel(u.id)}
              >
                <X className="size-3.5" />
              </UploadAction>
            ) : null}
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-background/70">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-200',
                u.status === 'error' ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${u.progress}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-2xs text-muted-foreground">
            <span>{formatSize(u.sizeBytes)}</span>
            <span className="capitalize">{u.status}</span>
          </div>
          {u.error ? (
            <p data-testid="upload-error" className="mt-1 text-2xs leading-tight">
              {u.error}
            </p>
          ) : null}
        </div>
      ))}
    </motion.div>
  );
}

function UploadAction({
  testId,
  label,
  onClick,
  disabled,
  children,
}: {
  testId: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
