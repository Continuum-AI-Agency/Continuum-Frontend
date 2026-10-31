'use client';

import type {
  CampaignStructurePayload,
  JainaOperatorAction,
  JainaPublicationMode,
  JainaToolApprovalRequiredPayload,
  JainaToolApprovalResolvedPayload,
  JainaToolOutputDeniedPayload,
} from '@continuum/contracts';
import * as React from 'react';
import { LecturaView } from '@/CampaignCanvas/lectura/LecturaView';
import { useCampaignStore } from '@/CampaignCanvas/stores/useCampaignStore';
import { ApprovalChangeTable } from '@/components/paid-media/jaina/components/ApprovalChangeTable';
import { useAdAccountCurrency } from '@/components/paid-media/optimizer/useOptimizerData';
import {
  AgentActions,
  AgentButton,
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardSummary,
  AgentCardTitle,
  AgentDecisionCard,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Progress } from '@/components/ui/progress';
import {
  buildCampaignCreativeRequest,
  scaffoldCreativeQuery,
} from '@/lib/campaign-canvas/creativeGeneration';
import {
  campaignViewFromScaffoldRows,
  campaignViewFromStructure,
  type ScaffoldTreeSource,
} from '@/lib/campaign-canvas/lectura';
import type { OperatorActionOutcome } from '@/lib/jaina/operatorOutcome';
import type { JainaScaffoldState } from '@/lib/jaina/scaffoldTypes';
import { type ScaffoldTree, targetingSummary } from '@/lib/paid-media/scaffoldTree';
import { ScaffoldCreativePreview } from './ScaffoldCreativePreview';
import {
  ScaffoldAudiences,
  ScaffoldCreatives,
  ScaffoldEvidence,
  ScaffoldFields,
  ScaffoldSummaryStrip,
} from './ScaffoldPlanSections';
import {
  audienceLinesOf,
  creativeTilesOf,
  type DeployBlocker,
  deployBlockersOf,
  scaffoldFieldGroupsOf,
  scaffoldSummaryOf,
} from './scaffoldPlanView';
import { scaffoldCanvasHref, useScaffoldThread } from './scaffoldThreadContext';
import { useLiveCanvasTree } from './useLiveCanvasTree';
import { usePaidScaffoldTree } from './usePaidScaffoldTree';

/**
 * One proposed campaign scaffold: what it is, why each decision was made, and the ONE action
 * that takes it to Meta — "Deploy paused".
 *
 * Deploy is a single approval that builds every entity, attaches the creatives and enrolls the
 * ad sets in the optimizer, all PAUSED. Nothing here activates anything: going live is a separate
 * unpause, approved on its own card. When the proposing turn already opened the deploy gate, the
 * button answers it; otherwise it opens one with an operator action (no model turn) and the gate
 * lands as a card of its own.
 *
 * There is no edit path here by design. Editing is the Campaign Canvas, which saves a NEW version
 * with a new content hash — so what a person approves here is always the version on screen.
 */

export type ScaffoldDecision = 'approve' | 'deny';

const GATE_BY_TOOL_NAME: Record<
  string,
  { gate: 'build' | 'populate' | 'activate' | 'deploy' | 'publish'; label: string }
> = {
  paid_scaffold_deploy: { gate: 'deploy', label: 'Deploy paused' },
  paid_scaffold_publish: { gate: 'publish', label: 'Publish & auto-enroll' },
  paid_scaffold_build: { gate: 'build', label: 'Approve & create (paused)' },
  paid_scaffold_populate: { gate: 'populate', label: 'Approve & add creatives' },
  paid_scaffold_activate: { gate: 'activate', label: 'Publish only' },
};

/**
 * Counts from the ROWS once they load. The frame's summary only covers the moment before,
 * and a card seeded from an approval or a reload never had one.
 */
const summaryLine = (scaffold: JainaScaffoldState, tree: ScaffoldTree | null): string => {
  if (!tree && !scaffold.summary) return 'Loading the scaffold…';
  const campaigns = tree ? (tree.campaign ? 1 : 0) : (scaffold.summary?.campaigns ?? 0);
  const adSets = tree ? tree.counts.adSets : (scaffold.summary?.adSets ?? 0);
  const ads = tree ? tree.counts.ads : (scaffold.summary?.ads ?? 0);
  const parts = [
    `${campaigns} campaign${campaigns === 1 ? '' : 's'}`,
    `${adSets} ad set${adSets === 1 ? '' : 's'}`,
    `${ads} ad${ads === 1 ? '' : 's'}`,
  ];
  return `${parts.join(' · ')} — ${scaffold.receipt?.publicationMode && scaffold.receipt.status === 'completed' ? 'live on Meta' : 'everything is created paused'}.`;
};

/**
 * The campaign at chat size, on the canvas's own Read pieces (design C, option 27): the
 * changes first — a campaign copy's new test ad sets, from the Backend's diff — then the daily
 * budget and "Open in canvas". Ids are path keys, the anchor the diff and the rows share.
 */
const treeSourceOf = (tree: ScaffoldTree): ScaffoldTreeSource => ({
  campaign: tree.campaign
    ? {
        id: tree.campaign.id,
        pathKey: tree.campaign.pathKey,
        name: tree.campaign.name,
        budgetMinor: tree.campaign.budget?.dailyBudgetMinorUnits ?? null,
      }
    : null,
  adSets: tree.adSets.map((adSet) => ({
    id: adSet.id,
    pathKey: adSet.pathKey,
    name: adSet.name,
    budgetMinor: adSet.budgetHeldByCampaign ? null : adSet.dailyBudgetMinorUnits,
    audience: targetingSummary(adSet.derived.targeting),
    ads: adSet.ads.map((ad) => ({ id: ad.id, pathKey: ad.pathKey, name: ad.name })),
  })),
});

/** What keeps "Deploy paused" disabled, each named in words a person can act on. */
function DeployBlockers({ blockers }: { blockers: DeployBlocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <div
      className="rounded-lg bg-warning/10 px-3 py-2.5 text-sm"
      data-testid="scaffold-deploy-blockers"
    >
      <p className="font-medium">Before this can deploy</p>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
        {blockers.map((blocker) => (
          <li
            key={`${blocker.code}:${blocker.message}`}
            data-testid="scaffold-deploy-blocker"
            data-code={blocker.code}
          >
            {blocker.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

type DeployMode = 'approve' | 'open' | 'none';

export function PaidScaffoldCard({
  scaffold,
  approval,
  resolution,
  denial,
  optimisticDecision,
  isStreaming,
  onDecide,
  onDeploy,
  onRequestCreative,
  supersededByVersion,
  structure = null,
}: {
  scaffold: JainaScaffoldState;
  /** The same turn's drawing of this scaffold (a copy's diff), drawn here instead of twice. */
  structure?: CampaignStructurePayload | null;
  approval: JainaToolApprovalRequiredPayload | null;
  resolution: JainaToolApprovalResolvedPayload | null;
  denial: JainaToolOutputDeniedPayload | null;
  optimisticDecision: ScaffoldDecision | null;
  isStreaming: boolean;
  /** The newer version of this scaffold the thread proposed after this one, if any. */
  supersededByVersion?: number;
  onRequestCreative?: (query: string) => void;
  onDecide?: (
    approval: JainaToolApprovalRequiredPayload,
    decision: ScaffoldDecision,
    publicationMode?: JainaPublicationMode,
  ) => void;
  /** Opens the deploy gate with no model turn. */
  onDeploy?: (
    action: JainaOperatorAction,
    displayText: string,
    onSettled?: (outcome: OperatorActionOutcome) => void,
  ) => void;
}) {
  const [selectedPathKey, setSelectedPathKey] = React.useState<string | null>(null);
  // Set on click and cleared when a gate arrives: the gate lands on a NEW card, so this one
  // says so instead of looking like the click did nothing.
  const [deployRequested, setDeployRequested] = React.useState(false);
  // Why the last Deploy paused did not open a gate, in the Backend's own words.
  const [deployError, setDeployError] = React.useState<string | null>(null);
  const [deployOpenedBelow, setDeployOpenedBelow] = React.useState(false);

  const {
    tree: savedTree,
    rows,
    header,
    isLoading,
    isError,
    error,
  } = usePaidScaffoldTree({
    scaffoldVersionId: scaffold.scaffoldId,
    overlay: scaffold.progressByNode,
    settledAt: scaffold.receipt?.completedAt ?? null,
  });
  // A canvas holding this scaffold draws it live — its edits show here as they are made.
  const liveTree = useLiveCanvasTree(scaffold.parentScaffoldId ?? header?.scaffoldId ?? null);
  const tree = liveTree ?? savedTree;

  const accountCurrency = useAdAccountCurrency(
    scaffold.brandId ?? header?.brandId ?? '',
    scaffold.adAccountId ?? header?.adAccountId ?? null,
  );
  const plan = scaffold.scaffoldPlan ?? header?.plan ?? null;
  const currency = plan?.currency ?? accountCurrency;
  const contentHash = scaffold.contentHash ?? header?.contentHash ?? null;
  const name =
    scaffold.name ??
    header?.name ??
    tree?.campaign?.name ??
    firstCampaignNameOf(scaffold.plan) ??
    'Scaffold';
  const version = scaffold.version ?? header?.version ?? null;
  const parentScaffoldId = scaffold.parentScaffoldId ?? header?.scaffoldId ?? null;
  const { sessionId, onScaffoldFocus } = useScaffoldThread();
  const canvasHref = parentScaffoldId ? scaffoldCanvasHref(parentScaffoldId, sessionId) : null;
  // Beside a companion canvas, "Open in canvas" shows the scaffold there; elsewhere it links
  // to the Canvas page.
  const openInCompanion =
    onScaffoldFocus && parentScaffoldId ? () => onScaffoldFocus(parentScaffoldId) : undefined;
  // The rows once they hold the campaign; before that, the turn's own drawing of it.
  const treeHasNodes = Boolean(tree && (tree.campaign || tree.adSets.length > 0));
  const readModel = React.useMemo(
    () =>
      tree && treeHasNodes
        ? campaignViewFromScaffoldRows(treeSourceOf(tree), {
            currency,
            diff: structure?.diff ?? null,
          })
        : structure
          ? campaignViewFromStructure(structure)
          : null,
    [tree, treeHasNodes, currency, structure],
  );

  const summary = React.useMemo(
    () => scaffoldSummaryOf(plan, tree, currency),
    [plan, tree, currency],
  );
  const audiences = React.useMemo(() => (plan ? audienceLinesOf(plan) : []), [plan]);
  const creatives = React.useMemo(() => creativeTilesOf(tree, plan), [tree, plan]);
  // The saved rows, not the live canvas draft: the field list is what the version on screen —
  // the one "Deploy paused" approves — will build, and who supplied each value of it.
  const fieldGroups = React.useMemo(
    () => scaffoldFieldGroupsOf({ plan, rows, currency }),
    [plan, rows, currency],
  );
  const blockers = React.useMemo(
    () =>
      deployBlockersOf({
        plan,
        planLoaded: Boolean(scaffold.scaffoldPlan) || header !== null,
        tree,
        contentHash,
      }),
    [plan, scaffold.scaffoldPlan, header, tree, contentHash],
  );

  const ads = tree?.adSets.flatMap((adSet) => adSet.ads) ?? [];
  const selectedAd =
    ads.find((ad) => ad.pathKey === selectedPathKey) ??
    ads.find((ad) => !ad.creativeAssetId) ??
    ads[0];
  const requestCreative =
    selectedAd && onRequestCreative && header?.contentHash && header.adAccountId
      ? async (format: 'image' | 'video') => {
          const graph = useCampaignStore.getState();
          const node = graph.nodes.find(
            (item) =>
              item.type === 'creative' &&
              item.data.provenance?.pathKey === `${selectedAd.pathKey}/creative`,
          );
          const query =
            node && graph.hydration?.versionId === scaffold.scaffoldId
              ? (
                  await buildCampaignCreativeRequest({
                    ...graph,
                    nodeId: node.id,
                    format,
                    brandId: header.brandId,
                    adAccountId: header.adAccountId!,
                  })
                ).query
              : scaffoldCreativeQuery(
                  {
                    scaffold_version_id: scaffold.scaffoldId,
                    content_hash: header.contentHash!,
                    path_key: selectedAd.pathKey,
                    expected_asset_id: selectedAd.creativeAssetId,
                  },
                  format,
                );
          onRequestCreative(query);
        }
      : undefined;

  const gate = approval ? GATE_BY_TOOL_NAME[approval.toolName] : undefined;
  const expired = approval?.expiresAt ? Date.parse(approval.expiresAt) < Date.now() : false;
  const decided = optimisticDecision ?? (resolution ? resolution.decision : null);
  const approvedOrRunning = decided === 'approve' || decided === 'approved';
  // A version a newer one replaced (a correction in words, a canvas save) can no longer be
  // deployed — the Backend refuses a version that is not current — so it offers nothing to
  // approve. Once it has a receipt it is history either way, and the receipt says what happened.
  const superseded =
    !scaffold.receipt &&
    (supersededByVersion !== undefined ||
      Boolean(header?.currentVersionId && header.currentVersionId !== scaffold.scaffoldId));
  const liveApproval = Boolean(approval && gate && !decided && !expired && !superseded);

  React.useEffect(() => {
    if (approval) setDeployRequested(false);
  }, [approval]);

  const deployMode: DeployMode =
    scaffold.receipt || approvedOrRunning || superseded
      ? 'none'
      : liveApproval && onDecide
        ? 'approve'
        : onDeploy
          ? 'open'
          : 'none';

  const handleDeploy = () => {
    if (deployMode === 'approve' && approval) {
      onDecide?.(approval, 'approve');
      return;
    }
    if (deployMode !== 'open' || !contentHash || deployRequested) return;
    setDeployRequested(true);
    setDeployError(null);
    setDeployOpenedBelow(false);
    onDeploy?.(
      {
        tool: 'paid_scaffold_deploy',
        input: { scaffold_version_id: scaffold.scaffoldId, content_hash: contentHash },
      },
      `Deploy paused: ${name ?? 'this scaffold'}${version ? ` v${version}` : ''}`,
      (outcome) => {
        setDeployRequested(false);
        if (outcome.ok) setDeployOpenedBelow(true);
        else setDeployError(outcome.reason);
      },
    );
  };

  const progressTotal = scaffold.lastProgress?.total ?? 0;
  const progressDone = Object.values(scaffold.progressByNode).filter(
    (entry) => entry.status === 'succeeded' || entry.status === 'skipped',
  ).length;
  const preview = approval?.preview?.rows.length ? approval.preview : null;

  return (
    // A plan awaiting a decision: the answer's decision module — primary tint, no border.
    <AgentDecisionCard
      className="rounded-xl border-0 bg-primary/10"
      data-testid="paid-scaffold-card"
      data-scaffold-version={scaffold.scaffoldId}
    >
      <div className="px-4 pt-3">
        <AgentCardEyebrow
          label="Paid campaign scaffold"
          right={
            <ScaffoldStatus
              superseded={superseded ? (supersededByVersion ?? null) : undefined}
              awaiting={Boolean(approval)}
              decided={decided}
              receipt={scaffold.receipt}
              expired={expired}
              tree={tree}
            />
          }
        />
      </div>
      <AgentCardBody className="flex flex-col gap-4 pt-1 pb-4">
        <div>
          {name ? (
            <AgentCardTitle>
              {name}
              {version ? (
                <span className="ml-1.5 font-normal text-muted-foreground text-sm">v{version}</span>
              ) : null}
              {liveTree ? (
                <span
                  className="ml-1.5 font-normal text-primary-ink text-xs"
                  data-testid="scaffold-live-canvas"
                >
                  Live on canvas
                </span>
              ) : null}
            </AgentCardTitle>
          ) : null}
          <AgentCardSummary>{summaryLine(scaffold, tree)}</AgentCardSummary>
        </div>

        <ScaffoldSummaryStrip summary={summary} />

        {progressTotal > 0 && !scaffold.receipt ? (
          <div className="flex flex-col gap-1">
            <Progress value={(progressDone / progressTotal) * 100} className="h-1.5" />
            <span className="text-muted-foreground text-xs tabular-nums">
              {progressDone} of {progressTotal} created
            </span>
          </div>
        ) : null}

        <ScaffoldReceiptNotice scaffold={scaffold} />

        {superseded ? (
          <p
            className="rounded-lg bg-background/80 px-3 py-2 text-muted-foreground text-sm"
            data-testid="scaffold-superseded"
          >
            {supersededByVersion !== undefined
              ? `v${supersededByVersion} replaced this version, so it can no longer be deployed. Review and approve v${supersededByVersion} instead.`
              : 'A newer version replaced this one, so it can no longer be deployed. Review and approve the newer version instead.'}
          </p>
        ) : null}

        {preview && !decided && !superseded ? (
          <section className="flex flex-col gap-1.5" data-testid="scaffold-gate-preview">
            <h4 className="font-medium text-foreground text-sm">What deploying creates</h4>
            <div className="rounded-lg bg-background/80 px-1 py-1.5">
              <ApprovalChangeTable preview={preview} />
            </div>
          </section>
        ) : null}

        <ScaffoldEvidence plan={plan} />
        <ScaffoldAudiences audiences={audiences} />
        <ScaffoldCreatives tiles={creatives} brandId={scaffold.brandId ?? header?.brandId} />
        <ScaffoldFields groups={fieldGroups} />

        {isError ? (
          <p className="text-destructive text-sm">
            {error?.message ?? 'Could not load the scaffold.'}
          </p>
        ) : readModel ? (
          <LecturaView
            size="chat"
            model={readModel}
            onOpen={openInCompanion}
            openHref={canvasHref}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            {isLoading ? 'Loading the scaffold…' : 'This scaffold has no nodes.'}
          </p>
        )}

        {selectedAd && header ? (
          <>
            <label className="mt-2 flex items-center gap-2 text-xs">
              Creative slot
              <select
                aria-label="Creative slot"
                className="min-w-0 rounded bg-background p-1"
                value={selectedAd.pathKey}
                onChange={(event) => setSelectedPathKey(event.target.value)}
              >
                {ads.map((ad) => (
                  <option key={ad.pathKey} value={ad.pathKey}>
                    {ad.name}
                  </option>
                ))}
              </select>
            </label>
            <ScaffoldCreativePreview
              brandId={header.brandId}
              assetId={selectedAd.creativeAssetId}
              name={selectedAd.name}
              onGenerate={requestCreative}
              disabled={
                isStreaming ||
                !['proposed', 'built'].includes(header.lifecycle ?? 'proposed') ||
                Boolean(approval) ||
                superseded
              }
            />
          </>
        ) : null}

        {denial?.reason ? (
          <p className="text-muted-foreground text-sm">Reason: {denial.reason}</p>
        ) : null}

        {expired && !decided ? (
          <p className="text-muted-foreground text-sm">
            That approval expired, so nothing was created. Deploy again to open a fresh one.
          </p>
        ) : null}

        {deployMode !== 'none' && !scaffold.receipt ? <DeployBlockers blockers={blockers} /> : null}

        {deployError ? (
          <p
            className="rounded-lg bg-destructive/5 px-3 py-2 text-destructive text-sm"
            data-testid="scaffold-deploy-error"
            role="alert"
          >
            {deployError}
          </p>
        ) : null}
      </AgentCardBody>

      {liveApproval && onDecide && approval && gate?.gate === 'publish' ? (
        <AgentActions className="flex-wrap px-4 pb-4">
          <AgentButton
            variant="ghost"
            disabled={isStreaming}
            onClick={() => onDecide?.(approval, 'deny')}
          >
            Deny
          </AgentButton>
          <AgentButton
            variant="ghost"
            disabled={isStreaming}
            onClick={() => onDecide?.(approval, 'approve', 'publish_only')}
          >
            Publish only
          </AgentButton>
          <AgentButton
            variant="primary"
            disabled={isStreaming}
            onClick={() => onDecide?.(approval, 'approve', 'publish_and_enroll')}
          >
            Publish &amp; auto-enroll
          </AgentButton>
        </AgentActions>
      ) : deployMode !== 'none' ? (
        <AgentActions className="mt-0 flex-wrap justify-between gap-2 px-4 py-3">
          <p className="min-w-0 max-w-[40ch] text-muted-foreground text-xs leading-snug">
            {deployRequested
              ? 'Opening the approval below…'
              : deployOpenedBelow
                ? 'The approval opened below — answer it there.'
                : 'Everything lands paused. Going live is a separate unpause you approve.'}
          </p>
          <div className="flex items-center gap-1">
            {deployMode === 'approve' && approval ? (
              <AgentButton
                variant="ghost"
                disabled={isStreaming}
                onClick={() => onDecide?.(approval, 'deny')}
              >
                Dismiss
              </AgentButton>
            ) : null}
            <AgentButton
              variant="primary"
              disabled={
                isStreaming ||
                deployRequested ||
                blockers.length > 0 ||
                (deployMode === 'open' && !contentHash)
              }
              onClick={handleDeploy}
              data-testid="scaffold-deploy"
              data-action={deployMode}
              title={blockers[0]?.message}
            >
              {deployMode === 'approve' && gate ? gate.label : 'Deploy paused'}
            </AgentButton>
          </div>
        </AgentActions>
      ) : null}
    </AgentDecisionCard>
  );
}

/** A pre-wave frame's campaign skeleton, `plan.campaigns[0].name`, when nothing else names it. */
function firstCampaignNameOf(plan: unknown): string | null {
  const campaigns = (plan as { campaigns?: unknown } | null)?.campaigns;
  const first = Array.isArray(campaigns) ? (campaigns[0] as { name?: unknown } | undefined) : null;
  return typeof first?.name === 'string' && first.name ? first.name : null;
}

function ScaffoldStatus({
  superseded,
  awaiting,
  decided,
  receipt,
  expired,
  tree,
}: {
  /** Set when a newer version replaced this one: its number, or null when only the row knows. */
  superseded?: number | null;
  /** An approval is open on this card. Propose is ungated, so a bare proposal has none. */
  awaiting: boolean;
  decided: ScaffoldDecision | 'approved' | 'denied' | null;
  receipt: JainaScaffoldState['receipt'];
  expired: boolean;
  tree: ScaffoldTree | null;
}) {
  if (receipt) {
    if (receipt.publicationMode) {
      return receipt.status === 'completed' ? (
        <StatusLabel tone="done">
          {receipt.publicationMode === 'publish_and_enroll' ? 'Published & enrolled' : 'Published'}
        </StatusLabel>
      ) : (
        <StatusLabel tone="failed">Publication stopped</StatusLabel>
      );
    }
    const tone =
      receipt.status === 'completed' ? 'done' : receipt.status === 'partial' ? 'running' : 'failed';
    return <StatusLabel tone={tone}>{receipt.status}</StatusLabel>;
  }
  if (superseded !== undefined) {
    return (
      <StatusLabel tone="neutral">
        {superseded === null ? 'Superseded by a newer version' : `Superseded by v${superseded}`}
      </StatusLabel>
    );
  }
  if (decided === 'deny' || decided === 'denied') {
    return <StatusLabel tone="neutral">Declined — nothing created</StatusLabel>;
  }
  if (decided === 'approve' || decided === 'approved') {
    return <StatusLabel tone="running">Approved</StatusLabel>;
  }
  if (expired) return <StatusLabel tone="neutral">Expired</StatusLabel>;
  if (awaiting) return <StatusLabel tone="waiting">Awaiting your approval</StatusLabel>;
  // A reloaded proposal can be older than a build that has since run in a later turn.
  const onMeta = tree?.counts.created ?? 0;
  if (onMeta > 0) {
    return <StatusLabel tone="done">{onMeta} on Meta</StatusLabel>;
  }
  return <StatusLabel tone="neutral">Proposed — nothing on Meta yet</StatusLabel>;
}

/**
 * Unrecorded Meta ids are the highest-priority line in any receipt: they are objects
 * that may exist without a record, so a retry would duplicate them. Surfaced above
 * everything else rather than buried in an error list.
 */
function ScaffoldReceiptNotice({ scaffold }: { scaffold: JainaScaffoldState }) {
  const receipt = scaffold.receipt as
    | (Record<string, unknown> & { errors?: { message: string }[] })
    | null;
  if (!receipt) return null;
  const unrecorded = Array.isArray(receipt.unrecordedMetaObjectIds)
    ? (receipt.unrecordedMetaObjectIds as string[])
    : [];

  if (unrecorded.length > 0) {
    return (
      <div className="rounded-md bg-warning/10 p-2.5 text-sm">
        <p className="font-medium">
          {unrecorded.length} object{unrecorded.length === 1 ? '' : 's'} may exist on Meta without a
          record.
        </p>
        <p className="text-muted-foreground">
          Do not retry this gate — read the ad account first, or the retry will create duplicates.
        </p>
      </div>
    );
  }

  const firstError = receipt.errors?.[0]?.message;
  return firstError ? <p className="text-destructive text-sm">{firstError}</p> : null;
}
