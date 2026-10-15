'use client';

import {
  applyMotionOpsToHtml,
  type HyperframesCompositionRevision,
  type MotionDoc,
  type MotionOp,
  type MotionOpInput,
  type MotionTarget,
  parseMotionOp,
  readMotionFromHtml,
} from '@continuum/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/errors';
import { commitHyperframesMotion, getHyperframesRevision } from '@/lib/api/hyperframesAgent.client';
import { HyperframesMotionPanel } from './HyperframesMotionPanel';
import { withPlayerRuntime } from './playerClock';

type PlayerInput = { html: string; width: number; height: number; aspectRatio: string };
type PlayerElement = HTMLElement & { seek(timeInSeconds: number): void; currentTime: number };

export function HyperframesInteractivePlayer({
  html,
  width,
  height,
  aspectRatio,
  startAtSec = 0,
  onTime,
}: PlayerInput & { startAtSec?: number; onTime?: (seconds: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Read at mount only: a new playhead must not remount the player, a new composition must.
  const startAt = useRef(startAtSec);
  startAt.current = startAtSec;
  const timeListener = useRef(onTime);
  timeListener.current = onTime;

  useEffect(() => {
    let cancelled = false;
    let player: PlayerElement | null = null;
    async function mount() {
      await import('@hyperframes/player');
      if (cancelled || !host.current) return;
      const withRuntime = withPlayerRuntime(
        html,
        `${window.location.origin}/hyperframes-runtime-0.8.75.js`,
      );
      // ponytail: data URL keeps model-authored script on an opaque origin; move to an
      // isolated composition host if document size ever exceeds browser URL limits.
      const isolatedUrl = `data:text/html;charset=utf-8,${encodeURIComponent(withRuntime)}`;
      const element = document.createElement('hyperframes-player') as PlayerElement;
      player = element;
      element.setAttribute('src', isolatedUrl);
      element.setAttribute('controls', '');
      element.setAttribute('width', String(width));
      element.setAttribute('height', String(height));
      element.setAttribute('aria-label', 'Interactive HyperFrames composition');
      element.style.cssText = `display:block;width:100%;aspect-ratio:${aspectRatio.replace(':', '/')}`;
      element.addEventListener('ready', () => {
        if (startAt.current > 0) element.seek(startAt.current);
      });
      element.addEventListener('timeupdate', () => timeListener.current?.(element.currentTime));
      host.current.append(element);
    }
    void mount().catch((cause: unknown) => {
      if (!cancelled)
        setError(cause instanceof Error ? cause.message : 'Interactive preview failed.');
    });
    return () => {
      cancelled = true;
      player?.remove();
    };
  }, [aspectRatio, height, html, width]);

  return (
    <div ref={host} className="size-full">
      {error ? (
        <p role="alert" className="p-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Composition = { html: string; revision: HyperframesCompositionRevision };

async function loadComposition(runId: string): Promise<Composition> {
  const response = await getHyperframesRevision(runId);
  const file = await fetch(response.compositionUrl);
  if (!file.ok) throw new Error('Could not load the interactive composition.');
  let html = await file.text();
  for (const asset of response.assets)
    html = html.replaceAll(`hf-asset://${asset.assetId}`, asset.url);
  if (html.includes('hf-asset://')) throw new Error('Composition has unresolved media.');
  return { html, revision: response.revision };
}

const motionContext = (revision: HyperframesCompositionRevision) => ({
  width: revision.width,
  height: revision.height,
  fps: revision.fps,
  durationSec: revision.durationSeconds,
});

/** Applies the op locally (the preview), then commits it on `composition`'s revision. */
async function commitOn(composition: Composition, op: MotionOp): Promise<Composition> {
  const { html } = applyMotionOpsToHtml(
    composition.html,
    [op],
    motionContext(composition.revision),
  );
  const { revision } = await commitHyperframesMotion(composition.revision.revisionId, {
    ops: [op],
    expectedFingerprint: composition.revision.fingerprint,
  });
  return {
    html,
    revision: {
      ...composition.revision,
      revisionId: revision.id,
      fingerprint: revision.fingerprint,
    },
  };
}

function readMotion(html: string): { doc: MotionDoc } | { error: string } {
  try {
    return { doc: readMotionFromHtml(html) };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'Unreadable motion data.' };
  }
}

export function InteractiveHyperframesPreview({
  runId,
  onMotionTargetChange,
}: {
  runId: string;
  onMotionTargetChange: (target: MotionTarget | null) => void;
}) {
  const [composition, setComposition] = useState<Composition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const targetListener = useRef(onMotionTargetChange);
  targetListener.current = onMotionTargetChange;

  useEffect(() => {
    let cancelled = false;
    void loadComposition(runId)
      .then((loaded) => {
        if (!cancelled) setComposition(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Interactive preview failed.');
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const motion = useMemo(() => (composition ? readMotion(composition.html) : null), [composition]);
  const revisionId = composition?.revision.revisionId;

  useEffect(() => () => targetListener.current(null), []);
  useEffect(() => {
    targetListener.current(
      revisionId && selectedIds.length > 0
        ? { revisionId, animationIds: selectedIds, hfIds: [] }
        : null,
    );
  }, [revisionId, selectedIds]);

  const applyOp = async (input: MotionOpInput) => {
    if (!composition || busy) return;
    setBusy(true);
    setStatus(null);
    let fallback = composition;
    try {
      const op = parseMotionOp(input);
      // The preview remounts on the edited composition before the commit round-trips.
      setComposition({
        ...composition,
        html: applyMotionOpsToHtml(composition.html, [op], motionContext(composition.revision))
          .html,
      });
      try {
        setComposition(await commitOn(composition, op));
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.status === 409)) throw cause;
        // Someone else revised the film: replay the edit on the latest revision.
        fallback = await loadComposition(runId);
        setComposition(await commitOn(fallback, op));
      }
      setStatus('Saved');
    } catch (cause) {
      setComposition(fallback);
      setStatus(cause instanceof Error ? cause.message : 'The motion edit failed.');
    } finally {
      setBusy(false);
    }
  };

  if (error)
    return (
      <p role="alert" className="p-3 text-xs text-destructive">
        {error}
      </p>
    );
  if (!composition || !motion)
    return <p className="p-3 text-xs text-muted-foreground">Loading interactive composition…</p>;
  const { revision } = composition;
  return (
    <div className="flex size-full flex-col">
      <div className="min-h-0 flex-1">
        <HyperframesInteractivePlayer
          html={composition.html}
          width={revision.width}
          height={revision.height}
          aspectRatio={revision.aspectRatio}
          startAtSec={playheadSec}
          onTime={(seconds) => setPlayheadSec(Math.round(seconds * revision.fps) / revision.fps)}
        />
      </div>
      <div className="nodrag nopan nowheel max-h-56 shrink-0 overflow-y-auto border-t border-border/60">
        {'error' in motion ? (
          <p role="alert" className="p-2 text-2xs text-destructive">
            {motion.error}
          </p>
        ) : (
          <HyperframesMotionPanel
            doc={motion.doc}
            durationSec={revision.durationSeconds}
            fps={revision.fps}
            playheadSec={playheadSec}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            onOp={(op) => void applyOp(op)}
            busy={busy}
            status={status}
          />
        )}
      </div>
    </div>
  );
}
