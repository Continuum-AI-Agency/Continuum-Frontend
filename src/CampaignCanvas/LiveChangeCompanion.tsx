'use client';

// The companion pane for a pending Jaina edit to a live campaign: one header (what changes,
// where the approval stands, Map / Read), then the Mapa (LiveChangeCanvas) or the Lectura.
// A proposal opens in Read — the job is to approve it — unless the person chose otherwise.
// When the thread proposed this campaign more than once, the version line sits under the
// header: an older version, or a version compared with the one before, is drawn in its place.

import type { LiveChangePreviewPayload } from '@continuum/contracts';
import * as React from 'react';
import { lecturaFromLiveChange } from '@/lib/campaign-canvas/lectura';
import type { LiveChangeDecision } from '@/lib/campaign-canvas/liveChange';
import type { VersionLine } from '@/lib/campaign-canvas/versions';
import { LiveChangeCanvas, LiveChangeDecisionPill } from './LiveChangeCanvas';
import { CanvasViewHint, CanvasViewToggle, useCanvasView } from './lectura/CanvasViewToggle';
import { LecturaView, PlatformChip } from './lectura/LecturaView';
import { CampaignModelBody, useVersionLine, VersionLineBar } from './versions/VersionLine';

export function LiveChangeCompanion({
  preview,
  decision,
  versions = null,
}: {
  preview: LiveChangePreviewPayload;
  decision: LiveChangeDecision;
  /** Every proposal the thread made for this campaign, oldest first. */
  versions?: VersionLine | null;
}) {
  const { view, setView, isPhone, hint, dismissHint } = useCanvasView('proposed');
  const model = React.useMemo(() => lecturaFromLiveChange(preview), [preview]);
  const versionLine = useVersionLine(versions, preview.partId);
  const shown = versionLine.active ? versionLine.view : null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="live-change-companion">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <span className="flex min-w-[12rem] flex-1 items-baseline gap-2 text-[13px] text-muted-foreground">
          <PlatformChip platform={model.platform} />
          <span className="min-w-0">{preview.subject ?? 'Pending change'}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <LiveChangeDecisionPill decision={decision} />
          <CanvasViewToggle view={view} onChange={setView} mapDisabled={isPhone} />
        </div>
        {hint ? (
          <div className="flex w-full justify-end">
            <CanvasViewHint hint={hint} onDismiss={dismissHint} />
          </div>
        ) : null}
        <VersionLineBar state={versionLine} />
      </div>
      <div className="min-h-0 flex-1">
        {shown ? (
          <CampaignModelBody
            model={shown.model}
            view={view}
            drawKey={`${shown.version.id}:${shown.comparison ? 'compare' : 'plain'}`}
            mapTestIdPrefix="live-change-node-"
          />
        ) : view === 'lectura' ? (
          <LecturaView key={preview.partId} model={model} />
        ) : (
          <LiveChangeCanvas preview={preview} decision={decision} showHeader={false} />
        )}
      </div>
    </div>
  );
}
