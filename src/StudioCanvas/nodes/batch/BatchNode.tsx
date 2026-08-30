// The node that turns one wired graph into N runs.
//
// Five affordances feed it — upload, CSV paste, a Library drag, a connected upstream
// node, and a second batch wired in as the combine PARTNER — and every one of them is
// funnelled through `addBatchItems`, the single writer that owns the modality lock and
// the 100-item cap. Nothing here re-derives either rule, because five places deciding
// what "one kind per batch" means is five ways for the canvas to disagree with the run.
//
// Refusals are RENDERED, never only toasted. A batch that silently dropped the video you
// dragged onto it runs the wrong work and reports success — so every reason something was
// left out gets a line in the node itself, where the person looking at the batch is.

import {
  BATCH_COLLECTION_OUTPUT_HANDLE,
  BATCH_ITEMS_INPUT_HANDLE,
  type BatchCombine,
  type BatchItem,
  type BatchItemKind,
  combineBatches,
  MAX_BATCH_ITEMS,
} from '@continuum/contracts';
import { Handle, type NodeProps, Position, type Node as ReactFlowNode } from '@xyflow/react';
import { Layers, Table, Upload, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { STUDIO_ASSET_DROP_MIME } from '@/lib/creative-assets/studioAssetDrop';
import { useStudioStore } from '../../stores/useStudioStore';
import type { BatchNodeData, StudioNode } from '../../types';
import { splitText } from '../../utils/actions/textOps';
import { addBatchItems, BATCH_KIND_LABEL, batchItemLabel } from '../../utils/batch/addItems';
import { csvFirstColumn } from '../../utils/batch/csvFirstColumn';
import { resolveCreativeAssetDrop } from '../../utils/resolveCreativeAssetDrop';
import { stageAndUploadReferenceFile } from '../../utils/uploadReferenceFile';
import { EDGE_COLOR_BY_MODALITY } from '../modalityPreview';
import { NodeBadge, NodeTitleBar } from '../NodeChrome';

/** Items the node built from a connected upstream node carry this id prefix, so the sync
 *  can tell its own rows from the ones a person added by hand and never clobber theirs. */
const SYNCED_ID_PREFIX = 'edge:';

const SPLIT_MODES = ['newline', 'comma', 'custom'] as const;
type BatchSplitMode = (typeof SPLIT_MODES)[number];

const SPLIT_MODE_LABEL: Readonly<Record<BatchSplitMode, string>> = {
  newline: 'One per line',
  comma: 'Split on commas',
  custom: 'Custom separator',
};

const isSynced = (item: BatchItem): boolean => item.id.startsWith(SYNCED_ID_PREFIX);

/** An emptied batch is a fresh batch: keeping the lock would refuse the next thing added
 *  for matching items that are no longer there. */
const lockFor = (
  items: readonly BatchItem[],
  current: BatchItemKind | null,
): BatchItemKind | null => (items.length > 0 ? current : null);

/** Identity of a synced set, so the effect can tell "nothing upstream changed" from
 *  "the same array rebuilt on this render". */
const signatureOf = (items: readonly BatchItem[]): string =>
  items.map((item) => `${item.id}|${item.kind}|${item.value ?? ''}|${item.url ?? ''}`).join('\n');

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const splitModeOf = (value: unknown): BatchSplitMode =>
  typeof value === 'string' && (SPLIT_MODES as readonly string[]).includes(value)
    ? (value as BatchSplitMode)
    : 'newline';

/** One item per connected upstream node — or one per PART for a string source, which is
 *  the whole point of wiring a paragraph into a batch. */
function itemsFromSource(
  source: StudioNode,
  splitMode: BatchSplitMode,
  separator: string,
): BatchItem[] {
  const data = source.data as Record<string, unknown>;

  if (source.type === 'string') {
    const parts = splitText(asString(data.value) ?? '', {
      mode: splitMode,
      separator,
      trim: true,
      skipEmpty: true,
      size: 1,
      maxParts: MAX_BATCH_ITEMS,
    });
    return parts.map((value, partIndex) => ({
      id: `${SYNCED_ID_PREFIX}${source.id}:${partIndex}`,
      kind: 'text' as const,
      value,
    }));
  }

  const video = asString(data.video);
  const url = video ?? asString(data.image) ?? asString(data.sourceUrl);
  if (!url) return [];

  // The field that carried the URL decides the modality: a node type list would have to be
  // re-edited every time a new video generator ships, and would be wrong until it was.
  const kind: BatchItemKind = video || source.type === 'video' ? 'video' : 'image';
  return [
    {
      id: `${SYNCED_ID_PREFIX}${source.id}:0`,
      kind,
      url,
      assetId: asString(data.assetId),
      label: asString(data.fileName),
    },
  ];
}

export function BatchNode({ id, data, selected }: NodeProps<ReactFlowNode<BatchNodeData>>) {
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  const brandId = useStudioStore((state) => state.brandId);
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);

  const [refusals, setRefusals] = useState<string[]>([]);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const items = useMemo(() => data.items ?? [], [data.items]);
  const itemType = data.itemType ?? null;
  const combine: BatchCombine = data.combine ?? 'zip';
  const splitMode = splitModeOf(data.splitMode);
  const splitSeparator = typeof data.splitSeparator === 'string' ? data.splitSeparator : '';

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const incoming = useMemo(() => edges.filter((edge) => edge.target === id), [edges, id]);

  // A batch wired into a batch is the combine partner, never a source of items — the same
  // rule `materializeBatch` applies when the run actually pairs them.
  const partner = useMemo(
    () => incoming.map((edge) => nodeById.get(edge.source)).find((node) => node?.type === 'batch'),
    [incoming, nodeById],
  );

  const sources = useMemo(
    () =>
      incoming
        .filter(
          (edge) => (edge.targetHandle ?? BATCH_ITEMS_INPUT_HANDLE) === BATCH_ITEMS_INPUT_HANDLE,
        )
        .map((edge) => nodeById.get(edge.source))
        .filter((node): node is StudioNode => Boolean(node) && node?.type !== 'batch'),
    [incoming, nodeById],
  );

  const desired = useMemo(
    () => sources.flatMap((source) => itemsFromSource(source, splitMode, splitSeparator)),
    [sources, splitMode, splitSeparator],
  );

  /** Everything that writes items goes through here, so the lock, the cap and the refusal
   *  surface stay one decision instead of six. */
  const commit = useCallback(
    (incomingItems: BatchItem[], base: BatchItem[], extraRefusals: string[] = []) => {
      const result = addBatchItems(
        { items: base, itemType: lockFor(base, itemType) },
        incomingItems,
      );
      updateNodeData(id, { items: result.items, itemType: result.itemType });
      triggerSave();
      setRefusals([...extraRefusals, ...result.refused]);
      return result;
    },
    [id, itemType, triggerSave, updateNodeData],
  );

  // Applied once per distinct upstream shape. Without the ref an upstream set that the
  // lock REFUSES would never land, so the "are we in sync" comparison would never settle
  // and the effect would re-run itself forever.
  const lastSyncRef = useRef<string | null>(null);
  useEffect(() => {
    const key = signatureOf(desired);
    if (lastSyncRef.current === key) return;
    lastSyncRef.current = key;

    const current = data.items ?? [];
    if (signatureOf(current.filter(isSynced)) === key) return;

    const manual = current.filter((item) => !isSynced(item));
    const result = addBatchItems(
      { items: manual, itemType: lockFor(manual, data.itemType ?? null) },
      desired,
    );
    updateNodeData(id, { items: result.items, itemType: result.itemType });
    triggerSave();
    // A background sync must not wipe a refusal the user is still reading.
    if (result.refused.length > 0) setRefusals(result.refused);
  }, [data.items, data.itemType, desired, id, triggerSave, updateNodeData]);

  const removeItem = useCallback(
    (itemId: string) => {
      const next = items.filter((item) => item.id !== itemId);
      updateNodeData(id, { items: next, itemType: lockFor(next, itemType) });
      triggerSave();
    },
    [id, items, itemType, triggerSave, updateNodeData],
  );

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length === 0) return;
      if (!brandId) {
        setRefusals(['Select a brand before uploading — an upload needs somewhere to land.']);
        return;
      }

      const uploaded: BatchItem[] = [];
      const failures: string[] = [];
      for (const file of files) {
        // The upload's node writes are captured rather than applied: a batch holds N items,
        // so the node itself must never take on one file's image/assetId fields.
        let reason: string | undefined;
        const result = await stageAndUploadReferenceFile(
          {
            nodeId: id,
            file,
            brandId,
            field: file.type.startsWith('video/') ? 'video' : 'image',
            previewData: {},
          },
          {
            updateNodeData: (_nodeId, patch) => {
              if (typeof patch.referenceError === 'string') reason = patch.referenceError;
            },
          },
        );
        if (!result) {
          failures.push(`${file.name} did not upload${reason ? ` — ${reason}` : ''}.`);
          continue;
        }
        uploaded.push({
          id: crypto.randomUUID(),
          kind: file.type.startsWith('video/') ? 'video' : 'image',
          url: result.signedUrl,
          assetId: result.assetId,
          label: file.name,
        });
      }

      commit(uploaded, items, failures);
    },
    [brandId, commit, id, items],
  );

  const handleAddCsv = useCallback(() => {
    const { values, truncated } = csvFirstColumn(csvText);
    const extra = truncated
      ? [`Only the first ${MAX_BATCH_ITEMS} rows were read — the rest of the paste was left out.`]
      : [];
    commit(
      values.map((value) => ({ id: crypto.randomUUID(), kind: 'text' as const, value })),
      items,
      extra,
    );
    setCsvText('');
  }, [commit, csvText, items]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      // Without stopPropagation the canvas dropzone ALSO handles this drop and drops a
      // loose image node behind the batch.
      event.preventDefault();
      event.stopPropagation();

      const raw = event.dataTransfer.getData(STUDIO_ASSET_DROP_MIME);
      if (!raw) return;

      const resolved = await resolveCreativeAssetDrop(raw, resolveDroppedBase64);
      if (resolved.status === 'error') {
        setRefusals([
          `${resolved.title}${resolved.description ? ` — ${resolved.description}` : ''}`,
        ]);
        return;
      }
      if (resolved.nodeType !== 'image' && resolved.nodeType !== 'video') {
        setRefusals(['A batch holds images, videos or text — that asset is none of them.']);
        return;
      }

      commit(
        [
          {
            id: crypto.randomUUID(),
            kind: resolved.nodeType,
            url: resolved.sourceUrl ?? resolved.dataUrl,
            assetId: resolved.assetId,
            label: resolved.fileName,
          },
        ],
        items,
      );
    },
    [commit, items],
  );

  const partnerItems = useMemo(
    () => ((partner?.data as Record<string, unknown> | undefined)?.items ?? []) as BatchItem[],
    [partner],
  );

  const pairing = useMemo(() => {
    if (!partner) return null;
    const combined = combineBatches(combine, items, partnerItems);
    const pairs = combined.pairs.length;

    if (combine === 'cross') {
      const total = items.length * partnerItems.length;
      return {
        text: combined.truncated
          ? `${items.length} × ${partnerItems.length} = ${total} → only ${MAX_BATCH_ITEMS} will run`
          : `${items.length} × ${partnerItems.length} = ${pairs} pairs`,
        over: combined.truncated,
      };
    }

    const longest = Math.max(items.length, partnerItems.length);
    if (longest === pairs) return { text: `zip pairs ${pairs}`, over: false };
    const orphan = longest - pairs;
    const where = items.length > partnerItems.length ? 'this batch' : 'the other batch';
    return {
      text:
        `zip pairs ${pairs} of ${longest} — ${orphan} item${orphan === 1 ? '' : 's'} in ${where} ` +
        'have no partner. Switch to cross to use them all.',
      over: true,
    };
  }, [combine, items, partner, partnerItems]);

  // The partner only reaches the render through a node BOTH batches feed. Wired to
  // nothing shared, it pairs on paper and changes no output.
  const partnerDetached = useMemo(() => {
    if (!partner) return false;
    const ownTargets = new Set(
      edges.filter((edge) => edge.source === id).map((edge) => edge.target),
    );
    if (ownTargets.size === 0) return false;
    return !edges.some((edge) => edge.source === partner.id && ownTargets.has(edge.target));
  }, [edges, id, partner]);

  const hasStringSource = sources.some((source) => source.type === 'string');
  const handleColor = itemType ? EDGE_COLOR_BY_MODALITY[itemType] : 'var(--edge-text)';
  const handleStyle: React.CSSProperties = {
    ['--edge-color' as keyof React.CSSProperties]: handleColor,
  };
  const stopDrag = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <div className="relative h-[320px] w-[300px]" data-testid="batch-node">
      <CanvasNode
        handles={{ target: false, source: false }}
        selected={selected}
        className="size-full overflow-hidden border-border/60 bg-background"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <NodeTitleBar icon={Layers} label="Batch">
          <NodeBadge data-testid="batch-node-kind">
            {itemType ? BATCH_KIND_LABEL[itemType] : 'Empty'}
          </NodeBadge>
          <NodeBadge data-testid="batch-node-count" className="tabular-nums">
            {items.length}/{MAX_BATCH_ITEMS}
          </NodeBadge>
        </NodeTitleBar>

        <NodeContent className="flex min-h-0 flex-1 flex-col gap-1 p-1">
          {refusals.length > 0 ? (
            <div
              data-testid="batch-node-refusal"
              className="shrink-0 rounded border border-destructive/40 bg-destructive/5 p-1.5 text-[10px] leading-snug text-destructive"
            >
              {refusals.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </div>
          ) : null}

          <div className="nodrag -mx-1 min-h-0 flex-1 overflow-y-auto border-y border-border/60 bg-muted/20">
            {items.length === 0 ? (
              <p className="p-2 text-center text-[11px] leading-snug text-muted-foreground">
                Add items to fan every node downstream out over them.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    data-testid="batch-node-item"
                    className="group/item flex items-center gap-2 px-1.5 py-1"
                  >
                    {item.kind === 'image' && item.url ? (
                      <img
                        loading="lazy"
                        src={item.url}
                        alt={batchItemLabel(item, index)}
                        className="size-12 shrink-0 rounded object-cover"
                      />
                    ) : null}
                    {item.kind === 'video' && item.url ? (
                      // No poster frame: a batch of 40 clips that each preload a poster is
                      // 40 range requests before the node has told anyone anything.
                      <video
                        preload="none"
                        src={item.url}
                        muted
                        className="size-12 shrink-0 rounded bg-black object-cover"
                      >
                        <track kind="captions" />
                      </video>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground">
                      {batchItemLabel(item, index)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${batchItemLabel(item, index)}`}
                      className="nodrag shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/item:opacity-100"
                      onMouseDown={stopDrag}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeItem(item.id);
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {csvOpen ? (
            <div className="shrink-0 space-y-1">
              <Textarea
                data-testid="batch-node-csv"
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
                onMouseDown={stopDrag}
                placeholder="Paste rows — column 1 becomes the items"
                className="nodrag h-14 resize-none text-[10px]"
              />
              <Button
                variant="secondary"
                size="sm"
                className="nodrag h-6 w-full text-[10px]"
                onMouseDown={stopDrag}
                onClick={(event) => {
                  event.stopPropagation();
                  handleAddCsv();
                }}
              >
                Add column 1
              </Button>
            </div>
          ) : null}

          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="nodrag h-6 flex-1 gap-1 text-[10px]"
              onMouseDown={stopDrag}
              onClick={(event) => {
                event.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <Upload className="size-3" />
              Upload
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="nodrag h-6 flex-1 gap-1 text-[10px]"
              onMouseDown={stopDrag}
              onClick={(event) => {
                event.stopPropagation();
                setCsvOpen((open) => !open);
              }}
            >
              <Table className="size-3" />
              Paste CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={handleUpload}
            />
          </div>

          {hasStringSource ? (
            <div className="flex shrink-0 items-center gap-1">
              <Select
                value={splitMode}
                onValueChange={(value: BatchSplitMode) => {
                  updateNodeData(id, { splitMode: value });
                  triggerSave();
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="nodrag h-6 flex-1 text-[10px]"
                  onMouseDown={stopDrag}
                >
                  <SelectValue items={SPLIT_MODE_LABEL} />
                </SelectTrigger>
                <SelectContent>
                  {SPLIT_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode} className="text-xs">
                      {SPLIT_MODE_LABEL[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {splitMode === 'custom' ? (
                <input
                  aria-label="Split separator"
                  value={splitSeparator}
                  onMouseDown={stopDrag}
                  onChange={(event) => {
                    updateNodeData(id, { splitSeparator: event.target.value });
                    triggerSave();
                  }}
                  className="nodrag h-6 w-16 rounded border bg-background px-1 text-[10px]"
                />
              ) : null}
            </div>
          ) : null}

          {partner ? (
            <div className="shrink-0 space-y-1">
              <Select
                value={combine}
                onValueChange={(value: BatchCombine) => {
                  updateNodeData(id, { combine: value });
                  triggerSave();
                }}
              >
                <SelectTrigger
                  size="sm"
                  data-testid="batch-node-combine"
                  className="nodrag h-6 w-full text-[10px]"
                  onMouseDown={stopDrag}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zip" className="text-xs">
                    zip
                  </SelectItem>
                  <SelectItem value="cross" className="text-xs">
                    cross
                  </SelectItem>
                </SelectContent>
              </Select>
              {pairing ? (
                <p
                  data-testid="batch-node-pairs"
                  className={`text-[10px] leading-snug ${pairing.over ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {pairing.text}
                </p>
              ) : null}
              {partnerDetached ? (
                <p className="text-[10px] leading-snug text-muted-foreground">
                  The other batch feeds the pairing — wire it downstream too for it to appear in the
                  render.
                </p>
              ) : null}
            </div>
          ) : null}
        </NodeContent>
      </CanvasNode>

      <Handle
        type="target"
        position={Position.Left}
        id={BATCH_ITEMS_INPUT_HANDLE}
        className="studio-handle !size-3"
        style={handleStyle}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={BATCH_COLLECTION_OUTPUT_HANDLE}
        className="studio-handle !size-3"
        style={handleStyle}
      />
    </div>
  );
}
