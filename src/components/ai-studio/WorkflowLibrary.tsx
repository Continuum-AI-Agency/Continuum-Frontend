"use client";

import React from "react";
import { BookOpen } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import type { Edge } from "@xyflow/react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/ToastProvider";
import { useWorkflowLibrary } from "@/lib/ai-studio/useWorkflowLibrary";
import type { WorkflowLibraryItem } from "@/lib/schemas/workflowLibrary";
import { useStudioStore } from "@/StudioCanvas/stores/useStudioStore";
import type { StudioNode } from "@/StudioCanvas/types";
import { normalizeWorkflowSnapshot } from "@/StudioCanvas/utils/workflowSerialization";
import { rehydrateWorkflowMediaNodes } from "@/StudioCanvas/utils/rehydrateWorkflowMedia";

// ─── Mini canvas constants ────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 60;
const CANVAS_PAD = 24;
const SVG_W = 252;
const SVG_H = 152;

const NODE_TYPE_LABEL: Record<string, string> = {
  string:      "Prompt",
  nanoGen:     "Image Gen",
  videoGen:    "Video Gen",
  extendVideo: "Extend Video",
  image:       "Image",
  video:       "Video",
  audio:       "Audio",
  document:    "Document",
};

const NODE_TYPE_COLOR: Record<string, string> = {
  string:      "#5A48F9",
  nanoGen:     "#10b981",
  videoGen:    "#f59e0b",
  extendVideo: "#f59e0b",
  image:       "#3b82f6",
  video:       "#8b5cf6",
  audio:       "#ec4899",
  document:    "#6b7280",
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
      <div className="flex h-[152px] items-center justify-center text-[11px] text-muted-foreground">
        No nodes
      </div>
    );
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of rawNodes) {
    if (!n.position) continue;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + NODE_W);
    maxY = Math.max(maxY, n.position.y + NODE_H);
  }

  if (!isFinite(minX)) {
    return (
      <div className="flex h-[152px] items-center justify-center text-[11px] text-muted-foreground">
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

  function tx(x: number) { return (x - minX + CANVAS_PAD) * scale + offsetX; }
  function ty(y: number) { return (y - minY + CANVAS_PAD) * scale + offsetY; }

  const nw = NODE_W * scale;
  const nh = NODE_H * scale;

  const nodeMap = new Map(rawNodes.map((n) => [n.id, n]));

  return (
    <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="block">
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
        const type = n.type ?? "string";
        const color = NODE_TYPE_COLOR[type] ?? "#5A48F9";
        const label = n.data?.label ?? NODE_TYPE_LABEL[type] ?? type;
        const fontSize = Math.max(7, Math.round(9 * scale));
        const truncated = label.length > 16 ? label.slice(0, 16) + "…" : label;
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

// ─── WorkflowPreviewPanel ─────────────────────────────────────────────────────

function WorkflowPreviewPanel({ item }: { item: WorkflowLibraryItem }) {
  return (
    <div className="absolute right-full top-0 z-10 mr-3 w-[288px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
      <div className="border-b border-border bg-muted/40 p-2">
        <WorkflowMiniCanvas
          nodes={item.content.nodes}
          edges={item.content.edges}
        />
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold">{item.name}</p>
        {item.description && (
          <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{item.description}</p>
        )}
        {item.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WorkflowLibrary ─────────────────────────────────────────────────────────

export function WorkflowLibrary() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hoveredItem, setHoveredItem] = React.useState<WorkflowLibraryItem | null>(null);

  const { items, isLoading, isError } = useWorkflowLibrary({ enabled: isOpen });
  const { setNodes, setEdges, takeSnapshot, defaultEdgeType } = useStudioStore();
  const { fitView } = useReactFlow();
  const { show } = useToast();

  const filtered = items.filter(
    (item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      (item.description?.toLowerCase().includes(query.toLowerCase()) ?? false)
  );

  async function handleLoad(item: WorkflowLibraryItem) {
    const snapshot = normalizeWorkflowSnapshot(
      {
        nodes: item.content.nodes as unknown as StudioNode[],
        edges: item.content.edges as unknown as Edge[],
      },
      defaultEdgeType
    );
    const hydratedNodes = await rehydrateWorkflowMediaNodes(snapshot.nodes);

    takeSnapshot();
    setNodes(hydratedNodes);
    setEdges(snapshot.edges);
    requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 300 });
    });

    show({ title: "Workflow loaded", description: item.name, variant: "success" });
    setIsOpen(false);
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setHoveredItem(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen className="mr-1.5 h-3.5 w-3.5" />
          Library
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] overflow-visible p-0" align="end">
        {hoveredItem && <WorkflowPreviewPanel item={hoveredItem} />}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search starter workflows…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList className="max-h-[320px]">
            {isLoading && <CommandEmpty>Loading…</CommandEmpty>}
            {isError && <CommandEmpty>Could not load library.</CommandEmpty>}
            {!isLoading && !isError && filtered.length === 0 && (
              <CommandEmpty>No workflows found.</CommandEmpty>
            )}
            <CommandGroup>
              {filtered.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => { void handleLoad(item); }}
                  onMouseEnter={() => setHoveredItem(item)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    {item.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </div>
                  {item.tags.length > 0 && (
                    <span className="ml-auto shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {item.tags[0]}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
