'use client';

import type {
  GoalStructuredResponseValue,
  UpsertGoalCapabilityRouteRequest,
} from '@continuum/contracts';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { GoalFocus } from '@/lib/goals/focus';
import type { GoalWorkspaceView } from '@/lib/goals/models';
import { goalArtifactProgress } from '@/lib/goals/models';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { GoalArtifactEditor } from './GoalArtifactEditor';
import { GoalArtifactManifest } from './GoalArtifactManifest';
import { GoalEvidenceRail } from './GoalEvidenceRail';
import { GoalExecutionStatus } from './GoalExecutionStatus';
import { GoalStatusPill } from './GoalStatusPill';

type GoalWorkspaceProps = {
  goal: GoalWorkspaceView;
  currentUserId: string;
  focus: GoalFocus | null;
  isSavingArtifact: boolean;
  saveArtifactError: string | null;
  onRefresh: () => void;
  onAskTeammate: (input: { targetUserId: string; prompt: string }) => Promise<boolean>;
  onRespondToRequest: (input: {
    requestId: string;
    response: string;
    structuredValue: GoalStructuredResponseValue;
    evidenceAttachmentIds: string[];
  }) => Promise<boolean>;
  onRegisterEvidence: (input: {
    requestId: string;
    sourceStoragePath: string;
    filename: string;
  }) => Promise<string | null>;
  onSaveArtifact: (input: {
    artifactId: string;
    markdown: string;
    expectedRevision: number;
  }) => Promise<boolean>;
  onArtifactAction: (input: {
    artifactId: string;
    versionId: string;
    action: 'approve' | 'changes' | 'accept' | 'promote';
  }) => Promise<void>;
  onSaveCapabilityRoute: (input: UpsertGoalCapabilityRouteRequest) => Promise<boolean>;
};

export function GoalWorkspace({
  goal,
  currentUserId,
  focus,
  isSavingArtifact,
  saveArtifactError,
  onRefresh,
  onAskTeammate,
  onRespondToRequest,
  onRegisterEvidence,
  onSaveArtifact,
  onArtifactAction,
  onSaveCapabilityRoute,
}: GoalWorkspaceProps) {
  const orderedArtifactIds = useMemo(() => goal.artifacts.map((artifact) => artifact.id), [goal]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    focus?.kind === 'artifact' && orderedArtifactIds.includes(focus.id)
      ? focus.id
      : (orderedArtifactIds[0] ?? null),
  );
  const [mobileTab, setMobileTab] = useState(
    focus?.kind === 'request' ? 'activity' : focus?.kind === 'artifact' ? 'artifact' : 'manifest',
  );

  useEffect(() => {
    if (selectedArtifactId && orderedArtifactIds.includes(selectedArtifactId)) return;
    setSelectedArtifactId(orderedArtifactIds[0] ?? null);
  }, [orderedArtifactIds, selectedArtifactId]);

  useEffect(() => {
    if (!focus) return;
    if (focus.kind === 'artifact' && orderedArtifactIds.includes(focus.id)) {
      setSelectedArtifactId(focus.id);
      setMobileTab('artifact');
    }
    if (focus.kind === 'request') setMobileTab('activity');
  }, [focus, orderedArtifactIds]);

  const selectedArtifact =
    goal.artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null;
  const progress = goalArtifactProgress(goal.artifacts);

  const manifest = (
    <GoalArtifactManifest
      goal={goal}
      selectedArtifactId={selectedArtifactId}
      onSelectArtifact={setSelectedArtifactId}
    />
  );
  const artifact = (
    <GoalArtifactEditor
      artifact={selectedArtifact}
      isSaving={isSavingArtifact}
      saveError={saveArtifactError}
      onSave={onSaveArtifact}
      onAction={onArtifactAction}
    />
  );
  const evidence = (
    <GoalEvidenceRail
      goal={goal}
      currentUserId={currentUserId}
      focusedRequestId={focus?.kind === 'request' ? focus.id : null}
      onAskTeammate={onAskTeammate}
      onRespondToRequest={onRespondToRequest}
      onRegisterEvidence={onRegisterEvidence}
    />
  );

  return (
    <div className="flex h-[var(--app-content-h)] min-h-[var(--workspace-min-height,600px)] min-w-0 flex-col gap-[var(--app-shell-gap)] py-[var(--page-pad-block)]">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{goal.title}</span>
            <GoalStatusPill status={goal.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>
              {goal.accountableHumanName
                ? `Accountable · ${goal.accountableHumanName}`
                : 'No accountable teammate assigned'}
            </span>
            <span aria-hidden>·</span>
            <span>Updated {formatRelativeTime(goal.updatedAt)}</span>
          </span>
        }
        action={
          <>
            <Pill variant="secondary" className="font-mono">
              {progress.accepted}/{progress.total} resolved
            </Pill>
            <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            <Link href="/goals" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
              <ArrowLeft className="size-3.5" />
              All goals
            </Link>
          </>
        }
      />

      <GoalExecutionStatus goal={goal} onSaveCapabilityRoute={onSaveCapabilityRoute} />

      <div className="hidden min-h-0 flex-1 grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)_minmax(0,1fr)] overflow-hidden rounded-lg border border-border/70 lg:grid">
        {manifest}
        {artifact}
        {evidence}
      </div>

      <Tabs
        value={mobileTab}
        onValueChange={setMobileTab}
        className="flex min-h-0 flex-1 flex-col lg:hidden"
      >
        <TabsList className="grid w-full shrink-0 grid-cols-3">
          <TabsTrigger value="manifest">Manifest</TabsTrigger>
          <TabsTrigger value="artifact">Artifact</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent
          value="manifest"
          className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-border/70"
        >
          {manifest}
        </TabsContent>
        <TabsContent
          value="artifact"
          className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-border/70"
        >
          {artifact}
        </TabsContent>
        <TabsContent
          value="activity"
          className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-border/70"
        >
          {evidence}
        </TabsContent>
      </Tabs>
    </div>
  );
}
