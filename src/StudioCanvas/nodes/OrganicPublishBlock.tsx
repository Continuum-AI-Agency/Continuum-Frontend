'use client';

import { DRAFT_INPUT_HANDLE, type PublishEvent } from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import { CalendarClock, Copy, Send, Share2, Trash2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import {
  PublishIntentSummary,
  type PublishIntentSummaryData,
} from '@/components/organic/primitives/PublishIntentSummary';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { describePublishError, parseSSE, publishPlatformLabel } from '@/lib/organic/publish-utils';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { OrganicPublishNodeData, PlannerDraftNodeData, StudioNode } from '../types';
import { workflowNodeError } from '../utils/workflowUiFailure';
import { NodeBadge, NodeTitleBar } from './NodeChrome';
import {
  fetchOrganicPublishIntent,
  type OrganicPublishIntent,
  publishOrganicDraft,
  scheduleOrganicDraft,
} from './publish/publishingApi';

/** The saved Planner draft wired into this node, if there is one. */
export function upstreamDraft(args: {
  nodeId: string;
  nodes: StudioNode[];
  edges: Array<{ target?: string; targetHandle?: string | null; source: string }>;
}): {
  draftId: string;
  saved: boolean;
  platform?: string;
  accountId?: string;
  title?: string;
} | null {
  const edge = args.edges.find(
    (candidate) =>
      candidate.target === args.nodeId && candidate.targetHandle === DRAFT_INPUT_HANDLE,
  );
  if (!edge) return null;
  const source = args.nodes.find((node) => node.id === edge.source);
  if (!source || source.type !== 'plannerDraft') return null;
  const data = source.data as PlannerDraftNodeData;
  if (!data.targetDraftId) return null;
  return {
    draftId: data.targetDraftId,
    // A bound-but-never-saved draft exists as a row only if it was FOUND. A created one
    // is not on the calendar until its node saves, and publishing it would 404.
    saved: Boolean(data.savedAt) || Boolean(data.targetUpdatedAt),
    ...(data.platform ? { platform: data.platform } : {}),
    ...(data.platformAccountId ? { accountId: data.platformAccountId } : {}),
    ...(data.targetTitle ? { title: data.targetTitle } : {}),
  };
}

/**
 * Post the upstream Planner draft — now, or by arming its schedule.
 *
 * A canvas Run never reaches this node (it is not runnable): a post is irreversible and
 * publicly visible, so it happens only when a human presses the button and then confirms
 * against the facts the server says it will actually send.
 *
 * The confirmation dialog is LOCAL rather than the shared `useDestructiveConfirmation`
 * hook, deliberately: that hook's context fails OPEN when no provider is mounted, which
 * on this surface would mean publishing with no confirmation at all.
 */
export function OrganicPublishBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<OrganicPublishNodeData>>) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');
  const publishText = useUiTranslations('organic');

  const updateNode = useStudioStore((state) => state.updateNode);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const { show } = useToast();
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const edges = useStudioStore((state) => state.edges);
  const brandId = useStudioStore((state) => state.brandId);

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  // The intent hash lives in component state, never on node data: canvas persistence
  // strips long opaque strings, and a confirmation must not outlive the session anyway.
  const [pending, setPending] = useState<OrganicPublishIntent | null>(null);

  const draft = useMemo(() => upstreamDraft({ nodeId: id, nodes, edges }), [edges, id, nodes]);
  const schedule = data.schedule ?? 'now';

  const patchData = useCallback(
    (patch: Partial<OrganicPublishNodeData>) => {
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as OrganicPublishNodeData), ...patch },
      }));
      useStudioStore.getState().triggerSave();
    },
    [id, updateNode],
  );

  const askToPublish = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const intent = await fetchOrganicPublishIntent(draft.draftId, draft.accountId ?? null);
      if (!intent) {
        const message = translateUi('publishCheckFailed');
        patchData({ error: message });
        show({
          title: translateUi('publish_failed_2fe0dace'),
          description: message,
          variant: 'error',
        });
        return;
      }
      setPending(intent);
    } finally {
      setBusy(false);
    }
  }, [draft, patchData, show, translateUi]);

  const confirmPublish = useCallback(async () => {
    const intent = pending;
    setPending(null);
    if (!draft || !intent?.intent_hash) return;
    setBusy(true);
    setStage('started');
    patchData({ error: undefined });
    try {
      const body: Record<string, unknown> = {
        postType: intent.format,
        confirmationHash: intent.intent_hash,
        ...(brandId ? { brandId } : {}),
        ...(intent.platform ? { platform: intent.platform } : {}),
        ...(intent.account.id ? { accountId: intent.account.id } : {}),
      };
      const stream = await publishOrganicDraft({ draftId: draft.draftId, body });
      if (!stream) throw new Error('Empty response from the publisher.');

      for await (const { event, data: raw } of parseSSE(stream)) {
        let parsed: PublishEvent;
        try {
          parsed = JSON.parse(raw) as PublishEvent;
        } catch {
          continue;
        }
        if (event === 'processing') {
          setStage((parsed as { stage?: string }).stage ?? 'processing');
        } else if (event === 'published') {
          const published = parsed as Extract<PublishEvent, { type: 'published' }>;
          patchData({
            publishedAt: new Date().toISOString(),
            platformPostId: published.postId ?? undefined,
            error: undefined,
          });
          show({
            title: translateUi('published_2ef42ec2'),
            description: translateUi('live_on_value0_f5ddaa0f', {
              value0: String(publishPlatformLabel(published.platform)),
            }),
            variant: 'success',
          });
        } else if (event === 'failed') {
          const failed = parsed as Extract<PublishEvent, { type: 'failed' }>;
          const message = describePublishError(failed.code, failed.error, publishText);
          patchData({ error: message });
          show({
            title: translateUi('publish_failed_2fe0dace'),
            description: message,
            variant: 'error',
          });
        }
      }
    } catch (cause) {
      // NEVER auto-retry: a network error says nothing about whether the post went out.
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : translateUi('publishing_failed_check_the_post_th_389f8146');
      patchData({ error: message });
      show({
        title: translateUi('publish_failed_2fe0dace'),
        description: message,
        variant: 'error',
      });
    } finally {
      setBusy(false);
      setStage(null);
    }
  }, [brandId, draft, patchData, pending, show, translateUi, publishText]);

  const armSchedule = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await scheduleOrganicDraft(draft.draftId);
      patchData({ publishedAt: undefined, error: undefined });
      show({
        title: translateUi('scheduled_4724f344'),
        description: translateUi('the_planner_will_publish_this_at_it_4dc2012f'),
        variant: 'success',
      });
    } catch (cause) {
      const message = uiErrorText(cause);
      patchData({ error: message });
      show({
        title: translateUi('could_not_schedule_4374e42e'),
        description: message,
        variant: 'warning',
      });
    } finally {
      setBusy(false);
    }
  }, [draft, patchData, show, translateUi, uiErrorText]);

  const blockedReason = !draft
    ? translateUi('publishDraftRequired')
    : !draft.saved
      ? translateUi('publishSavedDraftRequired')
      : null;

  return (
    <div
      className={cn(
        'relative group h-full w-full min-w-[280px] min-h-[240px] rounded-xl transition-shadow',
        isSelectedByOther && 'selected-by-other',
      )}
      style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
    >
      <NodeResizer
        minWidth={280}
        minHeight={240}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
      />
      <CanvasNode
        selected={selected}
        handles={{ target: false, source: false }}
        className="h-full w-full overflow-hidden p-0"
      >
        <NodeTitleBar icon={Share2} label={translateUi('post_to_platform_03f4afb2')}>
          <NodeBadge>{translateUi('organic_89b8cb68')}</NodeBadge>
        </NodeTitleBar>
        <NodeContent className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5 text-xs">
          <p
            data-testid="publisher-handoff-state"
            className="-mx-1.5 -mt-1.5 border-b border-border/60 bg-muted/50 px-2 py-1 text-2xs text-muted-foreground"
          >
            {data.publishedAt
              ? translateUi('published_value0_99169b68', {
                  value0: String(data.platformPostId ? ` · ${data.platformPostId}` : ''),
                })
              : translateUi('a_canvas_run_never_publishes_this_p_917a10d9')}
          </p>

          <p className="truncate text-2xs text-muted-foreground">
            {draft ? (draft.title ?? draft.draftId) : translateUi('no_draft_wired_in_2627329e')}
          </p>

          <select
            className="nodrag h-8 rounded-md border border-border bg-background px-2"
            value={schedule}
            onChange={(event) =>
              patchData({ schedule: event.target.value as OrganicPublishNodeData['schedule'] })
            }
            aria-label={translateUi('when_to_post_f0ada023')}
          >
            <option value="now">{translateUi('post_now_977eb1a3')}</option>
            <option value="scheduled">
              {translateUi('schedule_for_its_planner_time_f31c3e77')}
            </option>
          </select>

          {blockedReason ? (
            <p className="rounded bg-amber-500/10 p-2 text-2xs text-amber-700">{blockedReason}</p>
          ) : null}
          {data.error ? (
            <p className="rounded bg-destructive/10 p-2 text-2xs text-destructive">
              {workflowNodeError(data, translateUi)}
            </p>
          ) : null}
          {stage ? <p className="text-2xs text-muted-foreground">{stage}…</p> : null}

          <Button
            className="nodrag mt-auto h-8 w-full text-xs"
            disabled={busy || Boolean(blockedReason)}
            onClick={schedule === 'now' ? askToPublish : armSchedule}
          >
            {schedule === 'now' ? (
              <Send className="mr-1.5" />
            ) : (
              <CalendarClock className="mr-1.5" />
            )}
            {busy
              ? translateUi('working_5474eef8')
              : schedule === 'now'
                ? translateUi('post_now_977eb1a3')
                : translateUi('schedule_f4830a1d')}
          </Button>
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="nodrag h-7 w-7"
              onClick={() => duplicateNode(id)}
            >
              <Copy />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="nodrag h-7 w-7 text-destructive"
              onClick={() => deleteNode(id)}
            >
              <Trash2 />
            </Button>
          </div>
        </NodeContent>
      </CanvasNode>

      <div className="absolute -left-2 top-1/2" title={translateUi('planner_draft_32cbb428')}>
        <Handle
          type="target"
          position={Position.Left}
          id={DRAFT_INPUT_HANDLE}
          className="studio-handle !h-4 !w-4 !border-2"
        />
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent className="nodrag">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {' '}
              {translateUi('publish_to_b7a69104')}{' '}
              {publishPlatformLabel(pending?.platform as never)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.publishable === false
                ? translateUi('this_post_is_not_ready_to_publish_y_be146908')
                : translateUi('this_posts_publicly_right_away_and__f08bd5d6')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending ? <PublishIntentSummary intent={pending as PublishIntentSummaryData} /> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi('cancel_19766ed6')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!pending?.publishable || !pending?.intent_hash}
              onClick={confirmPublish}
            >
              {' '}
              {translateUi('publish_859390eb')}{' '}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
