'use client';

import { Pencil2Icon, ReloadIcon, StopIcon } from '@radix-ui/react-icons';
import Image from 'next/image';
import React from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import type { StreamState } from '@/lib/types/chatImage';

type PreviewPaneProps = {
  brandName: string;
  streamState: StreamState;
  onCancel?: () => void;
  onReset?: () => void;
  onMarkup?: () => void;
  canMarkup?: boolean;
};

export function PreviewPane({
  brandName,
  streamState,
  onCancel,
  onReset,
  onMarkup,
  canMarkup,
}: PreviewPaneProps) {
  return (
    <div
      className="relative flex h-full min-h-[480px] flex-col overflow-hidden rounded-xl p-3 shadow-2xl"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--gray-6)',
        color: 'var(--gray-12)',
      }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <span className="font-medium">Preview for {brandName}</span>
          <div className="text-xs text-gray-400">
            {streamState.status === 'streaming' ? 'Streaming' : 'Idle'}
          </div>
        </div>
        <div className="flex gap-2">
          <Pill
            variant={
              streamState.status === 'streaming'
                ? 'teal'
                : streamState.status === 'error'
                  ? 'destructive'
                  : 'success'
            }
          >
            {streamState.status}
          </Pill>
          {canMarkup ? (
            <Button size="sm" variant="outline" onClick={onMarkup}>
              <Pencil2Icon /> Markup
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onReset}>
            <ReloadIcon /> Reset
          </Button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl"
        style={{
          background:
            streamState.videoUrl || streamState.currentBase64 || streamState.posterBase64
              ? 'transparent'
              : 'radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--accent-9), transparent 80%), transparent 35%), ' +
                'radial-gradient(circle at 80% 10%, color-mix(in srgb, var(--accent-10), transparent 82%), transparent 30%), var(--color-panel)',
          minHeight: 320,
          height: '1200px',
          maxHeight: '100vh',
        }}
      >
        {streamState.videoUrl ? (
          // biome-ignore lint/a11y/useMediaCaption: pre-existing user-generated artifact preview; no caption track exists, out of scope for this styling swap.
          <video
            src={streamState.videoUrl}
            controls
            playsInline
            key={streamState.videoUrl}
            poster={
              streamState.posterBase64
                ? `data:image/png;base64,${streamState.posterBase64}`
                : undefined
            }
            className="absolute inset-0 h-full w-full object-contain transition duration-200"
          />
        ) : streamState.currentBase64 || streamState.posterBase64 ? (
          <Image
            src={`data:image/png;base64,${streamState.currentBase64 ?? streamState.posterBase64}`}
            alt="Current preview"
            fill
            unoptimized
            sizes="100vw"
            className="!object-contain transition duration-200"
            priority
          />
        ) : (
          <span className="text-gray-400">Drop a prompt and generate to see preview.</span>
        )}

        {streamState.status === 'streaming' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <span className="mb-2">Streaming… {streamState.progressPct ?? 0}%</span>
            <div className="h-2 w-64 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-indigo-400 to-blue-400"
                style={{ width: `${Math.min(streamState.progressPct ?? 0, 100)}%` }}
              />
            </div>
            <Button
              variant="outline"
              className="mt-3 border-destructive text-destructive hover:text-destructive"
              onClick={onCancel}
            >
              <StopIcon /> Cancel
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
