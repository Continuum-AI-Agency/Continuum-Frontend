'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The companion pane for a pending Jaina edit to a live campaign: one header (what changes,
// where the approval stands, Map / Read), then the Mapa (LiveChangeCanvas) or the Lectura.
// A proposal opens in Read — the job is to approve it — unless the person chose otherwise.
// When the thread proposed this campaign more than once, the version line sits under the
// header: an older version, or a version compared with the one before, is drawn in its place.

import type { JainaApprovalVariant, LiveChangePreviewPayload } from '@continuum/contracts';
import * as React from 'react';
import { lecturaFromLiveChange } from '@/lib/campaign-canvas/lectura';
import type { LiveChangeDecision } from '@/lib/campaign-canvas/liveChange';
import type { VersionLine } from '@/lib/campaign-canvas/versions';
import { LiveChangeCanvas, LiveChangeDecisionPill } from './LiveChangeCanvas';
import { type ConfirmVariantOption, LiveChangeConfirmBar } from './LiveChangeConfirmBar';
import { CanvasViewHint, CanvasViewToggle, useCanvasView } from './lectura/CanvasViewToggle';
import { LecturaView, PlatformChip } from './lectura/LecturaView';
import { ProjectionPanel } from './ProjectionPanel';
import { CampaignModelBody, useVersionLine, VersionLineBar } from './versions/VersionLine';

export function LiveChangeCompanion({
  preview,
  decision,
  versions = null,
  onDecide,
  onImplement,
  implementBlocked = false,
  pendingDecision = null,
  variants = null,
}: {
  preview: LiveChangePreviewPayload;
  decision: LiveChangeDecision;
  /** Every proposal the thread made for this campaign, oldest first. */
  versions?: VersionLine | null;
  /** Answers the pending approval with the chat card's own decision (and its choice). */
  onDecide?: (decision: 'approve' | 'deny', variant?: JainaApprovalVariant) => void;
  /** The decision already sent for this approval, from the card or the canvas. */
  pendingDecision?: 'approve' | 'deny' | null;
  /** The choices the gated tool's card offers. */
  variants?: readonly ConfirmVariantOption[] | null;
  /** Asks Jaina to run a proposal's changes through the approval cards. */
  onImplement?: () => void;
  /** A run holds the conversation, or the implement turn is still waiting to be sent. */
  implementBlocked?: boolean;
}) {
  const betaUiText = useBetaTranslations('scale');

  const { view, setView, isPhone, hint, dismissHint } = useCanvasView('proposed');
  const model = React.useMemo(() => lecturaFromLiveChange(preview), [preview]);
  const versionLine = useVersionLine(versions, preview.partId);
  const shown = versionLine.active ? versionLine.view : null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="live-change-companion">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <span className="flex min-w-[12rem] flex-1 items-baseline gap-2 text-[13px] text-muted-foreground">
          <PlatformChip platform={model.platform} />
          <span className="min-w-0">
            {preview.subject ??
              (decision === 'proposal'
                ? betaUiText('beta_28b00af7cb71')
                : betaUiText('beta_64b979c02d33'))}
          </span>
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
      {preview.projection && !shown ? (
        <div className="max-h-[55%] shrink-0 overflow-y-auto border-t border-border bg-card">
          <ProjectionPanel projection={preview.projection} />
        </div>
      ) : null}
      {!shown ? (
        <LiveChangeConfirmBar
          key={preview.partId}
          preview={preview}
          decision={decision}
          pendingDecision={pendingDecision}
          variants={variants}
          {...(onDecide ? { onDecide } : {})}
          {...(onImplement ? { onImplement } : {})}
          implementBlocked={implementBlocked}
        />
      ) : null}
    </div>
  );
}
