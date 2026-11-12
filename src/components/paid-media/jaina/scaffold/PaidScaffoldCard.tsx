'use client';

import type {
  JainaOperatorAction,
  JainaPublicationMode,
  JainaToolApprovalRequiredPayload,
  JainaToolApprovalResolvedPayload,
  JainaToolOutputDeniedPayload,
} from '@continuum/contracts';
import { ExternalLink, Maximize2, Network, Table2 } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useMemo } from 'react';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  buildCampaignCreativeRequest,
  scaffoldCreativeQuery,
} from '@/lib/campaign-canvas/creativeGeneration';
import type { OperatorActionOutcome } from '@/lib/jaina/operatorOutcome';
import type { JainaScaffoldState } from '@/lib/jaina/scaffoldTypes';
import type { ScaffoldTree } from '@/lib/paid-media/scaffoldTree';
import { ScaffoldAdSetTable } from './ScaffoldAdSetTable';
import { ScaffoldCreativePreview } from './ScaffoldCreativePreview';
import {
  ScaffoldAudiences,
  ScaffoldCreatives,
  ScaffoldEvidence,
  ScaffoldSummaryStrip,
} from './ScaffoldPlanSections';
import { ScaffoldStatusPill } from './ScaffoldStatusPill';
import { ScaffoldTreeCanvas } from './ScaffoldTreeCanvas';
import { formatDailyBudget } from './scaffoldBudget';
import {
  audienceLinesOf,
  creativeTilesOf,
  type DeployBlocker,
  deployBlockersOf,
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
 * The graph is the DEFAULT view, and the table is the alternate.
 *
 * A scaffold's first question is structural — how many ad sets hang off this campaign,
 * how the ads divide between them, which branch failed — and a table answers that by
 * making the reader rebuild the tree in their head from indented rows. It was behind a
 * ghost icon in the table header, which is where it was found least.
 */
type ScaffoldView = 'graph' | 'table';

/** Below this the inline graph is unreadable (a campaign node alone is 300px). */
const NARROW_CARD_PX = 560;

/**
 * The card's own width, or null before the first measurement.
 *
 * Measured rather than container-queried because React Flow cannot be hidden with CSS:
 * `fitView` runs against a zero-sized box under `display: none` and never re-fits. So a
 * narrow card never MOUNTS the graph, and widening it (maximizing the panel) mounts a
 * fresh one at its real size.
 */
function useCardWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function ViewSwitch({
  view,
  onChange,
  onExpand,
  canvasHref,
}: {
  view: ScaffoldView;
  onChange: (next: ScaffoldView) => void;
  onExpand: () => void;
  canvasHref: string | null;
}) {
  const uiText = useTranslations('scale');
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1 rounded-md bg-background/80 p-0.5">
        {(
          [
            ['graph', 'Graph', Network],
            ['table', 'Table', Table2],
          ] as const
        ).map(([value, label, Icon]) => (
          <Button
            key={value}
            type="button"
            variant={view === value ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 gap-1.5 px-2"
            aria-pressed={view === value}
            onClick={() => onChange(value)}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {view === 'graph' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5"
            onClick={onExpand}
          >
            <Maximize2 className="size-3.5" />
            {uiText('expand_07548c2')}
          </Button>
        ) : null}
        {canvasHref ? (
          <Link
            href={canvasHref}
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-7 gap-1.5' })}
            data-testid="scaffold-open-canvas"
          >
            <ExternalLink className="size-3.5" />
            {uiText('open_on_canvas_41c4341')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

const OUTLINE_LIMIT = 6;

/** The tree at a glance for a card too narrow to draw it: one line per ad set. */
function ScaffoldOutline({ tree, currency }: { tree: ScaffoldTree; currency: string | null }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const hidden = tree.adSets.length - OUTLINE_LIMIT;
  return (
    <ul
      className="divide-y divide-foreground/5 rounded-xl bg-background/80 text-sm"
      data-testid="scaffold-outline"
    >
      {tree.campaign ? (
        <li className="truncate px-2.5 py-1.5 font-medium" title={tree.campaign.name}>
          {tree.campaign.name}
        </li>
      ) : null}
      {tree.adSets.slice(0, OUTLINE_LIMIT).map((adSet) => (
        <li key={adSet.pathKey} className="flex items-center gap-2 py-1.5 pr-2.5 pl-5">
          <span className="min-w-0 flex-1 truncate" title={adSet.name}>
            {adSet.name}
          </span>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {uiText.rich('sentence_e00f55060221', {
              budget: formatDailyBudget(adSet.dailyBudgetMinorUnits, currency, uiText, uiLocale),
              count: adSet.ads.length,
            })}
          </span>
          <ScaffoldStatusPill status={adSet.status} />
        </li>
      ))}
      {hidden > 0 ? (
        <li className="px-2.5 py-1.5 text-muted-foreground text-xs">
          {uiText.rich('sentence_3ccc5b438950', { count: hidden })}
        </li>
      ) : null}
    </ul>
  );
}

/** What keeps "Deploy paused" disabled, each named in words a person can act on. */
function DeployBlockers({ blockers }: { blockers: DeployBlocker[] }) {
  const uiText = useTranslations('scale');
  if (blockers.length === 0) return null;
  return (
    <div
      className="rounded-lg bg-warning/10 px-3 py-2.5 text-sm"
      data-testid="scaffold-deploy-blockers"
    >
      <p className="font-medium">{uiText('before_this_can_deploy_67e989e')}</p>
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
}: {
  scaffold: JainaScaffoldState;
  approval: JainaToolApprovalRequiredPayload | null;
  resolution: JainaToolApprovalResolvedPayload | null;
  denial: JainaToolOutputDeniedPayload | null;
  optimisticDecision: ScaffoldDecision | null;
  isStreaming: boolean;
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
  const uiText = useTranslations('scale');
  const GATE_BY_TOOL_NAME: Record<
    string,
    { gate: 'build' | 'populate' | 'activate' | 'deploy' | 'publish'; label: string }
  > = useMemo(
    () => ({
      paid_scaffold_deploy: { gate: 'deploy', label: uiText('deploy_paused_69832af') },
      paid_scaffold_publish: { gate: 'publish', label: uiText('publish_auto_enroll_3f60ffc') },
      paid_scaffold_build: { gate: 'build', label: uiText('approve_create_paused_0a8b9f8') },
      paid_scaffold_populate: { gate: 'populate', label: uiText('approve_add_creatives_2190137') },
      paid_scaffold_activate: { gate: 'activate', label: uiText('publish_only_1b2fd6a') },
    }),
    [uiText],
  );

  const creativeSlotControlId = React.useId();
  const [canvasOpen, setCanvasOpen] = React.useState(false);
  const [selectedPathKey, setSelectedPathKey] = React.useState<string | null>(null);
  const [view, setView] = React.useState<ScaffoldView>('graph');
  // Set on click and cleared when a gate arrives: the gate lands on a NEW card, so this one
  // says so instead of looking like the click did nothing.
  const [deployRequested, setDeployRequested] = React.useState(false);
  // Why the last Deploy paused did not open a gate, in the Backend's own words.
  const [deployError, setDeployError] = React.useState<string | null>(null);
  const [deployOpenedBelow, setDeployOpenedBelow] = React.useState(false);
  const measureRef = React.useRef<HTMLDivElement | null>(null);
  const width = useCardWidth(measureRef);

  const {
    tree: savedTree,
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
    uiText('scaffoldFallbackTitle');
  const version = scaffold.version ?? header?.version ?? null;
  const parentScaffoldId = scaffold.parentScaffoldId ?? header?.scaffoldId ?? null;
  const { sessionId, onScaffoldFocus } = useScaffoldThread();
  const canvasHref = parentScaffoldId ? scaffoldCanvasHref(parentScaffoldId, sessionId) : null;
  // Beside a companion canvas, Expand edits the scaffold there; elsewhere it opens the dialog.
  const handleExpand =
    onScaffoldFocus && parentScaffoldId
      ? () => onScaffoldFocus(parentScaffoldId)
      : () => setCanvasOpen(true);

  const uiLocale = useLocale();
  const summary = React.useMemo(
    () => scaffoldSummaryOf(plan, tree, currency, uiText, uiLocale),
    [plan, tree, currency, uiText, uiLocale],
  );
  const audiences = React.useMemo(
    () => (plan ? audienceLinesOf(plan, uiText, uiLocale) : []),
    [plan, uiText, uiLocale],
  );
  const creatives = React.useMemo(() => creativeTilesOf(tree, plan), [tree, plan]);
  const blockers = React.useMemo(
    () =>
      deployBlockersOf({
        plan,
        planLoaded: Boolean(scaffold.scaffoldPlan) || header !== null,
        tree,
        contentHash,
        translate: uiText,
      }),
    [plan, scaffold.scaffoldPlan, header, tree, contentHash, uiText],
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
  const liveApproval = Boolean(approval && gate && !decided && !expired);

  React.useEffect(() => {
    if (approval) setDeployRequested(false);
  }, [approval]);

  const deployMode: DeployMode =
    scaffold.receipt || approvedOrRunning
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
    <>
      {/* A plan awaiting a decision: the answer's decision module — primary tint, no border. */}
      <AgentDecisionCard
        className="rounded-xl border-0 bg-primary/10"
        data-testid="paid-scaffold-card"
        data-scaffold-version={scaffold.scaffoldId}
      >
        <div className="px-4 pt-3">
          <AgentCardEyebrow
            label={uiText('paid_campaign_scaffold_f0cf0f7')}
            right={
              <ScaffoldStatus
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
                  <span className="ml-1.5 font-normal text-muted-foreground text-sm">
                    v{version}
                  </span>
                ) : null}
                {liveTree ? (
                  <span
                    className="ml-1.5 font-normal text-primary-ink text-xs"
                    data-testid="scaffold-live-canvas"
                  >
                    {uiText('live_on_canvas_242bea9')}
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
                {uiText.rich('sentence_1df524ac11d6', { v0: progressDone, v1: progressTotal })}
              </span>
            </div>
          ) : null}

          <ScaffoldReceiptNotice scaffold={scaffold} />

          {preview && !decided ? (
            <section className="flex flex-col gap-1.5" data-testid="scaffold-gate-preview">
              <h4 className="font-medium text-foreground text-sm">
                {uiText('what_deploying_creates_5616a89')}
              </h4>
              <div className="rounded-lg bg-background/80 px-1 py-1.5">
                <ApprovalChangeTable preview={preview} />
              </div>
            </section>
          ) : null}

          <ScaffoldEvidence plan={plan} />
          <ScaffoldAudiences audiences={audiences} />
          <ScaffoldCreatives tiles={creatives} brandId={scaffold.brandId ?? header?.brandId} />

          {isError ? (
            <p className="text-destructive text-sm">
              {error?.message ?? uiText('could_not_load_the_scaffold_54f4621')}
            </p>
          ) : (
            <div ref={measureRef} className="flex flex-col gap-2">
              <ViewSwitch
                view={view}
                onChange={setView}
                onExpand={handleExpand}
                canvasHref={canvasHref}
              />
              {view === 'graph' && width !== null && width < NARROW_CARD_PX ? (
                tree ? (
                  <ScaffoldOutline tree={tree} currency={currency} />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {uiText('loading_the_scaffold_69393ab')}
                  </p>
                )
              ) : view === 'graph' ? (
                <div className="h-[380px] overflow-hidden rounded-lg bg-background">
                  {tree && width !== null ? (
                    <ScaffoldTreeCanvas
                      inline
                      tree={tree}
                      currency={currency}
                      selectedPathKey={selectedPathKey}
                      onSelect={setSelectedPathKey}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                      {isLoading
                        ? uiText('loading_the_scaffold_69393ab')
                        : uiText('this_scaffold_has_no_nodes_3c8d08e')}
                    </div>
                  )}
                </div>
              ) : (
                <ScaffoldAdSetTable tree={tree} isLoading={isLoading} currency={currency} />
              )}
            </div>
          )}

          {selectedAd && header ? (
            <>
              <label
                htmlFor={creativeSlotControlId}
                className="mt-2 flex items-center gap-2 text-xs"
              >
                {uiText.rich('sentence_facb4b619f65', {
                  v0: () => (
                    <select
                      id={creativeSlotControlId}
                      aria-label={uiText('creative_slot_e6c243c')}
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
                  ),
                })}
              </label>
              <ScaffoldCreativePreview
                brandId={header.brandId}
                assetId={selectedAd.creativeAssetId}
                name={selectedAd.name}
                onGenerate={requestCreative}
                disabled={
                  isStreaming ||
                  !['proposed', 'built'].includes(header.lifecycle ?? 'proposed') ||
                  Boolean(approval)
                }
              />
            </>
          ) : null}

          {denial?.reason ? (
            <p className="text-muted-foreground text-sm">
              {uiText.rich('sentence_aa11b9297c50', { v0: denial.reason })}
            </p>
          ) : null}

          {expired && !decided ? (
            <p className="text-muted-foreground text-sm">
              {uiText('that_approval_expired_so_nothing_was_created__b873ec9')}
            </p>
          ) : null}

          {deployMode !== 'none' && !scaffold.receipt ? (
            <DeployBlockers blockers={blockers} />
          ) : null}

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
              {uiText('deny_05a2d73')}
            </AgentButton>
            <AgentButton
              variant="ghost"
              disabled={isStreaming}
              onClick={() => onDecide?.(approval, 'approve', 'publish_only')}
            >
              {uiText('publish_only_1b2fd6a')}
            </AgentButton>
            <AgentButton
              variant="primary"
              disabled={isStreaming}
              onClick={() => onDecide?.(approval, 'approve', 'publish_and_enroll')}
            >
              {uiText('publish_auto_enroll_3f60ffc')}
            </AgentButton>
          </AgentActions>
        ) : deployMode !== 'none' ? (
          <AgentActions className="mt-0 flex-wrap justify-between gap-2 px-4 py-3">
            <p className="min-w-0 max-w-[40ch] text-muted-foreground text-xs leading-snug">
              {deployRequested
                ? uiText('opening_the_approval_below_055e92d')
                : deployOpenedBelow
                  ? uiText('the_approval_opened_below_answer_it_there_0d73446')
                  : uiText('everything_lands_paused_going_live_is_a_separ_2402fe6')}
            </p>
            <div className="flex items-center gap-1">
              {deployMode === 'approve' && approval ? (
                <AgentButton
                  variant="ghost"
                  disabled={isStreaming}
                  onClick={() => onDecide?.(approval, 'deny')}
                >
                  {uiText('dismiss_48845bf')}
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
                {deployMode === 'approve' && gate ? gate.label : uiText('deploy_paused_69832af')}
              </AgentButton>
            </div>
          </AgentActions>
        ) : null}
      </AgentDecisionCard>

      <Dialog open={canvasOpen} onOpenChange={setCanvasOpen}>
        <DialogContent className="flex h-[88vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm">
              {uiText('campaign_scaffold_tree_view_3f57d48')}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            {tree ? (
              <ScaffoldTreeCanvas
                tree={tree}
                currency={currency}
                selectedPathKey={selectedPathKey}
                onSelect={setSelectedPathKey}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A pre-wave frame's campaign skeleton, `plan.campaigns[0].name`, when nothing else names it. */
function firstCampaignNameOf(plan: unknown): string | null {
  const campaigns = (plan as { campaigns?: unknown } | null)?.campaigns;
  const first = Array.isArray(campaigns) ? (campaigns[0] as { name?: unknown } | undefined) : null;
  return typeof first?.name === 'string' && first.name ? first.name : null;
}

function ScaffoldStatus({
  awaiting,
  decided,
  receipt,
  expired,
  tree,
}: {
  /** An approval is open on this card. Propose is ungated, so a bare proposal has none. */
  awaiting: boolean;
  decided: ScaffoldDecision | 'approved' | 'denied' | null;
  receipt: JainaScaffoldState['receipt'];
  expired: boolean;
  tree: ScaffoldTree | null;
}) {
  const uiText = useTranslations('scale');
  if (receipt) {
    if (receipt.publicationMode) {
      return receipt.status === 'completed' ? (
        <StatusLabel tone="done">
          {receipt.publicationMode === 'publish_and_enroll'
            ? uiText('published_enrolled_0a74b98')
            : uiText('published_2ef42ec')}
        </StatusLabel>
      ) : (
        <StatusLabel tone="failed">{uiText('publication_stopped_1a96852')}</StatusLabel>
      );
    }
    const tone =
      receipt.status === 'completed' ? 'done' : receipt.status === 'partial' ? 'running' : 'failed';
    return <StatusLabel tone={tone}>{receipt.status}</StatusLabel>;
  }
  if (decided === 'deny' || decided === 'denied') {
    return <StatusLabel tone="neutral">{uiText('declined_nothing_created_6f7b586')}</StatusLabel>;
  }
  if (decided === 'approve' || decided === 'approved') {
    return <StatusLabel tone="running">{uiText('approved_87b42e4')}</StatusLabel>;
  }
  if (expired) return <StatusLabel tone="neutral">{uiText('expired_424a255')}</StatusLabel>;
  if (awaiting)
    return <StatusLabel tone="waiting">{uiText('awaiting_your_approval_9f09488')}</StatusLabel>;
  // A reloaded proposal can be older than a build that has since run in a later turn.
  const onMeta = tree?.counts.created ?? 0;
  if (onMeta > 0) {
    return (
      <StatusLabel tone="done">{uiText.rich('sentence_981d7b8d8aec', { v0: onMeta })}</StatusLabel>
    );
  }
  return <StatusLabel tone="neutral">{uiText('proposed_nothing_on_meta_yet_03c468d')}</StatusLabel>;
}

/**
 * Unrecorded Meta ids are the highest-priority line in any receipt: they are objects
 * that may exist without a record, so a retry would duplicate them. Surfaced above
 * everything else rather than buried in an error list.
 */
function ScaffoldReceiptNotice({ scaffold }: { scaffold: JainaScaffoldState }) {
  const uiText = useTranslations('scale');
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
          {uiText.rich('sentence_87b4f695af83', { count: unrecorded.length })}
        </p>
        <p className="text-muted-foreground">
          {uiText('do_not_retry_this_gate_read_the_ad_account_fi_424bd0e')}
        </p>
      </div>
    );
  }

  const firstError = receipt.errors?.[0]?.message;
  return firstError ? <p className="text-destructive text-sm">{firstError}</p> : null;
}
