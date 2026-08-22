'use client';

import { DRAFT_INPUT_HANDLE, type PublishEvent } from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import { CalendarClock, Copy, Send, Trash2 } from 'lucide-react';
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
import { describePublishError, parseSSE, publishPlatformLabel } from '@/lib/organic/publish-utils';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { OrganicPublishNodeData, PlannerDraftNodeData, StudioNode } from '../types';
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
        const message = 'Could not check this post before publishing. Try again.';
        patchData({ error: message });
        show({ title: 'Publish failed', description: message, variant: 'error' });
        return;
      }
      setPending(intent);
    } finally {
      setBusy(false);
    }
  }, [draft, patchData, show]);

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
            title: 'Published',
            description: `Live on ${publishPlatformLabel(published.platform)}.`,
            variant: 'success',
          });
        } else if (event === 'failed') {
          const failed = parsed as Extract<PublishEvent, { type: 'failed' }>;
          const message = describePublishError(failed.code, failed.error);
          patchData({ error: message });
          show({ title: 'Publish failed', description: message, variant: 'error' });
        }
      }
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
  }, [brandId, draft, patchData, pending, show]);

  const armSchedule = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await scheduleOrganicDraft(draft.draftId);
      patchData({ publishedAt: undefined, error: undefined });
      show({
        title: 'Scheduled',
        description: 'The planner will publish this at its scheduled time.',
        variant: 'success',
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not schedule this draft.';
      patchData({ error: message });
      show({ title: 'Could not schedule', description: message, variant: 'warning' });
    } finally {
      setBusy(false);
    }
  }, [draft, patchData, show]);

  const blockedReason = !draft
    ? 'Wire a Planner Draft into this node.'
    : !draft.saved
      ? 'Save the draft first — only a row on the planner can be published.'
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
        <NodeContent className="flex h-full flex-col gap-2 p-3 text-xs">
          <div className="flex items-center justify-between font-medium">
            <span>Post to Platform</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
              Organic
            </span>
          </div>

          <p
            data-testid="publisher-handoff-state"
            className="rounded bg-muted/60 px-2 py-1 text-2xs text-muted-foreground"
          >
            {data.publishedAt
              ? `Published${data.platformPostId ? ` · ${data.platformPostId}` : ''}`
              : 'A canvas run never publishes. This posts only when you confirm below.'}
          </p>

          <p className="truncate text-2xs text-muted-foreground">
            {draft ? (draft.title ?? draft.draftId) : 'No draft wired in'}
          </p>

          <select
            className="nodrag h-8 rounded-md border border-border bg-background px-2"
            value={schedule}
            onChange={(event) =>
              patchData({ schedule: event.target.value as OrganicPublishNodeData['schedule'] })
            }
            aria-label="When to post"
          >
            <option value="now">Post now</option>
            <option value="scheduled">Schedule for its planner time</option>
          </select>

          {blockedReason ? (
            <p className="rounded bg-amber-500/10 p-2 text-2xs text-amber-700">{blockedReason}</p>
          ) : null}
          {data.error ? (
            <p className="rounded bg-destructive/10 p-2 text-2xs text-destructive">{data.error}</p>
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
            {busy ? 'Working…' : schedule === 'now' ? 'Post now' : 'Schedule'}
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

      <div className="absolute -left-2 top-1/2" title="Planner draft">
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
              Publish to {publishPlatformLabel(pending?.platform as never)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.publishable === false
                ? 'This post is not ready to publish yet.'
                : 'This posts publicly right away and cannot be undone from Continuum. Review the caption and account below.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pending ? <PublishIntentSummary intent={pending as PublishIntentSummaryData} /> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!pending?.publishable || !pending?.intent_hash}
              onClick={confirmPublish}
            >
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
