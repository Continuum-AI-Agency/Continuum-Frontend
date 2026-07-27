import {
  HYPERFRAMES_AUDIO_INPUT_HANDLE,
  HYPERFRAMES_IMAGE_INPUT_HANDLE,
  HYPERFRAMES_PROMPT_INPUT_HANDLE,
  HYPERFRAMES_VIDEO_INPUT_HANDLE,
  HYPERFRAMES_VIDEO_OUTPUT_HANDLE,
} from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import { Film, Play, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/ToastProvider';
import { useCanvasRuntime } from '../contexts/CanvasRuntimeContext';
import { useStudioStore } from '../stores/useStudioStore';
import type { HyperframesAgentNodeData } from '../types';
import { startHyperframesAgentNode } from '../utils/startHyperframesAgent';

const labelForStatus = (status: HyperframesAgentNodeData['status']): string => {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'drafting':
      return 'Drafting composition';
    case 'reviewing':
      return 'Reviewing frames';
    case 'rendering':
      return 'Rendering in browser';
    case 'completed':
      return 'Video ready';
    case 'failed':
      return 'Run failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Ready';
  }
};

export function HyperframesAgentBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<HyperframesAgentNodeData>>) {
  const runtime = useCanvasRuntime();
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const { show } = useToast();
  const [starting, setStarting] = useState(false);
  const running = starting || Boolean(data.isExecuting);
  const video = data.generatedVideoUrl;

  const start = useCallback(async () => {
    if (!runtime || running) return;
    setStarting(true);
    try {
      await startHyperframesAgentNode({
        nodeId: id,
        roomId: runtime.roomId,
        brandId: runtime.brandProfileId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start HyperFrames Agent.';
      updateNodeData(id, { status: 'failed', isExecuting: false, error: message });
      show({ title: 'HyperFrames Agent failed to start', description: message, variant: 'error' });
    } finally {
      setStarting(false);
    }
  }, [id, running, runtime, show, updateNodeData]);

  return (
    <div className="relative h-full min-h-[360px] min-w-[360px]">
      <NodeResizer
        minWidth={360}
        minHeight={360}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
        handleClassName="h-3 w-3 rounded-full border-2 border-background bg-brand-primary"
      />
      <CanvasNode
        selected={selected}
        handles={{ target: false, source: false }}
        className="h-full overflow-hidden border-border/60 bg-background p-0 shadow-sm"
      >
        <NodeContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500/10 text-violet-500">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-semibold">HyperFrames Agent</div>
                <div className="text-2xs text-muted-foreground">Gemini 3.5 Flash-Lite</div>
              </div>
            </div>
            <span className="text-2xs font-medium text-muted-foreground">
              {labelForStatus(data.status)}
            </span>
          </div>

          <textarea
            value={data.prompt}
            onChange={(event) =>
              updateNodeData(id, {
                prompt: event.target.value,
                status: data.status === 'completed' ? 'idle' : data.status,
              })
            }
            placeholder="Describe the video, motion, pacing, copy, and how to use the attached media…"
            className="min-h-24 w-full resize-none rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs outline-none transition focus:border-brand-primary/60"
          />

          <div className="grid grid-cols-3 gap-2 text-2xs">
            <label className="space-y-1 text-muted-foreground">
              <span>Format</span>
              <select
                value={data.aspectRatio}
                onChange={(event) =>
                  updateNodeData(id, {
                    aspectRatio: event.target.value as HyperframesAgentNodeData['aspectRatio'],
                  })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-foreground"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </label>
            <label className="space-y-1 text-muted-foreground">
              <span>Length</span>
              <select
                value={data.durationSeconds}
                onChange={(event) =>
                  updateNodeData(id, { durationSeconds: Number(event.target.value) })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-foreground"
              >
                {[5, 10, 15, 20, 30].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds}s
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-muted-foreground">
              <span>Resolution</span>
              <select
                value={data.resolution}
                onChange={(event) =>
                  updateNodeData(id, {
                    resolution: event.target.value as HyperframesAgentNodeData['resolution'],
                  })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-foreground"
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </label>
          </div>

          <div className="relative flex min-h-28 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-black/90">
            {video ? (
              // biome-ignore lint/a11y/useMediaCaption: generated creative has no authored caption track
              <video src={video} controls className="h-full w-full object-contain" />
            ) : running ? (
              <div className="flex w-3/4 flex-col items-center gap-3 text-center">
                <Film className="h-6 w-6 animate-pulse text-violet-400" />
                <Progress value={(data.progress ?? 0) * 100} className="h-1.5 w-full" />
                <span className="text-2xs text-muted-foreground">
                  You can leave AI Studio; rendering continues in this tab.
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Connect media, add a prompt, then run the agent.
              </span>
            )}
          </div>

          {data.error ? <div className="text-xs text-destructive">{data.error}</div> : null}

          <Button onClick={() => void start()} disabled={!runtime || running} className="w-full">
            <Play className="mr-2 h-3.5 w-3.5" />
            {data.sessionId ? 'Send revision' : 'Create video'}
          </Button>
        </NodeContent>
      </CanvasNode>

      <Handle
        type="target"
        position={Position.Left}
        id={HYPERFRAMES_PROMPT_INPUT_HANDLE}
        style={{ top: '20%' }}
        className="!h-3 !w-3 !border-2 !border-background !bg-slate-400"
      />
      <Handle
        type="target"
        position={Position.Left}
        id={HYPERFRAMES_IMAGE_INPUT_HANDLE}
        style={{ top: '40%' }}
        className="!h-3 !w-3 !border-2 !border-background !bg-pink-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        id={HYPERFRAMES_VIDEO_INPUT_HANDLE}
        style={{ top: '60%' }}
        className="!h-3 !w-3 !border-2 !border-background !bg-blue-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        id={HYPERFRAMES_AUDIO_INPUT_HANDLE}
        style={{ top: '80%' }}
        className="!h-3 !w-3 !border-2 !border-background !bg-amber-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        id={HYPERFRAMES_VIDEO_OUTPUT_HANDLE}
        className="!h-3 !w-3 !border-2 !border-background !bg-blue-500"
      />
    </div>
  );
}
