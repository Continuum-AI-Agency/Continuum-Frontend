'use client';

// The slim bar under a running Jaina turn: how far along it is, and roughly how long is left.
// Everything it says is derived from parts the turn already streams — see lib/jaina/runProgress.

import type { JainaUIMessage } from '@continuum/contracts';
import * as React from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  createRunProgressTracker,
  type JainaRunProgress,
  type JainaRunProgressTracker,
  readRunSignals,
} from '@/lib/jaina/runProgress';

const TICK_MS = 1000;

/**
 * The progress of the turn identified by `turnKey`, re-read every second while `active`.
 * `message` is the streaming assistant message, absent until its first part arrives.
 */
export function useJainaRunProgress({
  turnKey,
  message,
  question,
  active,
}: {
  turnKey: string | null;
  message: JainaUIMessage | undefined;
  question?: string;
  active: boolean;
}): JainaRunProgress | null {
  const trackerRef = React.useRef<{ key: string; tracker: JainaRunProgressTracker } | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [active]);

  const signals = React.useMemo(() => readRunSignals(message), [message]);

  if (!active || !turnKey) return null;
  if (trackerRef.current?.key !== turnKey) {
    trackerRef.current = {
      key: turnKey,
      tracker: createRunProgressTracker({ startedAtMs: Date.now(), question }),
    };
  }
  return trackerRef.current.tracker.observe(signals, Math.max(now, Date.now()));
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * The bar under a running turn: a header (Jaina · the question · status · elapsed) over the bar.
 * The status pill carries the tracker's own label, so it stays in the reader's language.
 * Renders nothing for a turn too quick to need it.
 */
export function JainaRunProgressBar({
  progress,
  title,
  onStop,
}: {
  progress: JainaRunProgress | null;
  /** The question this turn answers. */
  title?: string;
  /** Ends the run; shown only while it is still going. */
  onStop?: () => void;
}) {
  if (!progress?.visible) return null;
  const percent = Math.round(progress.fraction * 100);
  const done = progress.stage === 'done';
  return (
    <div
      className="mx-auto my-2 w-full max-w-3xl text-sm text-muted-foreground"
      data-testid="jaina-run-progress"
      data-stage={progress.stage}
      data-exceeded={progress.exceeded ? 'true' : undefined}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate">
          Jaina
          {title ? (
            <>
              <span aria-hidden> · </span>
              <span className="font-medium text-foreground">{title}</span>
            </>
          ) : null}
        </p>
        <Pill className="min-w-0 max-w-[60%]">
          <PillIndicator
            variant={done ? 'success' : progress.exceeded ? 'warning' : 'info'}
            pulse={!done}
          />
          <span className="truncate" aria-live="polite">
            {progress.label}
          </span>
        </Pill>
        <span
          className="shrink-0 font-mono text-xs tabular-nums"
          data-testid="jaina-run-elapsed"
          title="Elapsed"
        >
          {clock(progress.elapsedSeconds)}
        </span>
        {onStop && !done ? (
          <Button type="button" size="xs" variant="outline" onClick={onStop}>
            Stop
          </Button>
        ) : null}
      </div>
      <Progress
        value={percent}
        aria-label={progress.label}
        getAriaValueText={() => progress.label}
        className="h-1 bg-muted"
      />
    </div>
  );
}

export function JainaRunProgressIndicator({
  onStop,
  ...props
}: Parameters<typeof useJainaRunProgress>[0] & { onStop?: () => void }) {
  return (
    <JainaRunProgressBar
      progress={useJainaRunProgress(props)}
      title={props.question}
      onStop={onStop}
    />
  );
}
