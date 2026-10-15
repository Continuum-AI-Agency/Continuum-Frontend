// The Fast Cut block: footage on `media-in`, one music bed on `audio-in`, a montage out.
// The cut is planned and rendered on the server from the saved room (executeWorkflow's
// fastCut branch); this node holds the settings, previews what they do to the ladder with
// the real planner, and plays what the server filed back.

import {
  CUT_RUNGS_SEC,
  type CutPacing,
  type CutTransientKind,
  cutPacingSchema,
  cutTransientKindSchema,
  FAST_CUT_AUDIO_INPUT_HANDLE,
  FAST_CUT_MEDIA_INPUT_HANDLE,
  FAST_CUT_VIDEO_OUTPUT_HANDLE,
  STUDIO_NODE_REGISTRY,
} from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
  useEdges,
} from '@xyflow/react';
import { Copy, Play, Scissors, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Toolbar } from '@/components/ai-elements/toolbar';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { NumberScrubField } from '@/components/ui/number-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSignedAssetUrls } from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';
import { GenerationPulseLoader } from '../components/GenerationPulseLoader';
import { useNodeSelection } from '../contexts/PresenceContext';
import { useNodeConfigPatch } from '../hooks/useNodeConfigPatch';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import type { FastCutNodeData } from '../types';
import { executeWorkflow } from '../utils/executeWorkflow';
import { FAST_CUT_PREVIEW_BPM, fastCutPreview, fastCutSettings } from './fastCutPreview';
import { NodeBadge, NodeTitleBar } from './NodeChrome';

const PACING_LABELS: Record<CutPacing, string> = {
  steady: 'Steady',
  build: 'Build',
  stutter: 'Stutter',
  'drop-hit': 'Drop-hit',
};

const PACING_HINTS: Record<CutPacing, string> = {
  steady: 'One rung throughout.',
  build: 'A ladder from 1 s down to 0.05 s, landing on the drop.',
  stutter: 'A 0.4 or 0.8 s base with 0.05 or 0.1 s bursts every second bar.',
  'drop-hit': 'Long cuts until the drop, then a punch and 0.2 s cuts.',
};

const TRANSIENT_LABELS: Record<CutTransientKind, string> = {
  flash: 'Flash',
  punch: 'Punch',
  'rgb-shift': 'RGB shift',
  shake: 'Shake',
};

/** The pacings that read a rung: steady's one rung, stutter's base. */
const RUNG_PACINGS: ReadonlySet<CutPacing> = new Set(['steady', 'stutter']);
/** What steady and stutter cut at when no rung is set (cutPlan.ts). */
const DEFAULT_RUNG = 0.4;
const RUNG_ITEMS = Object.fromEntries(CUT_RUNGS_SEC.map((rung) => [String(rung), `${rung} s`]));

export function FastCutNode({ id, data, selected }: NodeProps<ReactFlowNode<FastCutNodeData>>) {
  const [isHovered, setIsHovered] = useState(false);
  const { isSelectedByOther, selectingUser } = useNodeSelection(id);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  const brandId = useStudioStore((state) => state.brandId);
  const executionControls = useWorkflowExecution();
  const patch = useNodeConfigPatch();
  const edges = useEdges();

  const { pacing, rung, bars, transients } = data;
  const settings = useMemo(
    () => fastCutSettings({ pacing, rung, bars, transients }),
    [pacing, rung, bars, transients],
  );
  const preview = useMemo(() => fastCutPreview(settings), [settings]);
  const write = (change: Partial<FastCutNodeData>) => patch(id, 'fastCut', change);

  const poolCount = edges.filter(
    (edge) => edge.target === id && edge.targetHandle === FAST_CUT_MEDIA_INPUT_HANDLE,
  ).length;
  const hasBed = edges.some(
    (edge) => edge.target === id && edge.targetHandle === FAST_CUT_AUDIO_INPUT_HANDLE,
  );

  // Signed from the Library asset the server filed, so a saved montage still plays once the
  // URL the run handed back has expired; that URL covers the wait.
  const libraryAssetId = data.renderOutputAssetId ?? data.assetId;
  const signedUrls = useSignedAssetUrls(brandId, libraryAssetId ? [libraryAssetId] : []);
  const video =
    (libraryAssetId ? signedUrls[libraryAssetId] : undefined) ??
    data.generatedVideoUrl ??
    data.generatedVideo;
  const caption = [
    data.durationSec === undefined ? null : `${data.durationSec.toFixed(1)} s`,
    data.fastCutFps === undefined ? null : `${data.fastCutFps} fps`,
    data.fastCutCuts === undefined ? null : `${data.fastCutCuts} cuts`,
    data.fastCutBpm === undefined ? null : `${Math.round(data.fastCutBpm)} BPM`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  const handleRun = useCallback(async () => {
    await executeWorkflow(executionControls, { targetNodeId: id, clearDownstream: false, brandId });
  }, [executionControls, id, brandId]);

  const maxRungCuts = preview.ok ? Math.max(1, ...preview.rungs.map((row) => row.cuts)) : 1;
  const isToolbarVisible = selected || isHovered || Boolean(data.isToolbarVisible);

  return (
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            // biome-ignore lint/a11y/noStaticElementInteractions: hover-only affordance on a canvas node wrapper; the node's controls carry the real semantics
            <div
              className={cn(
                'relative group size-full min-w-[300px] min-h-[360px] rounded-xl transition-shadow',
                isSelectedByOther && 'selected-by-other',
              )}
              style={{ '--other-user-color': selectingUser?.color } as React.CSSProperties}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              data-testid="fast-cut-node"
            >
              <NodeResizer
                minWidth={300}
                minHeight={360}
                isVisible={selected}
                lineClassName="border-brand-primary/60"
                handleClassName="h-3 w-3 bg-brand-primary border-2 border-background rounded-full"
              />

              <Toolbar
                isVisible={isToolbarVisible}
                position={Position.Top}
                className="gap-1.5 border-border/80 bg-background/95 shadow-lg backdrop-blur-sm"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleRun}
                  disabled={Boolean(data.isExecuting)}
                  title="Run Node"
                >
                  <Play className="h-4 w-4" />
                </Button>
              </Toolbar>

              <CanvasNode
                handles={{ target: false, source: false }}
                selected={selected}
                className="size-full overflow-hidden border-border/60 bg-background p-0 shadow-sm"
              >
                <NodeTitleBar
                  icon={Scissors}
                  label={STUDIO_NODE_REGISTRY.fastCut.label}
                  title={STUDIO_NODE_REGISTRY.fastCut.description}
                >
                  <NodeBadge>{`${poolCount} in · ${hasBed ? 'bed' : 'no bed'}`}</NodeBadge>
                </NodeTitleBar>

                <NodeContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 text-2xs">
                  <div className="relative flex min-h-28 flex-1 items-center justify-center overflow-hidden rounded-md bg-muted/40">
                    {data.isExecuting ? (
                      <div className="flex flex-col items-center gap-2 p-3 text-muted-foreground">
                        <GenerationPulseLoader />
                        <span>Cutting to the bed — this takes a minute or two</span>
                      </div>
                    ) : video ? (
                      // biome-ignore lint/a11y/useMediaCaption: a beat-cut montage over a music bed has no speech to caption
                      <video
                        src={video}
                        controls
                        playsInline
                        preload="metadata"
                        className="nodrag h-full w-full bg-black object-contain"
                      />
                    ) : (
                      <p className="px-3 text-center text-muted-foreground">
                        Wire clips, stills or Elements into the footage pool (left, top) and one
                        music bed into audio-in (left, bottom), then run.
                      </p>
                    )}
                  </div>

                  {video && caption ? (
                    <p className="text-muted-foreground tabular-nums" data-testid="fast-cut-result">
                      {caption}
                    </p>
                  ) : null}
                  {data.error && !data.isExecuting ? (
                    <p className="text-destructive" data-testid="fast-cut-error">
                      {data.error}
                    </p>
                  ) : null}

                  <ToggleGroup
                    aria-label="Pacing"
                    variant="outline"
                    size="sm"
                    spacing={0}
                    value={settings.pacing}
                    onValueChange={(value) => {
                      const next = cutPacingSchema.safeParse(value);
                      if (next.success) write({ pacing: next.data });
                    }}
                    className="nodrag grid w-full grid-cols-4"
                  >
                    {cutPacingSchema.options.map((option) => (
                      <ToggleGroupItem key={option} value={option} className="h-6 text-2xs">
                        {PACING_LABELS[option]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="text-muted-foreground" data-testid="fast-cut-pacing-hint">
                    {PACING_HINTS[settings.pacing]}
                  </p>

                  <div className="flex items-center gap-3">
                    {RUNG_PACINGS.has(settings.pacing) ? (
                      <div className="flex items-center gap-1">
                        <span className="text-3xs text-muted-foreground">
                          {settings.pacing === 'stutter' ? 'Base' : 'Rung'}
                        </span>
                        <Select
                          value={String(settings.rung ?? DEFAULT_RUNG)}
                          onValueChange={(value) => {
                            const next = CUT_RUNGS_SEC.find((each) => String(each) === value);
                            if (next !== undefined) write({ rung: next });
                          }}
                        >
                          <SelectTrigger
                            aria-label="Rung"
                            className="nodrag h-6 w-20 px-2 text-2xs"
                          >
                            <SelectValue items={RUNG_ITEMS} />
                          </SelectTrigger>
                          <SelectContent>
                            {CUT_RUNGS_SEC.map((value) => (
                              <SelectItem key={value} value={String(value)}>
                                {RUNG_ITEMS[String(value)]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <NumberScrubField
                      label="Bars"
                      orientation="inline"
                      min={2}
                      max={16}
                      step={1}
                      value={settings.bars}
                      onCommit={(value) => write({ bars: Math.round(value) })}
                      className="nodrag"
                    />
                  </div>

                  <ToggleGroup
                    type="multiple"
                    aria-label="Beat-follow transients"
                    variant="outline"
                    size="sm"
                    spacing={0}
                    value={settings.transients}
                    onValueChange={(value) =>
                      write({
                        transients: cutTransientKindSchema.options.filter((kind) =>
                          value.includes(kind),
                        ),
                      })
                    }
                    className="nodrag grid w-full grid-cols-4"
                  >
                    {cutTransientKindSchema.options.map((kind) => (
                      <ToggleGroupItem key={kind} value={kind} className="h-6 text-2xs">
                        {TRANSIENT_LABELS[kind]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>

                  {preview.ok ? (
                    <>
                      <ul aria-label="Cut ladder preview" className="space-y-0.5">
                        {preview.rungs.map((row) => (
                          <li
                            key={row.rung}
                            data-testid="fast-cut-ladder-row"
                            data-rung={row.rung}
                            className="grid grid-cols-[2.75rem_1fr_2rem] items-center gap-1.5"
                          >
                            <span className="tabular-nums text-muted-foreground">{`${row.rung} s`}</span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <span
                                className="block h-full rounded-full bg-brand-primary"
                                style={{ width: `${(row.cuts / maxRungCuts) * 100}%` }}
                              />
                            </span>
                            <span
                              data-testid="fast-cut-ladder-count"
                              className={cn(
                                'text-right tabular-nums',
                                row.cuts === 0 && 'text-muted-foreground',
                              )}
                            >
                              {row.cuts}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="tabular-nums" data-testid="fast-cut-preview-summary">
                        {`${preview.fps} fps · ${preview.durationSec.toFixed(1)} s · ${preview.totalCuts} cuts`}
                      </p>
                      <p className="text-muted-foreground">
                        {`Preview assumes ${FAST_CUT_PREVIEW_BPM} BPM — the real cut follows the bed's measured tempo.`}
                      </p>
                    </>
                  ) : (
                    <p className="text-destructive">{preview.error}</p>
                  )}
                </NodeContent>
              </CanvasNode>

              <div className="pointer-events-none absolute -left-2 top-1/2 flex -translate-y-1/2 flex-col items-center gap-6">
                <div
                  className="group/handle relative flex flex-col items-center"
                  style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
                >
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={FAST_CUT_MEDIA_INPUT_HANDLE}
                    className="studio-handle pointer-events-auto !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                  />
                  <span className="studio-handle-pill pointer-events-none absolute left-6 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap px-2 py-1 text-2xs font-medium opacity-0 shadow-md transition-opacity group-hover/handle:opacity-100">
                    Footage pool — clips, stills, Elements
                  </span>
                </div>
                <div
                  className="group/handle relative flex flex-col items-center"
                  style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-audio)' }}
                >
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={FAST_CUT_AUDIO_INPUT_HANDLE}
                    className="studio-handle pointer-events-auto !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                  />
                  <span className="studio-handle-pill pointer-events-none absolute left-6 top-1/2 z-50 -translate-y-1/2 whitespace-nowrap px-2 py-1 text-2xs font-medium opacity-0 shadow-md transition-opacity group-hover/handle:opacity-100">
                    Music bed — one Audio node
                  </span>
                </div>
              </div>

              <div
                className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2"
                style={{ ['--edge-color' as keyof React.CSSProperties]: 'var(--edge-video)' }}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={FAST_CUT_VIDEO_OUTPUT_HANDLE}
                        className="studio-handle pointer-events-auto !h-4 !w-4 !border-2 shadow-sm transition-transform hover:scale-125"
                      />
                    }
                  />
                  <TooltipContent>
                    <p>Montage Output</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          }
        />
        <ContextMenuContent className="w-52">
          <ContextMenuLabel>{STUDIO_NODE_REGISTRY.fastCut.label}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleRun} disabled={Boolean(data.isExecuting)}>
            <Play className="mr-2 h-4 w-4" />
            Run Node
            <ContextMenuShortcut>R</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={() => duplicateNode(id)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => deleteNode(id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </TooltipProvider>
  );
}
