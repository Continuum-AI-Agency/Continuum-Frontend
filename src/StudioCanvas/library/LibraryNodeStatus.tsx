'use client';

// The Library, on the node: what the review says about the asset this node holds, which
// version it is, the open feedback on it, and whether the Library has moved on. Drawn
// under every node that holds a Library pointer (withLibraryStatus), from the room's
// shared context — this component never fetches the asset itself.
//
// Four actions, all through the Library's own boundaries:
// - Comments: read, reply, resolve — the Library's threads, not a canvas copy.
// - Use latest: move a reference node onto the head version (Premiere-panel style).
// - Acknowledge: a changed review decision is news until the node has seen it.
// - Save as revision: an output becomes the next version of the asset it was made from,
//   with lineage from the version that node pinned, optionally straight into review.

import type { CanvasLibraryAssetContext, PinnedLibraryAssetRef } from '@continuum/contracts';
import { canvasLibraryDrift } from '@continuum/contracts';
import { CheckCircle2, GitBranchPlus, Info, Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { useAssetComments } from '@/components/library/detail/useAssetComments';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buildCommentThreads, displayNameFromEmail } from '@/lib/library/comments';
import { saveCanvasOutputAsRevision } from '@/lib/library/openInCanvas';
import { cn } from '@/lib/utils';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { resignCanvasNodes } from '../utils/resignCanvasNodes';
import { useLibraryContextStore } from './libraryContextStore';
import {
  latestVersionPatch,
  libraryNodeRef,
  libraryTechnicalFacts,
  pinnedUpstreamSources,
} from './libraryNodeRef';

const STATUS_TONE: Record<CanvasLibraryAssetContext['reviewStatus'], string> = {
  none: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
  in_review: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  needs_changes: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
};

const STATUS_LABEL: Record<CanvasLibraryAssetContext['reviewStatus'], string> = {
  none: 'No status',
  draft: 'Draft',
  in_review: 'In review',
  needs_changes: 'Needs changes',
  approved: 'Approved',
};

const chip = 'inline-flex h-5 items-center gap-1 rounded-sm px-1.5 font-medium';

export function LibraryNodeStatus({ nodeId, data }: { nodeId: string; data: unknown }) {
  const ref = useMemo(() => libraryNodeRef(data), [data]);
  const brandId = useStudioStore((state) => state.brandId);
  const asset = useLibraryContextStore((state) => (ref ? state.assets[ref.assetId] : undefined));
  const pinned = useLibraryContextStore((state) =>
    ref?.versionId ? state.versions[ref.versionId] : undefined,
  );
  const head = useLibraryContextStore((state) =>
    asset?.headVersionId ? state.versions[asset.headVersionId] : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const record = (data ?? {}) as Record<string, unknown>;
  const drift = asset
    ? canvasLibraryDrift({
        // An output IS its version; only a reference can fall behind the Library.
        pinnedVersionId: ref?.isOutput ? null : ref?.versionId,
        acknowledgedReviewStatus:
          typeof record.libraryAckReviewStatus === 'string' ? record.libraryAckReviewStatus : null,
        asset,
      })
    : null;

  const acknowledge = useCallback(() => {
    if (!asset) return;
    const { updateNodeData, triggerSave } = useStudioStore.getState();
    updateNodeData(nodeId, { libraryAckReviewStatus: asset.reviewStatus });
    triggerSave();
  }, [asset, nodeId]);

  const useLatest = useCallback(async () => {
    const state = useStudioStore.getState();
    const node = state.getNodeById(nodeId);
    if (!node || !ref || !asset || !head || !brandId) return;
    const patch = latestVersionPatch({
      data: node.data as Record<string, unknown>,
      ref,
      asset,
      head,
    });
    if (!patch) {
      setNotice('The latest version has no canvas preview yet');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const moved = { ...node, data: { ...node.data, ...patch } } as StudioNode;
      const [signed] = await resignCanvasNodes([moved], brandId);
      state.updateNodeData(nodeId, (signed ?? moved).data);
      state.triggerSave();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not switch to the latest version');
    } finally {
      setBusy(false);
    }
  }, [asset, brandId, head, nodeId, ref]);

  if (!ref || !asset || !drift || !brandId) return null;

  const versionNumber = pinned?.versionNumber ?? asset.headVersionNumber;
  const facts = libraryTechnicalFacts(asset);
  const statusLabel = asset.reviewLabel ?? STATUS_LABEL[asset.reviewStatus];

  return (
    <div
      data-testid="library-node-status"
      data-asset-id={asset.id}
      data-review-status={asset.reviewStatus}
      data-version-number={versionNumber ?? ''}
      data-head-version-number={asset.headVersionNumber ?? ''}
      data-open-threads={asset.openThreadCount}
      data-comment-count={asset.commentCount}
      data-newer-version={drift.newerVersion ? 'true' : 'false'}
      data-decision-changed={drift.decisionChanged ? 'true' : 'false'}
      data-rendition-role={typeof record.renditionRole === 'string' ? record.renditionRole : ''}
      className="nodrag nopan absolute top-full left-0 z-10 mt-1 flex max-w-[26rem] flex-wrap items-center gap-1 text-2xs"
    >
      <span
        className={cn(chip, STATUS_TONE[asset.reviewStatus])}
        style={asset.reviewColor ? { boxShadow: `inset 2px 0 0 ${asset.reviewColor}` } : undefined}
        title="Library review status"
      >
        {statusLabel}
      </span>
      {versionNumber ? (
        <span className={cn(chip, 'bg-muted text-muted-foreground')} title="Library version">
          v{versionNumber}
        </span>
      ) : null}

      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              data-testid="library-node-comments"
              aria-label={`${asset.openThreadCount} open comment threads`}
              className={cn(
                chip,
                'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
                asset.openThreadCount > 0 && 'bg-primary/10 text-primary',
              )}
            >
              <MessageSquare className="size-3" aria-hidden />
              {asset.openThreadCount}
              {asset.commentCount > asset.openThreadCount ? (
                <span className="opacity-60">/{asset.commentCount}</span>
              ) : null}
            </button>
          }
        />
        <PopoverContent align="start" className="w-80 p-2.5">
          <NodeCommentThreads
            brandId={brandId}
            assetId={asset.id}
            versionId={ref.versionId ?? asset.headVersionId ?? undefined}
          />
        </PopoverContent>
      </Popover>

      {facts.length > 0 ? (
        <span
          data-testid="library-node-facts"
          className={cn(chip, 'bg-muted text-muted-foreground')}
          title={facts.join(' · ')}
        >
          <Info className="size-3" aria-hidden />
          {facts.slice(0, 2).join(' · ')}
        </span>
      ) : null}

      {drift.newerVersion && head ? (
        <button
          type="button"
          data-testid="library-node-use-latest"
          disabled={busy}
          onClick={() => void useLatest()}
          className={cn(
            chip,
            'bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-200',
          )}
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3" aria-hidden />
          )}
          v{head.versionNumber} available · Use latest
        </button>
      ) : null}

      {drift.decisionChanged ? (
        <button
          type="button"
          data-testid="library-node-decision-changed"
          onClick={acknowledge}
          title="The Library review decision changed since this node last saw it. Click to acknowledge."
          className={cn(
            chip,
            'bg-violet-500/15 text-violet-800 hover:bg-violet-500/25 dark:text-violet-200',
          )}
        >
          <CheckCircle2 className="size-3" aria-hidden />
          Decision changed: {statusLabel}
        </button>
      ) : null}

      {drift.deleted ? (
        <span className={cn(chip, 'bg-destructive/15 text-destructive')}>Removed from Library</span>
      ) : null}

      {ref.isOutput && pinned ? (
        <SaveAsRevision
          brandId={brandId}
          nodeId={nodeId}
          output={{
            bucket: pinned.bucket,
            storagePath: pinned.storagePath,
            fileName: pinned.fileName,
            mimeType: pinned.mimeType,
            sizeBytes: asset.sizeBytes ?? null,
            assetId: asset.id,
          }}
        />
      ) : null}

      {notice ? <span className="text-destructive">{notice}</span> : null}
    </div>
  );
}

function NodeCommentThreads({
  brandId,
  assetId,
  versionId,
}: {
  brandId: string;
  assetId: string;
  versionId: string | undefined;
}) {
  const { comments, loading, error, postComment, setResolved } = useAssetComments(brandId, assetId);
  const threads = useMemo(() => buildCommentThreads(comments), [comments]);
  const [showResolved, setShowResolved] = useState(false);
  const shown = showResolved ? [...threads.open, ...threads.resolved] : threads.open;

  return (
    <div
      data-testid="library-node-thread-list"
      className="flex max-h-96 flex-col gap-2 overflow-y-auto"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">
          {threads.open.length} open · {threads.resolved.length} resolved
        </span>
        {threads.resolved.length > 0 ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setShowResolved((value) => !value)}
          >
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </button>
        ) : null}
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Loading comments…</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {shown.map((thread) => {
        const resolved = Boolean(thread.root.resolvedAt);
        return (
          <div
            key={thread.root.id}
            data-testid="library-node-thread"
            data-comment-id={thread.root.id}
            data-resolved={resolved ? 'true' : 'false'}
            className={cn('rounded-md border border-border p-2', resolved && 'opacity-60')}
          >
            {[thread.root, ...thread.replies].map((comment) => (
              <div key={comment.id} className="mb-1 text-xs">
                <span className="font-medium">
                  {comment.authorName ?? displayNameFromEmail(comment.authorEmail) ?? 'Member'}
                </span>{' '}
                <span className="whitespace-pre-wrap break-words text-foreground/90">
                  {comment.body}
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-center gap-2">
              <InlineComposer
                placeholder="Reply…"
                label="Reply"
                onSubmit={(body) =>
                  postComment({ body, parentCommentId: thread.root.id, versionId }).then(() => {})
                }
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-2xs"
                onClick={() => void setResolved(thread.root.id, !resolved)}
              >
                {resolved ? 'Reopen' : 'Resolve'}
              </Button>
            </div>
          </div>
        );
      })}
      <InlineComposer
        placeholder="Comment on this asset…"
        label="Comment"
        onSubmit={(body) => postComment({ body, versionId }).then(() => {})}
      />
    </div>
  );
}

function InlineComposer({
  placeholder,
  label,
  onSubmit,
}: {
  placeholder: string;
  label: string;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      await onSubmit(text);
      setBody('');
    } finally {
      setSending(false);
    }
  };
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        aria-label={placeholder}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        className="h-6 min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 text-xs"
      />
      <Button
        type="submit"
        size="sm"
        className="h-6 px-2 text-2xs"
        disabled={sending || !body.trim()}
      >
        {label}
      </Button>
    </form>
  );
}

function SaveAsRevision({
  brandId,
  nodeId,
  output,
}: {
  brandId: string;
  nodeId: string;
  output: Parameters<typeof saveCanvasOutputAsRevision>[0]['output'];
}) {
  const [sources, setSources] = useState<PinnedLibraryAssetRef[]>([]);
  const [fileIntoReview, setFileIntoReview] = useState(false);
  const reviewToggleId = useId();
  const [saving, setSaving] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const assets = useLibraryContextStore((state) => state.assets);
  const versions = useLibraryContextStore((state) => state.versions);

  const save = async (source: PinnedLibraryAssetRef) => {
    setSaving(source.version_id);
    setResult(null);
    try {
      const saved = await saveCanvasOutputAsRevision({
        brandId,
        sourceAssetId: source.asset_id,
        sourceVersionId: source.version_id,
        output,
        roomId: useStudioStore.getState().activeRoomId ?? null,
        nodeId,
        fileIntoReview,
      });
      setResult(
        `Saved as v${saved.versionNumber}${saved.filedIntoReview ? ', in review' : ''}${saved.lineageRecorded ? '' : ' (lineage not recorded)'}`,
      );
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Could not save the revision');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) return;
        const { nodes, edges } = useStudioStore.getState();
        setSources(pinnedUpstreamSources(nodes, edges, nodeId));
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            data-testid="library-node-save-revision"
            className={cn(
              chip,
              'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <GitBranchPlus className="size-3" aria-hidden />
            Save as revision
          </button>
        }
      />
      <PopoverContent align="start" className="w-72 p-2.5">
        <div data-testid="library-node-revision-panel" className="flex flex-col gap-2 text-xs">
          {sources.length === 0 ? (
            <p className="text-muted-foreground">
              Wire a Library reference into this node to save the output as its next version.
            </p>
          ) : (
            sources.map((source) => {
              const name =
                assets[source.asset_id]?.title ??
                assets[source.asset_id]?.fileName ??
                'Library asset';
              const version = versions[source.version_id]?.versionNumber;
              return (
                <Button
                  key={source.version_id}
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="library-node-revision-target"
                  data-source-asset-id={source.asset_id}
                  disabled={saving !== null}
                  onClick={() => void save(source)}
                  className="justify-start"
                >
                  {saving === source.version_id ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : null}
                  <span className="truncate">
                    Revise {name}
                    {version ? ` (from v${version})` : ''}
                  </span>
                </Button>
              );
            })
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id={reviewToggleId}
              data-testid="library-node-file-into-review"
              checked={fileIntoReview}
              onCheckedChange={(checked) => setFileIntoReview(checked === true)}
            />
            <label htmlFor={reviewToggleId}>Send to review</label>
          </div>
          {result ? (
            <p data-testid="library-node-revision-result" className="text-muted-foreground">
              {result}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
