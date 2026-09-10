'use client';

/**
 * The bar that turns the OpenAI canvas from a sketchpad into a view of a real campaign —
 * and, unlike its Meta sibling `ScaffoldRecordBar`, back again.
 *
 * `ScaffoldRecordBar` deliberately offers no save, because nothing in this app grants the
 * browser a write to `paid_scaffold_*`. Here we own the connection end to end, so this bar
 * DOES publish. What keeps that safe is not a gate but the API's shape: every object is
 * created paused and read back, and the one action that can make something serve is the
 * separate Activate button below.
 *
 * The publish confirmation lists the actual planned steps rather than a count. A dialog
 * that says "3 changes" is consent to nothing.
 */

import { AlertTriangle, Loader2, Pause, Play, Plus, Send } from 'lucide-react';
import React from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/ToastProvider';
import {
  createOpenAiAd,
  createOpenAiAdGroup,
  createOpenAiCampaign,
  fetchOpenAiCampaignTree,
  setOpenAiEntityState,
  updateOpenAiAd,
  updateOpenAiAdGroup,
  updateOpenAiCampaign,
  useOpenAiAdAccount,
  useOpenAiCampaigns,
} from '@/lib/api/openaiAds';
import { executeOpenAiPublish, seedExistingIds } from '@/lib/campaign-canvas/executeOpenAiPublish';
import { buildHydratedOpenAiGraph } from '@/lib/campaign-canvas/hydrateOpenAi';
import {
  describeOpenAiPublishStep,
  type OpenAiPublishPlan,
  planOpenAiPublish,
} from '@/lib/campaign-canvas/publishOpenAi';
import { useCampaignStore } from '../stores/useCampaignStore';

type OpenAiCampaignBarProps = {
  brandId: string;
  adAccountId: string | null;
};

export function OpenAiCampaignBar({ brandId, adAccountId }: OpenAiCampaignBarProps) {
  const { show } = useToast();
  const nodes = useCampaignStore((store) => store.nodes);
  const edges = useCampaignStore((store) => store.edges);
  const baseline = useCampaignStore((store) => store.openAiBaseline);
  const hydration = useCampaignStore((store) => store.openAiHydration);
  const isDirty = useCampaignStore((store) => store.isDirty);
  const loadOpenAiGraph = useCampaignStore((store) => store.loadOpenAiGraph);
  const startOpenAiDraft = useCampaignStore((store) => store.startOpenAiDraft);

  const scope = adAccountId ? { brandId, adAccountId } : null;
  const account = useOpenAiAdAccount(scope ?? {});
  const campaigns = useOpenAiCampaigns(scope ?? {});

  const [selectedId, setSelectedId] = React.useState('');
  const [isLoadingGraph, setIsLoadingGraph] = React.useState(false);
  const [plan, setPlan] = React.useState<OpenAiPublishPlan | null>(null);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isChangingState, setIsChangingState] = React.useState(false);

  const reload = React.useCallback(
    async (campaignId: string) => {
      if (!scope) return;
      setIsLoadingGraph(true);
      try {
        const tree = await fetchOpenAiCampaignTree(scope, campaignId);
        loadOpenAiGraph(
          buildHydratedOpenAiGraph(tree, {
            adAccountId: scope.adAccountId,
            currencyCode: account.data?.account.currency_code ?? null,
          }),
        );
      } catch (error) {
        show({
          title: 'Could not open the campaign',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
      } finally {
        setIsLoadingGraph(false);
      }
    },
    [account.data?.account.currency_code, loadOpenAiGraph, scope, show],
  );

  const handleSelect = React.useCallback(
    (campaignId: string) => {
      setSelectedId(campaignId);
      void reload(campaignId);
    },
    [reload],
  );

  const handleNew = React.useCallback(() => {
    setSelectedId('');
    startOpenAiDraft();
  }, [startOpenAiDraft]);

  /** Build the plan and show it. Nothing is sent until the dialog is confirmed. */
  const handlePreviewPublish = React.useCallback(() => {
    setPlan(planOpenAiPublish({ nodes, edges, baseline }));
  }, [baseline, edges, nodes]);

  const handleConfirmPublish = React.useCallback(async () => {
    if (!plan || !scope) return;
    setIsPublishing(true);
    try {
      const outcome = await executeOpenAiPublish(
        plan,
        {
          createCampaign: (body) => createOpenAiCampaign(scope, body as never),
          updateCampaign: (id, body) => updateOpenAiCampaign(scope, id, body as never),
          createAdGroup: (body) => createOpenAiAdGroup(scope, body as never),
          updateAdGroup: (id, body) => updateOpenAiAdGroup(scope, id, body as never),
          createAd: (body) => createOpenAiAd(scope, body as never),
          updateAd: (id, body) => updateOpenAiAd(scope, id, body as never),
          archive: (entity, id) => setOpenAiEntityState(scope, entity, id, 'archive'),
        },
        { seed: seedExistingIds(nodes) },
      );

      const campaignId =
        outcome.idsByNodeId[nodes.find((node) => node.type === 'openai-campaign')?.id ?? ''] ??
        hydration?.campaignId;

      if (outcome.failure) {
        // Report what LANDED as well as what broke. A partial publish is a real state, and
        // a bare "failed" would have someone retry a create that already succeeded.
        show({
          title: `Published ${outcome.applied.length} of ${plan.steps.length} changes`,
          description: `${describeOpenAiPublishStep(outcome.failure.step)} failed: ${outcome.failure.message}`,
          variant: 'error',
        });
      } else {
        show({
          title: 'Published',
          description: `${plan.steps.length} change${plan.steps.length === 1 ? '' : 's'} applied. Everything new is paused.`,
          variant: 'success',
        });
      }

      setPlan(null);
      // Re-read rather than patch ids onto the local graph: the campaign upstream is now
      // the source of truth, and a re-read is the only thing that proves what landed.
      if (campaignId) {
        setSelectedId(campaignId);
        await reload(campaignId);
        void campaigns.refetch();
      }
    } finally {
      setIsPublishing(false);
    }
  }, [campaigns, hydration?.campaignId, nodes, plan, reload, scope, show]);

  const handleStateChange = React.useCallback(
    async (action: 'activate' | 'pause') => {
      if (!scope || !hydration?.campaignId) return;
      setIsChangingState(true);
      try {
        await setOpenAiEntityState(scope, 'campaign', hydration.campaignId, action);
        show({
          title: action === 'activate' ? 'Campaign activated' : 'Campaign paused',
          variant: 'success',
        });
        await reload(hydration.campaignId);
      } catch (error) {
        show({
          title: 'Could not change the campaign state',
          description: error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        });
      } finally {
        setIsChangingState(false);
      }
    },
    [hydration?.campaignId, reload, scope, show],
  );

  const servable = account.data?.servable ?? true;
  const reviewReason = account.data?.account.review?.reason;
  const isActive = hydration?.campaignStatus === 'active';

  if (!adAccountId) {
    return (
      <div className="pointer-events-auto rounded-full border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
        Pick an OpenAI ad account to start.
      </div>
    );
  }

  return (
    <>
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border bg-background/90 px-2 py-1.5 shadow-sm backdrop-blur">
        {campaigns.isLoading ? (
          <Skeleton className="h-7 w-44 rounded-full" />
        ) : (
          <Select value={selectedId} onValueChange={handleSelect}>
            <SelectTrigger className="h-7 min-w-[11rem] rounded-full border-0 bg-muted/50 text-xs">
              <SelectValue placeholder="Open a campaign" />
            </SelectTrigger>
            <SelectContent>
              {(campaigns.data?.data ?? []).map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 rounded-full px-2 text-xs"
          onClick={handleNew}
        >
          <Plus className="h-3 w-3" />
          New
        </Button>

        {isLoadingGraph ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}

        {hydration ? (
          <Pill className="h-6 gap-1 px-2 text-2xs">
            <PillIndicator variant={isActive ? 'success' : 'info'} />
            {hydration.campaignStatus}
          </Pill>
        ) : null}

        {isDirty ? (
          <Pill className="h-6 gap-1 px-2 text-2xs">
            <PillIndicator variant="warning" />
            Edited
          </Pill>
        ) : null}

        {!servable ? (
          <Pill className="h-6 gap-1 px-2 text-2xs" title={reviewReason ?? undefined}>
            <PillIndicator variant="warning" />
            Review {account.data?.account.review?.status ?? 'pending'}
          </Pill>
        ) : null}

        <Button
          size="sm"
          className="h-7 gap-1 rounded-full px-2.5 text-xs"
          onClick={handlePreviewPublish}
          disabled={isPublishing || nodes.length === 0}
        >
          <Send className="h-3 w-3" />
          Publish changes
        </Button>

        {hydration ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 rounded-full px-2.5 text-xs"
            onClick={() => handleStateChange(isActive ? 'pause' : 'activate')}
            disabled={isChangingState || (!isActive && !servable)}
            title={
              !isActive && !servable
                ? 'This ad account cannot serve until its brand review is approved.'
                : undefined
            }
          >
            {isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {isActive ? 'Pause' : 'Activate'}
          </Button>
        ) : null}
      </div>

      <Dialog open={plan !== null} onOpenChange={(open) => !open && setPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {plan?.issues.length ? 'This campaign is not ready' : 'Publish to OpenAI Ads'}
            </DialogTitle>
            <DialogDescription>
              {plan?.issues.length
                ? 'Fix these before publishing.'
                : 'Everything created lands paused. Activating is a separate action.'}
            </DialogDescription>
          </DialogHeader>

          {plan?.issues.length ? (
            <ul className="space-y-1.5 text-sm">
              {plan.issues.map((issue) => (
                <li key={issue} className="flex items-start gap-2 text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          ) : plan?.steps.length ? (
            <ol className="max-h-72 space-y-1.5 overflow-y-auto text-sm">
              {plan.steps.map((step) => (
                <li
                  key={`${step.kind}:${step.nodeId}`}
                  className={
                    step.kind === 'archive'
                      ? 'rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-destructive'
                      : 'rounded-md border px-2 py-1.5'
                  }
                >
                  {describeOpenAiPublishStep(step)}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing has changed since this campaign was opened.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPlan(null)} disabled={isPublishing}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPublish}
              disabled={isPublishing || !plan || plan.issues.length > 0 || plan.steps.length === 0}
            >
              {isPublishing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Publish {plan?.steps.length ?? 0}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
