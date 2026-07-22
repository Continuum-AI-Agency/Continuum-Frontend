'use client';

import type { Edge } from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import { BookOpen, LayoutTemplate, RefreshCw } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/ToastProvider';
import { useWorkflowLibrary } from '@/lib/ai-studio/useWorkflowLibrary';
import type { WorkflowLibraryItem } from '@/lib/schemas/workflowLibrary';
import { useStudioStore } from '@/StudioCanvas/stores/useStudioStore';
import type { StudioNode } from '@/StudioCanvas/types';
import { STUDIO_FIT_VIEW_OPTIONS } from '@/StudioCanvas/utils/fitViewOptions';
import { rehydrateWorkflowMediaNodes } from '@/StudioCanvas/utils/rehydrateWorkflowMedia';
import { normalizeWorkflowSnapshot } from '@/StudioCanvas/utils/workflowSerialization';

// ─── Mini canvas constants ────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 60;
const CANVAS_PAD = 24;
const SVG_W = 252;
const SVG_H = 152;

const NODE_TYPE_LABEL: Record<string, string> = {
  string: 'Prompt',
  nanoGen: 'Image Gen',
  videoGen: 'Video Gen',
  extendVideo: 'Extend Video',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
};

const NODE_TYPE_COLOR: Record<string, string> = {
  string: '#5A48F9',
  nanoGen: '#10b981',
  videoGen: '#f59e0b',
  extendVideo: '#f59e0b',
  image: '#3b82f6',
  video: '#8b5cf6',
  audio: '#ec4899',
  document: '#6b7280',
};

// ─── Raw node / edge shapes from the library content ─────────────────────────

interface RawNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data?: { label?: string };
}

interface RawEdge {
  id: string;
  source: string;
  target: string;
}

// ─── WorkflowMiniCanvas ───────────────────────────────────────────────────────

function WorkflowMiniCanvas({ nodes, edges }: { nodes: unknown[]; edges: unknown[] }) {
  const rawNodes = nodes as RawNode[];
  const rawEdges = edges as RawEdge[];

  if (rawNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No nodes
      </div>
    );
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of rawNodes) {
    if (!n.position) continue;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + NODE_W);
    maxY = Math.max(maxY, n.position.y + NODE_H);
  }

  if (!isFinite(minX)) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No layout data
      </div>
    );
  }

  const contentW = maxX - minX + CANVAS_PAD * 2;
  const contentH = maxY - minY + CANVAS_PAD * 2;
  const scale = Math.min(SVG_W / contentW, SVG_H / contentH, 1);

  const scaledW = contentW * scale;
  const scaledH = contentH * scale;
  const offsetX = (SVG_W - scaledW) / 2;
  const offsetY = (SVG_H - scaledH) / 2;

  function tx(x: number) {
    return (x - minX + CANVAS_PAD) * scale + offsetX;
  }
  function ty(y: number) {
    return (y - minY + CANVAS_PAD) * scale + offsetY;
  }

  const nw = NODE_W * scale;
  const nh = NODE_H * scale;

  const nodeMap = new Map(rawNodes.map((n) => [n.id, n]));

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block"
      aria-hidden="true"
    >
      {rawEdges.map((e) => {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (!src?.position || !tgt?.position) return null;
        const x1 = tx(src.position.x) + nw;
        const y1 = ty(src.position.y) + nh / 2;
        const x2 = tx(tgt.position.x);
        const y2 = ty(tgt.position.y) + nh / 2;
        const cpx = (x1 + x2) / 2;
        return (
          <path
            key={e.id}
            d={`M ${x1} ${y1} C ${cpx} ${y1} ${cpx} ${y2} ${x2} ${y2}`}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeOpacity={0.2}
            strokeWidth={1}
          />
        );
      })}
      {rawNodes.map((n) => {
        if (!n.position) return null;
        const x = tx(n.position.x);
        const y = ty(n.position.y);
        const type = n.type ?? 'string';
        const color = NODE_TYPE_COLOR[type] ?? '#5A48F9';
        const label = n.data?.label ?? NODE_TYPE_LABEL[type] ?? type;
        const fontSize = Math.max(7, Math.round(9 * scale));
        const truncated = label.length > 16 ? label.slice(0, 16) + '…' : label;
        return (
          <g key={n.id}>
            <rect
              x={x}
              y={y}
              width={nw}
              height={nh}
              rx={Math.max(2, 4 * scale)}
              fill={color}
              fillOpacity={0.12}
              stroke={color}
              strokeOpacity={0.45}
              strokeWidth={1}
            />
            <text
              x={x + nw / 2}
              y={y + nh / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fontSize}
              fill={color}
              fillOpacity={0.9}
            >
              {truncated}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── WorkflowCard ─────────────────────────────────────────────────────────────

function WorkflowCard({
  item,
  onUse,
}: {
  item: WorkflowLibraryItem;
  onUse: (item: WorkflowLibraryItem) => void;
}) {
  const nodeCount = item.content.nodes.length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-border/80">
      <div className="h-32 border-b border-border bg-muted/40">
        <WorkflowMiniCanvas nodes={item.content.nodes} edges={item.content.edges} />
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
          </span>
        </div>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
        )}
        {item.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-border/60 px-1.5 py-0.5 text-2xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <Button size="sm" className="mt-3 w-full" onClick={() => onUse(item)}>
          Use Workflow
        </Button>
      </div>
    </div>
  );
}

// ─── WorkflowLibrary ─────────────────────────────────────────────────────────

export function WorkflowLibrary() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeTag, setActiveTag] = React.useState<string | null>(null);

  const { items, isLoading, isError, refetch } = useWorkflowLibrary({ enabled: isOpen });
  const { setNodes, setEdges, takeSnapshot, defaultEdgeType } = useStudioStore();
  const { fitView } = useReactFlow();
  const { show } = useToast();

  const allTags = React.useMemo(
    () => [...new Set(items.flatMap((item) => item.tags))].sort(),
    [items],
  );

  const filtered = items.filter((item) => {
    const matchesQuery =
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      (item.description?.toLowerCase().includes(query.toLowerCase()) ?? false);
    const matchesTag = !activeTag || item.tags.includes(activeTag);
    return matchesQuery && matchesTag;
  });

  async function handleLoad(item: WorkflowLibraryItem) {
    const snapshot = normalizeWorkflowSnapshot(
      {
        nodes: item.content.nodes as unknown as StudioNode[],
        edges: item.content.edges as unknown as Edge[],
      },
      defaultEdgeType,
    );
    const hydratedNodes = await rehydrateWorkflowMediaNodes(snapshot.nodes);

    takeSnapshot();
    setNodes(hydratedNodes);
    setEdges(snapshot.edges);
    requestAnimationFrame(() => {
      fitView({ ...STUDIO_FIT_VIEW_OPTIONS, duration: 300 });
    });

    show({ title: 'Template applied', description: item.name, variant: 'success' });
    setIsOpen(false);
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setQuery('');
          setActiveTag(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen className="mr-1.5 h-3.5 w-3.5" />
          Templates
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[440px] p-0" align="end">
        <div className="border-b border-border p-3">
          <p className="text-sm font-semibold">Workflow Templates</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pre-built starting points — pick one to apply it to the canvas. Looking for your own
            work? Use <span className="font-medium">My Workflows</span>.
          </p>
          <input
            type="text"
            placeholder="Search templates…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mt-2.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                activeTag === null
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(tag)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  activeTag === tag
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[420px] space-y-3 overflow-y-auto p-3">
          {isLoading && (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading templates…</p>
          )}

          {isError && !isLoading && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <RefreshCw className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">Templates unavailable</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Could not load the template library. Check your connection and try again.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refetch()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          )}

          {!isLoading && !isError && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <LayoutTemplate className="h-8 w-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {query ? 'No templates match your search' : 'No templates yet'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {query
                    ? 'Try a different search term or clear the filter.'
                    : 'Templates will appear here once the library is populated.'}
                </p>
              </div>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Clear search
                </button>
              )}
            </div>
          )}

          {!isLoading &&
            !isError &&
            filtered.map((item) => (
              <WorkflowCard
                key={item.id}
                item={item}
                onUse={(workflow) => {
                  void handleLoad(workflow);
                }}
              />
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
