'use client';

// The Mapa / Lectura switch at the top of a campaign canvas (companion pane and Canvas page),
// the hook that decides which one shows (lib/campaign-canvas/canvasView.ts holds the rules)
// and the one-time hint that explains an automatic switch.

import { BookOpenText, Network, X } from 'lucide-react';
import * as React from 'react';
import {
  CANVAS_VIEW_PHONE_MAX_WIDTH,
  type CanvasView,
  type CanvasViewContext,
  type CanvasViewTask,
  canvasViewHintOf,
  decideCanvasView,
  nextCanvasViewTask,
  readCanvasViewHintDismissed,
  readStoredCanvasViews,
  writeCanvasViewHintDismissed,
  writeStoredCanvasView,
} from '@/lib/campaign-canvas/canvasView';
import { cn } from '@/lib/utils';

const browserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const PHONE_QUERY = `(max-width: ${CANVAS_VIEW_PHONE_MAX_WIDTH}px)`;

const usePhoneViewport = (): boolean => {
  const [isPhone, setIsPhone] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return isPhone;
};

/**
 * The view for a pane opened for `context` — auto mode by task (canvasView.ts holds the rule:
 * auto picks per task; your last explicit pick per task kind overrides). It starts on the
 * rule's default so the server and the first client paint agree, then reads the person's
 * remembered choices after mount. A new `context` from the host is a new task: it forgets
 * that the last one was being edited. So is a new `taskKey` with the same context — a second
 * proposal arriving while the person edits the first one opens in Read again.
 */
export function useCanvasView(
  context: CanvasViewContext,
  taskKey: number | string = 0,
): {
  view: CanvasView;
  setView: (view: CanvasView) => void;
  isPhone: boolean;
  /** The person pressed Edit or changed a node: the task is theirs now, and the Map shows. */
  startEditing: () => void;
  /** The person opened something by hand (e.g. picked a scaffold): a manual task, auto Map. */
  openByHand: () => void;
  /** The one-line "why Read?" note for the first auto switch; null once dismissed. */
  hint: string | null;
  dismissHint: () => void;
} {
  const isPhone = usePhoneViewport();
  const [stored, setStored] = React.useState<Partial<Record<CanvasViewContext, CanvasView>>>({});
  const [hintDismissed, setHintDismissed] = React.useState(true);
  const [task, setTask] = React.useState<CanvasViewTask>({ context, editing: false });
  React.useEffect(() => {
    setStored(readStoredCanvasViews(browserStorage()));
    setHintDismissed(readCanvasViewHintDismissed(browserStorage()));
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: taskKey IS the trigger — a new task with the same context must still reset the view.
  React.useEffect(() => {
    setTask((current) => nextCanvasViewTask(current, { type: 'task', context }));
  }, [context, taskKey]);

  const decision = decideCanvasView({
    context: task.context,
    editing: task.editing,
    stored,
    isPhone,
  });
  const dismissHint = React.useCallback(() => {
    writeCanvasViewHintDismissed(browserStorage());
    setHintDismissed(true);
  }, []);
  const setView = React.useCallback(
    (next: CanvasView) => {
      writeStoredCanvasView(browserStorage(), task.context, next);
      setStored((current) => ({ ...current, [task.context]: next }));
      setTask((current) => nextCanvasViewTask(current, { type: 'pick' }));
      // Someone who used the toggle has found it: the hint has nothing left to explain.
      dismissHint();
    },
    [dismissHint, task.context],
  );
  const startEditing = React.useCallback(
    () => setTask((current) => nextCanvasViewTask(current, { type: 'edit' })),
    [],
  );
  const openByHand = React.useCallback(
    () => setTask((current) => nextCanvasViewTask(current, { type: 'task', context: 'manual' })),
    [],
  );
  const hint = canvasViewHintOf({ context: task.context, decision, dismissed: hintDismissed });
  return { view: decision.view, setView, isPhone, startEditing, openByHand, hint, dismissHint };
}

/** The tiny note beside the toggle that says why the pane opened in Read. Dismissible. */
export function CanvasViewHint({
  hint,
  onDismiss,
}: {
  hint: string | null;
  onDismiss: () => void;
}) {
  if (!hint) return null;
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
      role="status"
      data-testid="canvas-view-hint"
    >
      <span className="min-w-0 truncate">{hint}</span>
      <button
        type="button"
        className="grid size-4 shrink-0 place-items-center rounded-full hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}

const OPTIONS: { value: CanvasView; label: string; Icon: typeof Network }[] = [
  { value: 'mapa', label: 'Map', Icon: Network },
  { value: 'lectura', label: 'Read', Icon: BookOpenText },
];

export function CanvasViewToggle({
  view,
  onChange,
  mapDisabled = false,
}: {
  view: CanvasView;
  onChange: (view: CanvasView) => void;
  /** On a phone the map does not fit; the switch says so instead of hiding. */
  mapDisabled?: boolean;
}) {
  return (
    <fieldset
      aria-label="Canvas view"
      className="inline-flex shrink-0 rounded-lg border border-border bg-card p-0.5 text-[13px]"
      data-testid="canvas-view-toggle"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const disabled = value === 'mapa' && mapDisabled;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            disabled={disabled}
            title={disabled ? 'The map needs a wider screen' : undefined}
            onClick={() => onChange(value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40',
              view === value ? 'bg-primary/12 text-primary-ink' : 'text-muted-foreground',
            )}
            data-view={value}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </fieldset>
  );
}
