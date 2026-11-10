'use client';

// The slim bar under a running Jaina turn: how far along it is, and roughly how long is left.
// Everything it says is derived from parts the turn already streams — see lib/jaina/runProgress.

import type { JainaUIMessage } from '@continuum/contracts';
import * as React from 'react';
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

/** The bar and its one line. Renders nothing for a turn too quick to need it. */
export function JainaRunProgressBar({ progress }: { progress: JainaRunProgress | null }) {
  if (!progress?.visible) return null;
  const percent = Math.round(progress.fraction * 100);
  return (
    <div
      className="mx-auto my-2 w-full max-w-3xl text-sm text-muted-foreground"
      data-testid="jaina-run-progress"
      data-stage={progress.stage}
      data-exceeded={progress.exceeded ? 'true' : undefined}
    >
      <Progress
        value={percent}
        aria-label={progress.label}
        getAriaValueText={() => progress.label}
        className="h-1 bg-muted"
      />
      <p className="mt-1.5" aria-live="polite">
        {progress.label}
      </p>
    </div>
  );
}

export function JainaRunProgressIndicator(props: Parameters<typeof useJainaRunProgress>[0]) {
  return <JainaRunProgressBar progress={useJainaRunProgress(props)} />;
}
