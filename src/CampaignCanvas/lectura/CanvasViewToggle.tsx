'use client';

// The Mapa / Lectura switch at the top of the companion canvas, and the hook that decides
// which one shows (lib/campaign-canvas/canvasView.ts holds the rules).

import { BookOpenText, Network } from 'lucide-react';
import * as React from 'react';
import {
  CANVAS_VIEW_PHONE_MAX_WIDTH,
  type CanvasView,
  type CanvasViewContext,
  readStoredCanvasViews,
  resolveCanvasView,
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
 * The view for a pane opened for `context`. It starts on the rule's default so the server and
 * the first client paint agree, then reads the person's remembered choice after mount.
 */
export function useCanvasView(context: CanvasViewContext): {
  view: CanvasView;
  setView: (view: CanvasView) => void;
  isPhone: boolean;
} {
  const isPhone = usePhoneViewport();
  const [stored, setStored] = React.useState<Partial<Record<CanvasViewContext, CanvasView>>>({});
  React.useEffect(() => {
    setStored(readStoredCanvasViews(browserStorage()));
  }, []);
  const view = resolveCanvasView({ context, stored, isPhone });
  const setView = React.useCallback(
    (next: CanvasView) => {
      writeStoredCanvasView(browserStorage(), context, next);
      setStored((current) => ({ ...current, [context]: next }));
    },
    [context],
  );
  return { view, setView, isPhone };
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
