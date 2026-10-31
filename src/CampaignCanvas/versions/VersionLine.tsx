'use client';

// The version line above Read and the Map (design C, option 30): v1 → v2 → v3 → "Applied in
// Meta". Picking a version shows it; "Compare with previous" marks what it changed against the
// one before. View and compare only: no Frontend action restores an older scaffold version or
// re-proposes an older live change, so there is no "Go back to v2" here.

import { ReactFlowProvider } from '@xyflow/react';
import { Check, GitCompareArrows } from 'lucide-react';
import * as React from 'react';
import type { CanvasView } from '@/lib/campaign-canvas/canvasView';
import { columnMapFromView } from '@/lib/campaign-canvas/columnMap';
import type { CampaignViewModel } from '@/lib/campaign-canvas/lectura';
import {
  appliedLabelOf,
  comparisonSummaryOf,
  showsVersionLine,
  type VersionLine,
  type VersionStatus,
  type VersionView,
  versionViewOf,
} from '@/lib/campaign-canvas/versions';
import { cn } from '@/lib/utils';
import { ColumnMapFlow } from '../columnMap/ColumnMapFlow';
import { LecturaView } from '../lectura/LecturaView';

const STATUS_WORD: Record<VersionStatus, string | null> = {
  proposed: null,
  approved: 'approved',
  applied: 'applied',
  denied: 'denied',
  failed: 'failed',
};

export type VersionLineState = {
  line: VersionLine | null;
  view: VersionView | null;
  compare: boolean;
  setCompare: (compare: boolean) => void;
  select: (id: string) => void;
  reset: () => void;
  /** True when the pane should draw the version line's model instead of its own default body. */
  active: boolean;
};

/**
 * Which version is on screen and whether it is compared; starts over when the line changes.
 * `currentId` is the version the pane draws by itself (the preview it was opened on, the
 * scaffold version in the store): selected by default, and drawn by the pane's own body.
 */
export function useVersionLine(
  line: VersionLine | null | undefined,
  currentId: string | null = null,
): VersionLineState {
  const shown = showsVersionLine(line) ? line : null;
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [compare, setCompare] = React.useState(false);
  const key = shown ? `${shown.key}:${shown.versions.length}` : '';
  // A new proposal (one more version) lands on the newest, uncompared.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger
  React.useEffect(() => {
    setSelectedId(null);
    setCompare(false);
  }, [key]);
  const current =
    currentId && shown?.versions.some((version) => version.id === currentId) ? currentId : null;
  const view = React.useMemo(
    () => (shown ? versionViewOf(shown, selectedId ?? current, compare) : null),
    [shown, selectedId, current, compare],
  );
  const drawnByPane = current ?? shown?.versions.at(-1)?.id ?? null;
  const reset = React.useCallback(() => {
    setSelectedId(null);
    setCompare(false);
  }, []);
  return {
    line: shown,
    view,
    compare,
    setCompare,
    select: setSelectedId,
    reset,
    active: Boolean(view && (view.version.id !== drawnByPane || view.comparison)),
  };
}

/** The line itself: one pill per version, the applied step, and Compare. */
export function VersionLineBar({ state }: { state: VersionLineState }) {
  const { line, view } = state;
  if (!line || !view) return null;
  const applied = line.appliedId;
  return (
    <div className="grid w-full min-w-0 gap-1" data-testid="version-line">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5 text-[12px]">
        <span className="mr-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
          Versions
        </span>
        <ol className="flex min-w-0 flex-wrap items-center gap-1" aria-label="Versions">
          {line.versions.map((version, index) => {
            const selected = version.id === view.version.id;
            const word = STATUS_WORD[version.status];
            return (
              <li key={version.id} className="flex items-center gap-1">
                {index > 0 ? (
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => state.select(version.id)}
                  className={cn(
                    'rounded-full border px-2 py-0.5 font-mono font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-primary',
                    selected
                      ? 'border-primary bg-primary/12 text-primary-ink'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    version.status === 'denied' && !selected && 'line-through',
                  )}
                  data-testid={`version-${version.label}`}
                  data-status={version.status}
                >
                  {version.label}
                  {word ? <span className="font-sans font-normal"> · {word}</span> : null}
                </button>
              </li>
            );
          })}
          <li className="flex items-center gap-1">
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
            <button
              type="button"
              disabled={!applied}
              onClick={() => applied && state.select(applied)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium focus-visible:outline-2 focus-visible:outline-primary',
                applied
                  ? 'border-[color:var(--success)] text-[color:var(--success)]'
                  : 'border-dashed border-border text-muted-foreground',
              )}
              data-testid="version-applied"
              data-applied={applied ? 'true' : 'false'}
            >
              {applied ? <Check className="size-3" aria-hidden /> : null}
              {applied ? appliedLabelOf(view.model) : 'Not applied yet'}
            </button>
          </li>
        </ol>
        <button
          type="button"
          aria-pressed={state.compare}
          disabled={!view.previous}
          onClick={() => state.setCompare(!state.compare)}
          title={view.previous ? undefined : 'The first version has nothing before it'}
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-medium focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40',
            state.compare
              ? 'border-primary bg-primary/12 text-primary-ink'
              : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
          data-testid="version-compare"
        >
          <GitCompareArrows className="size-3.5" aria-hidden />
          Compare with previous
        </button>
      </div>
      {view.comparison && view.previous ? (
        <p className="text-[12px] text-muted-foreground" data-testid="version-compare-summary">
          {view.version.label} against {view.previous.label}:{' '}
          <span className="font-medium text-foreground">
            {comparisonSummaryOf(view.comparison)}
          </span>
        </p>
      ) : state.active ? (
        <p className="text-[12px] text-muted-foreground">
          Viewing {view.version.label} · read-only
        </p>
      ) : null}
    </div>
  );
}

/** A campaign model in Read or in the Map: what a version, or a portfolio's row, draws. */
export function CampaignModelBody({
  model,
  view,
  drawKey,
  mapTestIdPrefix = 'map-card-',
  mapHeader,
}: {
  model: CampaignViewModel;
  view: CanvasView;
  /** A new key is a new drawing: expanded cards and the Map's focus start over. */
  drawKey: string;
  mapTestIdPrefix?: string;
  mapHeader?: React.ReactNode;
}) {
  const map = React.useMemo(() => columnMapFromView(model), [model]);
  if (view === 'lectura') return <LecturaView key={drawKey} model={model} />;
  return (
    <ReactFlowProvider>
      <ColumnMapFlow key={drawKey} model={map} testIdPrefix={mapTestIdPrefix} header={mapHeader} />
    </ReactFlowProvider>
  );
}
