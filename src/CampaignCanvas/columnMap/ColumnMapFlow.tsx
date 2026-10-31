'use client';

// The Map in columns (design C, phase 2): campaign → ad sets → ads in three fixed columns that
// fit the companion pane at 100% and grow only downward; the unchanged branches of a proposal
// folded into one node; "Change 1 of 3 →" and a minimap that marks each change by its colour.
// Everything it draws comes from lib/campaign-canvas/columnMap.ts.

import {
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  Panel,
  Position,
  useReactFlow,
} from '@xyflow/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Canvas } from '@/components/ai-elements/canvas';
import { Controls } from '@/components/ai-elements/controls';
import {
  type CollapsedGroup,
  type ColumnMapModel,
  type ColumnPlacement,
  cardsById,
  changeCounterLabel,
  changeOrder,
  collapsedGroupLabel,
  collapseUnchangedBranches,
  focusViewport,
  initialColumnViewport,
  layoutColumns,
  type MapCard,
  NEXT_CHANGE_INSET,
  type PaneSize,
  stepChange,
} from '@/lib/campaign-canvas/columnMap';
import type { LecturaMark } from '@/lib/campaign-canvas/lectura';
import { cn } from '@/lib/utils';

const MARK_CLASS: Record<LecturaMark, string> = {
  changed: 'border-[color:var(--warning)] ring-2 ring-[color:var(--warning)]/20',
  added: 'border-[color:var(--success)] bg-[color:var(--success)]/8',
  paused: 'border-[color:var(--destructive)] bg-[color:var(--destructive)]/8',
  unchanged: 'border-border',
};

const MARK_TAG: Record<LecturaMark, { label: string; className: string } | null> = {
  changed: {
    label: 'Changes',
    className: 'bg-[color:var(--warning)]/15 text-[color:var(--warning)]',
  },
  added: { label: 'New · paused', className: 'bg-[color:var(--success)] text-white' },
  paused: { label: 'Pauses', className: 'bg-[color:var(--destructive)] text-white' },
  unchanged: null,
};

/** The minimap's fill per mark: a change is findable at a glance, the rest recedes. */
const MARK_MINIMAP_FILL: Record<LecturaMark | 'collapsed', string> = {
  changed: 'var(--warning)',
  added: 'var(--success)',
  paused: 'var(--destructive)',
  unchanged: 'var(--border)',
  collapsed: 'var(--muted)',
};

const LEVEL_LABEL: Record<MapCard['level'], string> = {
  campaign: 'Campaign',
  adset: 'Ad set',
  ad: 'Ad',
};

export type CardNodeData = {
  card: MapCard;
  height: number;
  /** In a proposal, the unchanged boxes step back so the change reads first. */
  dimmed: boolean;
  focused: boolean;
  /** Selected through its folded audience or creative. */
  foldSelected: boolean;
  testIdPrefix: string;
  onSelectFolded: ((id: string) => void) | null;
};

type CollapsedNodeData = { group: CollapsedGroup; onToggle: (id: string) => void };

type CardFlowNode = Node<CardNodeData, 'map-card'>;
type CollapsedFlowNode = Node<CollapsedNodeData, 'map-collapsed'>;

const handleClass = '!h-1.5 !w-1.5 !min-w-0 !border-0 !bg-[color:var(--ring)]';

function MapCardNode({ data, selected }: NodeProps<CardFlowNode>) {
  return (
    <MapCardBox {...data} selected={Boolean(selected)}>
      {data.card.level !== 'campaign' ? (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={false}
          className={handleClass}
        />
      ) : null}
      {data.card.level !== 'ad' ? (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={false}
          className={handleClass}
        />
      ) : null}
    </MapCardBox>
  );
}

/** One box of the Map, drawn at exactly the height the layout gave it. */
export function MapCardBox({
  card,
  height,
  dimmed,
  focused,
  foldSelected,
  onSelectFolded,
  testIdPrefix,
  selected,
  children,
}: CardNodeData & { selected: boolean; children?: React.ReactNode }) {
  const tag = MARK_TAG[card.mark];
  const { audienceLine } = card;
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border-[1.5px] bg-card px-2.5 py-2 text-xs shadow-sm',
        MARK_CLASS[card.mark],
        dimmed && 'opacity-60',
        (selected || foldSelected) && 'outline-2 outline-offset-2 outline-[color:var(--ring)]',
        focused && 'outline-2 outline-offset-4 outline-primary',
      )}
      style={{ height }}
      data-testid={`${testIdPrefix}${card.id}`}
      data-mark={card.mark}
      data-focused={focused ? 'true' : undefined}
    >
      {children}
      <div className="flex min-w-0 gap-2">
        {card.thumbnailUrl ? (
          <button
            type="button"
            className="nodrag size-10 shrink-0 overflow-hidden rounded-md bg-muted"
            onClick={() => card.folded.creativeId && onSelectFolded?.(card.folded.creativeId)}
            disabled={!onSelectFolded || !card.folded.creativeId}
            aria-label="Open the creative"
          >
            <img src={card.thumbnailUrl} alt="" className="size-full object-cover" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex h-[14px] items-center justify-between gap-1 font-mono text-[10px] uppercase leading-[14px] tracking-wide text-muted-foreground">
            <span className="truncate">{LEVEL_LABEL[card.level]}</span>
            {tag ? (
              <span className={cn('shrink-0 rounded-full px-1.5 normal-case', tag.className)}>
                {tag.label}
              </span>
            ) : null}
          </div>
          <div className="line-clamp-2 break-words text-[12px] font-semibold leading-4">
            {card.title}
          </div>
        </div>
      </div>
      {card.note ? (
        <div
          className={cn(
            'truncate text-[11px] leading-[15px]',
            card.note.startsWith('copy of')
              ? 'text-[color:var(--success)]'
              : 'text-muted-foreground',
          )}
        >
          {card.note}
        </div>
      ) : null}
      {card.lines.map((line) => (
        <div
          key={line}
          className="truncate text-[11px] leading-[15px] tabular-nums text-muted-foreground"
        >
          {line}
        </div>
      ))}
      {audienceLine ? (
        onSelectFolded && card.folded.audienceId ? (
          <button
            type="button"
            className="nodrag truncate text-left text-[11px] leading-[15px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
            onClick={() => card.folded.audienceId && onSelectFolded(card.folded.audienceId)}
            title="Open the audience"
          >
            {audienceLine}
          </button>
        ) : (
          <div className="truncate text-[11px] leading-[15px] text-muted-foreground">
            {audienceLine}
          </div>
        )
      ) : null}
      {card.rows.map((row) => (
        <div key={row.field} className="text-[11px] leading-[15px] tabular-nums">
          <div className="truncate text-muted-foreground">{row.label}</div>
          <div className="truncate">
            <span className="text-muted-foreground line-through">{row.before}</span>
            <span className="px-1 text-muted-foreground">→</span>
            <span className="font-semibold">{row.after}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CollapsedGroupNode({ data }: NodeProps<CollapsedFlowNode>) {
  return (
    <button
      type="button"
      className="nodrag flex h-full w-full items-center justify-center rounded-lg border-[1.5px] border-dashed border-border bg-card/80 px-2 text-xs font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      onClick={() => data.onToggle(data.group.id)}
      aria-expanded={data.group.expanded}
      data-testid={`map-collapsed-${data.group.id}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={handleClass}
      />
      {collapsedGroupLabel(data.group)}
    </button>
  );
}

const nodeTypes: NodeTypes = {
  'map-card': MapCardNode as NodeTypes[string],
  'map-collapsed': CollapsedGroupNode as NodeTypes[string],
};

const defaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--ring)', width: 14, height: 14 },
  style: { stroke: 'var(--ring)', strokeWidth: 1.25 },
};

/** The control in the map's top bar: "‹ Change 1 of 3 ›". */
function NextChangeControl({
  index,
  total,
  onStep,
}: {
  index: number | null;
  total: number;
  onStep: (direction: 1 | -1) => void;
}) {
  if (total === 0) return null;
  const label =
    index === null
      ? `${total} ${total === 1 ? 'change' : 'changes'}`
      : changeCounterLabel(index, total);
  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-border bg-card/95 p-0.5 text-xs shadow-sm backdrop-blur"
      data-testid="map-next-change"
    >
      <button
        type="button"
        className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={() => onStep(-1)}
        aria-label="Previous change"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
      </button>
      <span className="min-w-[6.5rem] px-1 text-center font-medium tabular-nums" aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        className="flex h-7 items-center gap-1 rounded-full bg-primary px-2.5 font-medium text-primary-foreground hover:bg-primary/90"
        onClick={() => onStep(1)}
        aria-label="Next change"
      >
        Next
        <ChevronRight className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** The pane's size, followed as it resizes; null until it has been measured. */
const usePaneSize = (ref: React.RefObject<HTMLDivElement | null>): PaneSize | null => {
  const [size, setSize] = React.useState<PaneSize | null>(null);
  React.useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
};

export type ColumnMapFlowProps = {
  model: ColumnMapModel;
  /** Store ids currently selected (a scaffold map); a live preview selects nothing. */
  selectedIds?: ReadonlySet<string>;
  /** Selection and deletion of a card, passed to the store. Absent = read-only. */
  onNodesChange?: (changes: NodeChange[]) => void;
  /** Selects a folded audience or creative so the inspector opens it. */
  onSelectFolded?: (id: string) => void;
  testIdPrefix?: string;
  /** Panels drawn inside the flow (inspector, undo, validate). */
  children?: React.ReactNode;
  /** Focus this change first (screenshots and deep links). */
  initialFocusIndex?: number | null;
};

export function ColumnMapFlow({
  model,
  selectedIds,
  onNodesChange,
  onSelectFolded,
  testIdPrefix = 'map-card-',
  children,
  initialFocusIndex = null,
}: ColumnMapFlowProps) {
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set());
  const toggleGroup = React.useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const views = React.useMemo(() => collapseUnchangedBranches(model, expanded), [model, expanded]);
  const layout = React.useMemo(() => layoutColumns(views), [views]);
  const cards = React.useMemo(() => cardsById(model), [model]);
  const changes = React.useMemo(() => changeOrder(model), [model]);
  const proposal = changes.length > 0;
  const [focusIndex, setFocusIndex] = React.useState<number | null>(initialFocusIndex);
  const focusedId = focusIndex === null ? null : (changes[focusIndex] ?? null);

  const nodes = React.useMemo<(CardFlowNode | CollapsedFlowNode)[]>(
    () =>
      layout.placements.map((placement: ColumnPlacement) => {
        const base = {
          id: placement.id,
          position: { x: placement.x, y: placement.y },
          width: placement.width,
          height: placement.height,
          draggable: false,
          connectable: false,
        };
        if (placement.kind === 'collapsed') {
          const slot = views
            .flatMap((view) => view.slots)
            .find((entry) => entry.kind === 'collapsed' && entry.group.id === placement.id);
          const group = slot?.kind === 'collapsed' ? slot.group : null;
          return {
            ...base,
            type: 'map-collapsed' as const,
            selectable: false,
            data: {
              group: group ?? { id: placement.id, count: 0, adSetIds: [], expanded: false },
              onToggle: toggleGroup,
            },
          };
        }
        const card = cards.get(placement.id) as MapCard;
        const foldSelected = Boolean(
          selectedIds &&
            ((card.folded.audienceId && selectedIds.has(card.folded.audienceId)) ||
              (card.folded.creativeId && selectedIds.has(card.folded.creativeId))),
        );
        return {
          ...base,
          type: 'map-card' as const,
          selected: selectedIds?.has(placement.id) ?? false,
          selectable: Boolean(onNodesChange),
          data: {
            card,
            height: placement.height,
            dimmed: proposal && card.mark === 'unchanged',
            focused: placement.id === focusedId,
            foldSelected,
            testIdPrefix,
            onSelectFolded: onSelectFolded ?? null,
          },
        };
      }),
    [
      cards,
      focusedId,
      layout,
      onNodesChange,
      onSelectFolded,
      proposal,
      selectedIds,
      testIdPrefix,
      toggleGroup,
      views,
    ],
  );

  const edges = React.useMemo<Edge[]>(
    () =>
      layout.placements
        .filter((placement) => placement.parentId)
        .map((placement) => ({
          id: `${placement.parentId}->${placement.id}`,
          source: placement.parentId as string,
          target: placement.id,
          selectable: false,
          focusable: false,
        })),
    [layout],
  );

  const ids = React.useMemo(() => new Set(cards.keys()), [cards]);
  const handleNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      if (!onNodesChange) return;
      const passed = changes.filter(
        (change) => (change.type === 'select' || change.type === 'remove') && ids.has(change.id),
      );
      if (passed.length > 0) onNodesChange(passed);
    },
    [ids, onNodesChange],
  );

  const paneRef = React.useRef<HTMLDivElement>(null);
  const pane = usePaneSize(paneRef);
  const { setViewport } = useReactFlow();

  // The opening view: all three columns at the largest zoom ≤ 1 the pane allows, top first.
  // Only a width change resets it — a taller pane keeps the person's scroll.
  const fittedWidth = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!pane || fittedWidth.current === pane.width) return;
    fittedWidth.current = pane.width;
    const focused = focusedId
      ? layout.placements.find((placement) => placement.id === focusedId)
      : null;
    void setViewport(
      focused
        ? focusViewport(focused, pane, layout.width)
        : initialColumnViewport(pane, layout.width, proposal ? NEXT_CHANGE_INSET : 0),
    );
  }, [focusedId, layout, pane, proposal, setViewport]);

  const stepTo = React.useCallback(
    (direction: 1 | -1) => {
      if (changes.length === 0) return;
      const next =
        focusIndex === null
          ? direction === 1
            ? 0
            : changes.length - 1
          : stepChange(focusIndex, changes.length, direction);
      setFocusIndex(next);
      const placement = layout.placements.find((entry) => entry.id === changes[next]);
      if (placement && pane) {
        void setViewport(focusViewport(placement, pane, layout.width), { duration: 400 });
      }
    },
    [changes, focusIndex, layout, pane, setViewport],
  );

  const minimapFill = React.useCallback((node: Node) => {
    if (node.type === 'map-collapsed') return MARK_MINIMAP_FILL.collapsed;
    const mark = (node.data as CardNodeData | undefined)?.card.mark ?? 'unchanged';
    return MARK_MINIMAP_FILL[mark];
  }, []);

  return (
    <div ref={paneRef} className="relative h-full w-full" data-testid="column-map">
      <Canvas
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={handleNodesChange}
        fitView={false}
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={Boolean(onNodesChange)}
        edgesFocusable={false}
        selectionOnDrag={false}
        deleteKeyCode={onNodesChange ? undefined : null}
      >
        {proposal ? (
          <Panel position="top-center">
            <NextChangeControl index={focusIndex} total={changes.length} onStep={stepTo} />
          </Panel>
        ) : null}
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={minimapFill}
          nodeStrokeWidth={0}
          maskColor="color-mix(in srgb, var(--background) 70%, transparent)"
          className="!m-2 !h-[112px] !w-[64px] overflow-hidden rounded-md border !bg-card shadow-sm [&>svg]:!h-full [&>svg]:!w-full"
          ariaLabel="Map overview: changes are coloured"
        />
        {children}
      </Canvas>
    </div>
  );
}
