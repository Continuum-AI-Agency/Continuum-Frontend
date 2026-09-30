'use client';

import { DRAFT_INPUT_HANDLE, type PublishEvent, publishEventSchema } from '@continuum/contracts';
import type { NodeProps, Node as ReactFlowNode } from '@xyflow/react';
import { CalendarClock, Send, Share2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
import { describePublishError, parseSSE, publishPlatformLabel } from '@/lib/organic/publish-utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { OrganicPublishNodeData, PlannerDraftNodeData, StudioNode } from '../types';
import { ImplementationNode } from './ImplementationNode';
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
  if (source?.type !== 'plannerDraft') return null;
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
  const updateNode = useStudioStore((state) => state.updateNode);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const { show } = useToast();
  const nodes = useStudioStore((state) => state.nodes) as StudioNode[];
  const edges = useStudioStore((state) => state.edges);
  const brandId = useStudioStore((state) => state.brandId);

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  // The intent hash lives in component state, never on node data: canvas persistence
  // strips long opaque strings, and a confirmation must not outlive the session anyway.
  const [pendingMode, setPendingMode] = useState<'now' | 'scheduled'>('now');
  const activeRoomId = useStudioStore((state) => state.activeRoomId);
  const [pendingScope, setPendingScope] = useState<string | null>(null);
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [pending, setPending] = useState<OrganicPublishIntent | null>(null);

  const draft = useMemo(() => upstreamDraft({ nodeId: id, nodes, edges }), [edges, id, nodes]);
  const schedule = data.schedule ?? 'now';

  const patchData = useCallback(
    (patch: Partial<OrganicPublishNodeData>) => {
      if (
        useStudioStore.getState().brandId !== brandId ||
        useStudioStore.getState().activeRoomId !== activeRoomId
      )
        return;
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as OrganicPublishNodeData), ...patch },
      }));
      useStudioStore.getState().triggerSave();
    },
    [id, updateNode, brandId, activeRoomId],
  );

  const askToPublish = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const intent = await fetchOrganicPublishIntent(draft.draftId, draft.accountId ?? null);
      if (!intent) {
        const message = 'Could not check this post before publishing. Try again.';
        patchData({ error: message });
        show({ title: 'Publish failed', description: message, variant: 'error' });
        return;
      }
      if (
        useStudioStore.getState().brandId !== brandId ||
        useStudioStore.getState().activeRoomId !== activeRoomId
      )
        return;
      setPendingScope(`${brandId}:${activeRoomId}`);
      setPendingMode(schedule);
      setPendingDraftId(draft.draftId);
      setPending(intent);
    } finally {
      setBusy(false);
    }
  }, [draft, patchData, show, schedule, brandId, activeRoomId]);

  const confirmPublish = useCallback(async () => {
    const intent = pending;
    setPending(null);
    if (
      !draft ||
      !intent?.intent_hash ||
      draft.draftId !== pendingDraftId ||
      pendingScope !== `${brandId}:${activeRoomId}`
    )
      return;
    setBusy(true);
    setStage('started');
    patchData({ error: undefined });
    try {
      if (pendingMode === 'scheduled') {
        await scheduleOrganicDraft(draft.draftId, intent.intent_hash);
        patchData({
          scheduledAt: new Date().toISOString(),
          publishedAt: undefined,
          error: undefined,
        });
        show({
          title: 'Scheduled',
          description: 'The Planner will publish at the saved time.',
          variant: 'success',
        });
        return;
      }
      const body: Record<string, unknown> = {
        postType: intent.format,
        confirmationHash: intent.intent_hash,
        ...(brandId ? { brandId } : {}),
        ...(intent.platform ? { platform: intent.platform } : {}),
        ...(intent.account.id ? { accountId: intent.account.id } : {}),
      };
      const stream = await publishOrganicDraft({ draftId: draft.draftId, body });
      if (!stream) throw new Error('Empty response from the publisher.');

      let terminal = false;
      for await (const { data: raw } of parseSSE(stream)) {
        let parsed: PublishEvent;
        try {
          parsed = publishEventSchema.parse(JSON.parse(raw));
        } catch {
          continue;
        }
        if (parsed.type === 'processing') {
          setStage(parsed.stage ?? 'processing');
        } else if (parsed.type === 'published') {
          terminal = true;
          const published = parsed;
          patchData({
            publishedAt: new Date().toISOString(),
            platformPostId: published.postId ?? undefined,
            error: undefined,
          });
          show({
            title: 'Published',
            description: `Live on ${publishPlatformLabel(published.platform)}.`,
            variant: 'success',
          });
        } else if (parsed.type === 'failed') {
          terminal = true;
          const failed = parsed;
          const message = describePublishError(failed.code, failed.error);
          patchData({ error: message });
          show({ title: 'Publish failed', description: message, variant: 'error' });
        }
      }
      if (!terminal)
        throw new Error(
          'The publisher disconnected before returning a receipt. Check Planner and the platform before retrying.',
        );
    } catch (cause) {
      // NEVER auto-retry: a network error says nothing about whether the post went out.
      const message =
        cause instanceof Error && cause.message
          ? cause.message
          : 'Publishing failed. Check the post, then try again.';
      patchData({ error: message });
      show({ title: 'Publish failed', description: message, variant: 'error' });
    } finally {
      setBusy(false);
      setStage(null);
    }
  }, [
    brandId,
    draft,
    patchData,
    pending,
    show,
    pendingMode,
    pendingDraftId,
    pendingScope,
    activeRoomId,
  ]);

  const blockedReason = !draft
    ? 'Wire a Planner Draft into this node.'
    : !draft.saved
      ? 'Save the draft first — only a row on the planner can be published.'
      : null;

  return (
    <>
      <ImplementationNode
        id={id}
        selected={selected}
        title="Post to Platform"
        icon={Share2}
        summary={
          draft?.title ??
          (draft?.platform ? `Post to ${draft.platform}` : 'Connect a Planner Draft')
        }
        status={
          stage ??
          (data.publishedAt
            ? `Published · ${data.platformPostId ?? 'receipt saved'}`
            : data.scheduledAt
              ? 'Scheduled in Planner'
              : blockedReason
                ? `${blockedReason} Workflow pauses for publishing review.`
                : schedule === 'scheduled'
                  ? 'Review before activating the Planner schedule'
                  : 'Review before publishing publicly')
        }
        error={data.error}
        inputs={[{ id: DRAFT_INPUT_HANDLE, label: 'Saved draft' }]}
      >
        <Button
          size="sm"
          className="ml-auto"
          disabled={busy || Boolean(blockedReason) || Boolean(data.publishedAt || data.scheduledAt)}
          onClick={askToPublish}
        >
          {schedule === 'now' ? (
            <Send className="size-3.5" aria-hidden />
          ) : (
            <CalendarClock className="size-3.5" aria-hidden />
          )}
          {busy ? 'Checking…' : schedule === 'now' ? 'Review post' : 'Review schedule'}
        </Button>
      </ImplementationNode>
      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent className="nodrag">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMode === 'scheduled' ? 'Schedule' : 'Publish'} to{' '}
              {publishPlatformLabel(pending?.platform as never)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.publishable === false
                ? 'This post is not ready to publish yet.'
                : pendingMode === 'scheduled'
                  ? 'This activates the saved Planner schedule. Review the caption and account before it becomes public.'
                  : 'This posts publicly right away. Review the caption and account below.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingMode === 'scheduled' ? (
            <p className="text-sm">
              Planner time:{' '}
              {pending?.scheduled_at
                ? new Date(pending.scheduled_at).toLocaleString()
                : 'Save a future time in Planner first.'}
            </p>
          ) : null}
          {pending ? <PublishIntentSummary intent={pending as PublishIntentSummaryData} /> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !pending?.publishable ||
                !pending?.intent_hash ||
                (pendingMode === 'scheduled' &&
                  (!pending.scheduled_at || Date.parse(pending.scheduled_at) <= Date.now()))
              }
              onClick={confirmPublish}
            >
              {pendingMode === 'scheduled' ? 'Confirm schedule' : 'Publish'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
