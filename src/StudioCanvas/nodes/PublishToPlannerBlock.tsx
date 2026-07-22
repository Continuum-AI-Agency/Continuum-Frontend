import { PUBLISH_VIDEO_INPUT_HANDLE } from '@continuum/contracts';
import {
  CalendarIcon,
  CopyIcon,
  ExternalLinkIcon,
  PaperPlaneIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import {
  Handle,
  type HandleProps,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
  useEdges,
  useNodeId,
} from '@xyflow/react';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { PublishToPlannerNodeData } from '../types';
import { usePublishToPlanner } from './publish/usePublishToPlanner';

// Terminal "Publish to Planner" node. Takes one upstream video on `video-in` and,
// on an explicit click, attaches it to an organic Planner draft — linking the
// draft the canvas was launched from (or the one it already created) or creating a
// new one at the chosen platform/slot. Publishing is manual by design so a
// workflow run can never silently spawn drafts.

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'youtube', label: 'YouTube' },
] as const;

const LimitedHandle = ({
  maxConnections,
  isConnectable,
  ...props
}: HandleProps & { maxConnections?: number }) => {
  const edges = useEdges();
  const nodeId = useNodeId();
  const handleId = props.id ?? null;
  const connectionCount = edges.filter((edge) => {
    if (!nodeId) return false;
    return edge.target === nodeId && (edge.targetHandle ?? null) === handleId;
  }).length;
  const withinLimit = !maxConnections || connectionCount < maxConnections;
  return <Handle {...props} isConnectable={(isConnectable ?? true) && withinLimit} />;
};

export function PublishToPlannerBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<PublishToPlannerNodeData>>) {
  const router = useRouter();
  const updateNode = useStudioStore((state) => state.updateNode);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const { publish, isPublishing, hasSource } = usePublishToPlanner(id);

  const patchData = useCallback(
    (patch: Partial<PublishToPlannerNodeData>) => {
      updateNode(id, (node) => ({
        ...node,
        data: { ...(node.data as PublishToPlannerNodeData), ...patch },
      }));
    },
    [id, updateNode],
  );

  // Seed-link: when the canvas was launched from a Planner draft, pre-bind this
  // node to it so publishing updates that draft instead of creating a new one.
  useEffect(() => {
    if (data.draftId) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const seededDraftId = params.get('draftId');
    const seededWeek = params.get('weekStartId') ?? params.get('weekStart') ?? undefined;
    if (seededDraftId) {
      patchData({ draftId: seededDraftId, ...(seededWeek ? { weekStartId: seededWeek } : {}) });
    }
    // Only on mount / until a draft binding exists.
  }, [data.draftId, patchData]);

  const platform = data.platform ?? 'instagram';
  const isBound = Boolean(data.draftId);

  const openInPlanner = useCallback(() => {
    if (!data.draftId) return;
    const params = new URLSearchParams({ draftId: data.draftId, view: 'week' });
    if (data.weekStartId) params.set('weekStartId', data.weekStartId);
    router.push(`/organic?${params.toString()}`);
  }, [data.draftId, data.weekStartId, router]);

  const publishLabel = useMemo(() => {
    if (isPublishing) return 'Publishing…';
    if (data.publishedAt) return isBound ? 'Update draft' : 'Publish again';
    return isBound ? 'Publish to draft' : 'Publish to Planner';
  }, [data.publishedAt, isBound, isPublishing]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'relative group h-full w-full min-w-[260px] min-h-[200px] rounded-xl transition-shadow',
            isSelectedByOther && 'selected-by-other',
          )}
          style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
        >
          <NodeResizer
            minWidth={260}
            minHeight={200}
            isVisible={selected}
            lineClassName="border-brand-primary/60"
            handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
          />

          <CanvasNode
            handles={{ target: false, source: false }}
            selected={selected}
            className="h-full w-full overflow-hidden border-border/60 bg-background p-0 shadow-sm"
          >
            <NodeContent className="flex h-full w-full flex-col gap-2 p-3">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Publish to Planner
                </span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-2xs',
                    data.publishedAt
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {data.publishedAt ? (isBound ? 'Linked' : 'Published') : 'Not published'}
                </span>
              </div>

              <label className="flex flex-col gap-1 text-2xs text-muted-foreground">
                Platform
                <select
                  className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
                  value={platform}
                  disabled={isBound}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => patchData({ platform: event.target.value })}
                >
                  {PLATFORM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-2xs text-muted-foreground">
                Schedule
                <input
                  type="datetime-local"
                  className="nodrag h-8 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
                  value={data.scheduledAt ?? ''}
                  disabled={isBound}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => patchData({ scheduledAt: event.target.value })}
                />
              </label>

              {isBound ? (
                <p className="text-2xs text-muted-foreground">
                  Linked to an existing draft — platform &amp; schedule are managed in the Planner.
                </p>
              ) : null}

              {data.error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-2xs text-destructive">
                  {data.error}
                </div>
              ) : null}

              <div className="mt-auto flex flex-col gap-1.5">
                <Button
                  variant="default"
                  size="sm"
                  className="nodrag h-8 w-full justify-center text-xs"
                  onClick={() => publish()}
                  disabled={isPublishing || !hasSource}
                  title={hasSource ? undefined : 'Connect a rendered video and render it first'}
                >
                  <PaperPlaneIcon className="mr-1.5 h-3.5 w-3.5" />
                  {publishLabel}
                </Button>
                {data.draftId ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="nodrag h-8 w-full justify-center text-xs"
                    onClick={openInPlanner}
                  >
                    <ExternalLinkIcon className="mr-1.5 h-3.5 w-3.5" />
                    Open in Planner
                  </Button>
                ) : null}
              </div>
            </NodeContent>
          </CanvasNode>

          <div
            className="pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2"
            style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
          >
            <LimitedHandle
              type="target"
              position={Position.Left}
              id={PUBLISH_VIDEO_INPUT_HANDLE}
              maxConnections={1}
              className="studio-handle pointer-events-auto !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel>Publish to Planner</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => publish()} disabled={isPublishing || !hasSource}>
          <PaperPlaneIcon className="mr-2 h-4 w-4" />
          {publishLabel}
        </ContextMenuItem>
        <ContextMenuItem onClick={openInPlanner} disabled={!data.draftId}>
          <ExternalLinkIcon className="mr-2 h-4 w-4" />
          Open in Planner
        </ContextMenuItem>
        <ContextMenuItem onClick={() => duplicateNode(id)}>
          <CopyIcon className="mr-2 h-4 w-4" />
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => deleteNode(id)}
        >
          <TrashIcon className="mr-2 h-4 w-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
