'use client';

// The companion pane for a pending Jaina edit to a live campaign: one header (what changes,
// where the approval stands, Map / Read), then the Mapa (LiveChangeCanvas) or the Lectura.
// A proposal opens in Read — the job is to approve it — unless the person chose otherwise.

import type { LiveChangePreviewPayload } from '@continuum/contracts';
import * as React from 'react';
import { lecturaFromLiveChange } from '@/lib/campaign-canvas/lectura';
import type { LiveChangeDecision } from '@/lib/campaign-canvas/liveChange';
import { LiveChangeCanvas, LiveChangeDecisionPill } from './LiveChangeCanvas';
import { CanvasViewToggle, useCanvasView } from './lectura/CanvasViewToggle';
import { LecturaView } from './lectura/LecturaView';

export function LiveChangeCompanion({
  preview,
  decision,
}: {
  preview: LiveChangePreviewPayload;
  decision: LiveChangeDecision;
}) {
  const { view, setView, isPhone } = useCanvasView('proposed');
  const model = React.useMemo(() => lecturaFromLiveChange(preview), [preview]);
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="live-change-companion">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <span className="min-w-[12rem] flex-1 text-[13px] text-muted-foreground">
          {preview.subject ?? 'Pending change'}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <LiveChangeDecisionPill decision={decision} />
          <CanvasViewToggle view={view} onChange={setView} mapDisabled={isPhone} />
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {view === 'lectura' ? (
          <LecturaView key={preview.partId} model={model} />
        ) : (
          <LiveChangeCanvas preview={preview} decision={decision} showHeader={false} />
        )}
      </div>
    </div>
  );
}
