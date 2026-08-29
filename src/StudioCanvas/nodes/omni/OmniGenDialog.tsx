'use client';

/**
 * The Omni node's editor.
 *
 * The node itself is a launcher card: a 512x360 React Flow box could not hold a
 * prompt, a variation library and an instruction box at once, and what it did hold
 * was unusable — the prompt textarea only existed in the empty state, so once a
 * clip existed the prompt could never be edited again.
 *
 * Shape follows TimelineEditorDialog: a viewport-pinned dialog rather than a
 * centred modal, because a video preview beside a variation rail wants the room.
 * The dialog owns exactly one piece of state, the prompt draft; everything else
 * lives in the node so closing mid-turn loses nothing.
 */

import { Download, Loader2, Sparkles, Video, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { NodeVideoPreview } from '../../components/NodeVideoPreview';
import type { OmniGenNodeData, OmniVariation } from '../../types';

const PERSIST_DEBOUNCE_MS = 150;

const RESOLUTIONS: { value: NonNullable<OmniGenNodeData['resolution']>; label: string }[] = [
  { value: '360p', label: '360p — draft' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4K' },
];

export interface OmniGenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  aspectRatio: '16:9' | '9:16';
  resolution: NonNullable<OmniGenNodeData['resolution']>;
  videoTask: 'edit' | 'extend';
  /** Seeds the box on open. Only meaningful for a generate turn. */
  prompt: string;

  variations: readonly OmniVariation[];
  /** Resolved by the node, so the rail and the node preview can never disagree. */
  activeVariation?: OmniVariation;
  /** A clip wired into ref-video, if any. Absent hides the edit/extend control. */
  videoInput?: { label: string; previewUrl?: string };

  onAspectRatioChange: (value: '16:9' | '9:16') => void;
  onResolutionChange: (value: NonNullable<OmniGenNodeData['resolution']>) => void;
  onVideoTaskChange: (value: 'edit' | 'extend') => void;
  onPromptChange: (value: string) => void;
  onSelectVariation: (variation: OmniVariation) => void;
  onGenerate: (prompt: string) => Promise<void> | void;
  onSubmitTurn: (instruction: string) => Promise<void> | void;
  onDownload: () => void;
}

export function OmniGenDialog({
  open,
  onOpenChange,
  aspectRatio,
  resolution,
  videoTask,
  prompt,
  variations,
  activeVariation,
  videoInput,
  onAspectRatioChange,
  onResolutionChange,
  onVideoTaskChange,
  onPromptChange,
  onSelectVariation,
  onGenerate,
  onSubmitTurn,
  onDownload,
}: OmniGenDialogProps) {
  const [draft, setDraft] = useState('');

  const hasChain = variations.length > 0;
  // The in-flight flag is the optimistic pending variation itself, which lives in
  // the node. A local boolean would reset every time this dialog is reopened, and
  // the spinner would vanish while the turn was still running.
  const isTurnPending = useMemo(
    () => variations.some((variation) => variation.status === 'pending'),
    [variations],
  );
  // The preview shows the last FINISHED clip. Swapping it for a loader the moment a
  // turn starts takes away the very clip the instruction is describing.
  const lastDone = useMemo(
    () =>
      activeVariation?.status === 'done'
        ? activeVariation
        : [...variations].reverse().find((variation) => variation.status === 'done'),
    [activeVariation, variations],
  );
  const previewSrc = lastDone?.videoUrl ?? videoInput?.previewUrl;

  // Keyed off the last FINISHED clip, not the active one: while an edit is in flight
  // the active variation is the pending row, and reading that would flip the action
  // back to "Generate" mid-edit — one click from replacing the chain the user is
  // editing.
  const mode: 'generate' | 'turn' = lastDone ? 'turn' : 'generate';

  // Reset from the node only on the closed->open edge, so the dialog's own writes
  // never re-seed the box mid-edit (the LayerEditorDialog rule).
  const latestRef = useRef({ prompt, mode });
  latestRef.current = { prompt, mode };
  useEffect(() => {
    if (!open) return;
    setDraft(latestRef.current.mode === 'turn' ? '' : latestRef.current.prompt);
  }, [open]);

  // A generate draft is the node's prompt and is persisted. An instruction is
  // one-shot and must NOT overwrite it — that prompt is what the next Run re-sends.
  useEffect(() => {
    if (!open || mode !== 'generate') return;
    const timer = setTimeout(() => onPromptChange(draft), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, mode, open, onPromptChange]);

  const canSubmit = draft.trim().length > 0 && !isTurnPending;

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || isTurnPending) return;
    if (mode === 'turn') {
      void onSubmitTurn(text);
      setDraft('');
      return;
    }
    void onGenerate(text);
  }, [draft, isTurnPending, mode, onGenerate, onSubmitTurn]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="md:left-[var(--app-sidebar-width,3.5rem)]"
        className="left-4 right-4 top-4 bottom-4 z-50 flex h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-xl border border-border/60 p-0 shadow-2xl sm:max-w-none md:left-[calc(var(--app-sidebar-width,3.5rem)+1rem)]"
      >
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3 text-left">
          <div>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" /> Omni 1.1 Flash
            </DialogTitle>
            <DialogDescription className="text-xs">
              Describe a clip, then keep talking to edit, extend and sharpen it.
            </DialogDescription>
          </div>

          <div className="flex items-center gap-2">
            {videoInput ? (
              <>
                <span
                  className="max-w-40 truncate rounded-md border border-border/70 bg-muted px-2 py-1 text-2xs text-muted-foreground"
                  title={videoInput.label}
                >
                  Source: {videoInput.label}
                </span>
                <select
                  aria-label="What to do with the wired clip"
                  className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
                  value={videoTask}
                  disabled={hasChain}
                  onChange={(event) => onVideoTaskChange(event.target.value as 'edit' | 'extend')}
                >
                  <option value="edit">Edit clip</option>
                  <option value="extend">Extend clip</option>
                </select>
              </>
            ) : null}

            <select
              aria-label="Aspect ratio"
              className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
              value={aspectRatio}
              disabled={hasChain}
              title={hasChain ? 'Anchored to the ratio this chain started at' : undefined}
              onChange={(event) => onAspectRatioChange(event.target.value as '16:9' | '9:16')}
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
            </select>

            <select
              aria-label="Resolution"
              className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
              value={resolution}
              onChange={(event) =>
                onResolutionChange(event.target.value as NonNullable<OmniGenNodeData['resolution']>)
              }
            >
              {RESOLUTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <Button variant="ghost" size="sm" onClick={onDownload} disabled={!previewSrc}>
              <Download className="mr-1.5 h-4 w-4" /> Download
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          {hasChain ? (
            <aside className="flex w-40 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-border/60 p-2">
              {variations.map((variation, index) => {
                const isActive = variation.id === activeVariation?.id;
                return (
                  <button
                    type="button"
                    key={variation.id}
                    data-testid="omni-variation-tile"
                    // A pending or failed tile has nothing to switch to. The node
                    // guards this too; not firing a no-op click is the honest affordance.
                    disabled={variation.status !== 'done'}
                    onClick={() => onSelectVariation(variation)}
                    title={variation.instruction ?? variation.label}
                    className={cn(
                      'relative h-20 w-full shrink-0 overflow-hidden rounded-md border bg-muted text-3xs transition-colors disabled:cursor-default',
                      isActive
                        ? 'border-brand-primary ring-1 ring-brand-primary'
                        : 'border-border/70',
                      variation.status === 'error' && 'border-destructive',
                    )}
                  >
                    {variation.status === 'pending' ? (
                      <span className="flex h-full w-full items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
                      </span>
                    ) : variation.videoUrl ? (
                      // biome-ignore lint/a11y/useMediaCaption: silent thumbnail, no captions
                      <video
                        src={variation.videoUrl}
                        muted
                        preload="metadata"
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        !
                      </span>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 truncate bg-black/55 px-1 py-0.5 text-[9px] leading-tight text-white">
                      {index === 0 ? 'Original' : `v${index + 1}`}
                    </span>
                  </button>
                );
              })}
            </aside>
          ) : null}

          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/30 p-4">
            {previewSrc ? (
              <div className="relative h-full w-full">
                <NodeVideoPreview src={previewSrc} />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Video className="h-8 w-8" />
                <p className="text-sm">Describe the clip you want and press Generate.</p>
              </div>
            )}
            {isTurnPending ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[1px]">
                <span className="flex items-center gap-2 rounded-md bg-background/90 px-3 py-2 text-xs shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
                  {mode === 'turn' ? 'Working on your change…' : 'Generating…'}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-border/60 p-3">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              mode === 'turn'
                ? 'Describe a change — Omni keeps the rest of the clip.'
                : 'A marble rolling fast along a wooden track, one continuous shot…'
            }
            className="min-h-24 resize-none text-sm"
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-2xs text-muted-foreground">
              {mode === 'turn'
                ? 'Cmd/Ctrl+Enter to send. Raise the resolution to take this clip to a master.'
                : 'Cmd/Ctrl+Enter to generate. 360p is the cheap draft tier.'}
            </p>
            <Button size="sm" disabled={!canSubmit} onClick={submit}>
              <Wand2 className="mr-1.5 h-4 w-4" />
              {mode === 'turn' ? 'Send edit' : 'Generate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
