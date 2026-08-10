import { Collapsible } from '@base-ui/react/collapsible';
import { ContextMenu } from '@base-ui/react/context-menu';
import {
  CheckIcon,
  ExclamationTriangleIcon,
  MagicWandIcon,
  PaperPlaneIcon,
  StackIcon,
} from '@radix-ui/react-icons';
import { Handle, Position } from '@xyflow/react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';
import { Textarea } from '@/components/ui/textarea';
import type { GeneratorNodeData } from '@/lib/ai-studio/nodeTypes';
import { type AiStudioJob, providerAspectRatioOptions } from '@/lib/schemas/aiStudio';

type GeneratorNodeProps = {
  id: string;
  data: GeneratorNodeData;
  selected: boolean;
};

const JOB_STATUS_META: Record<
  AiStudioJob['status'],
  {
    label: string;
    variant: 'muted' | 'warning' | 'teal' | 'success' | 'destructive';
    icon: React.ReactNode;
  }
> = {
  queued: { label: 'Queued', variant: 'warning', icon: <StackIcon /> },
  processing: { label: 'Processing', variant: 'teal', icon: <MagicWandIcon /> },
  completed: { label: 'Completed', variant: 'success', icon: <CheckIcon /> },
  failed: { label: 'Failed', variant: 'destructive', icon: <ExclamationTriangleIcon /> },
  cancelled: { label: 'Cancelled', variant: 'muted', icon: <ExclamationTriangleIcon /> },
};

export function GeneratorNode({ id, data, selected }: GeneratorNodeProps) {
  const isVideo = data.medium === 'video';

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        render={
          <div
            className={`relative w-96 max-w-md rounded-xl border ${selected ? 'border-blue-400' : 'border-white/10'} bg-slate-900/95 p-3 shadow-lg`}
          >
            <div className="flex items-center justify-between">
              <Pill variant="muted">{data.provider}</Pill>
              <Pill variant={isVideo ? 'violet' : 'teal'}>{data.medium}</Pill>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {(providerAspectRatioOptions[data.provider]?.[data.medium] ?? ['1:1', '16:9']).map(
                (ratio) => (
                  <Button
                    key={ratio}
                    size="sm"
                    variant={data.aspectRatio === ratio ? 'default' : 'outline'}
                    className="rounded-full"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('node:edit', {
                          detail: { id, field: 'aspectRatio', value: ratio },
                        }),
                      )
                    }
                  >
                    {ratio}
                  </Button>
                ),
              )}
            </div>

            <Textarea
              value={data.prompt}
              onChange={(e) =>
                window.dispatchEvent(
                  new CustomEvent('node:edit', {
                    detail: { id, field: 'prompt', value: e.target.value },
                  }),
                )
              }
              placeholder="Prompt..."
              className="mt-2 min-h-[60px] bg-transparent text-white"
            />

            <div className="mt-3 flex items-center justify-between">
              {(() => {
                const meta = data.status
                  ? JOB_STATUS_META[data.status as keyof typeof JOB_STATUS_META]
                  : undefined;
                return <Pill variant={meta?.variant ?? 'muted'}>{data.status ?? 'idle'}</Pill>;
              })()}
              <Button
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('node:generate', { detail: { id } }))
                }
              >
                <PaperPlaneIcon /> Generate
              </Button>
            </div>

            {data.status === 'failed' && data.failureMessage && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                <ExclamationTriangleIcon className="mt-0.5 shrink-0" />
                <span className="break-words">{data.failureMessage}</span>
              </div>
            )}

            <Handle
              type="target"
              id="prompt"
              position={Position.Left}
              style={{ top: '30%' }}
              className="!bg-blue-400 h-3 w-3"
            />
            <Handle
              type="target"
              id="negative"
              position={Position.Left}
              style={{ top: '45%' }}
              className="!bg-amber-400 h-3 w-3"
            />
            <Handle
              type="target"
              id="ref"
              position={Position.Left}
              style={{ top: '60%' }}
              className="!bg-purple-400 h-3 w-3"
            />

            {isVideo && (
              <>
                <Handle
                  type="target"
                  id="firstFrame"
                  position={Position.Left}
                  style={{ top: '72%' }}
                  className="!bg-purple-400 h-3 w-3"
                />
                <Handle
                  type="target"
                  id="lastFrame"
                  position={Position.Left}
                  style={{ top: '82%' }}
                  className="!bg-purple-400 h-3 w-3"
                />
              </>
            )}

            <Handle
              type="source"
              position={Position.Right}
              style={{ top: '50%' }}
              className="!bg-green-400 h-3 w-3"
            />
          </div>
        }
      />

      <ContextMenu.Popup className="rounded-lg border border-white/10 bg-slate-900/95 p-2 text-sm text-white shadow-lg">
        <ContextMenu.Item
          className="flex cursor-default items-center rounded px-2 py-1 hover:bg-white/10"
          onSelect={() =>
            window.dispatchEvent(new CustomEvent('node:duplicate', { detail: { id } }))
          }
        >
          Duplicate
          <ContextMenuItemInfo description="Duplicate keeps the same generator setup for rapid prompt or parameter variants." />
        </ContextMenu.Item>
        <ContextMenu.Item
          onSelect={() => window.dispatchEvent(new CustomEvent('node:delete', { detail: { id } }))}
          className="flex cursor-default items-center rounded px-2 py-1 text-destructive hover:bg-white/10"
        >
          Delete
          <ContextMenuItemInfo description="Delete removes the generator node from the active graph." />
        </ContextMenu.Item>
        <ContextMenu.Separator className="my-1 h-px bg-white/10" />
        <ContextMenu.GroupLabel className="text-gray-300">Advanced</ContextMenu.GroupLabel>
        <Collapsible.Root>
          <Collapsible.Trigger className="mt-1 w-full rounded-md px-1 py-1 text-left text-xs text-gray-300 hover:bg-white/5">
            Advanced
          </Collapsible.Trigger>
          <Collapsible.Panel className="space-y-2 px-1 py-1">
            {!isVideo && (
              <div>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: pre-existing compact canvas-node control; the label sits directly above its single input. An htmlFor association is a tracked follow-up, out of scope for this styling pass. */}
                <label className="text-xs text-gray-300">Negative prompt</label>
                <Textarea
                  value={data.negativePrompt ?? ''}
                  onChange={(e) =>
                    window.dispatchEvent(
                      new CustomEvent('node:edit', {
                        detail: { id, field: 'negativePrompt', value: e.target.value },
                      }),
                    )
                  }
                  className="mt-1 h-16 bg-slate-800 text-white"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: pre-existing compact canvas-node control; the label sits directly above its single input. An htmlFor association is a tracked follow-up, out of scope for this styling pass. */}
                <label className="text-xs text-gray-300">Seed</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md bg-slate-800 border border-white/10 px-2 py-1 text-white"
                  value={data.seed ?? ''}
                  onChange={(e) =>
                    window.dispatchEvent(
                      new CustomEvent('node:edit', {
                        detail: {
                          id,
                          field: 'seed',
                          value: e.target.value ? Number(e.target.value) : undefined,
                        },
                      }),
                    )
                  }
                />
              </div>
              <div>
                {/* biome-ignore lint/a11y/noLabelWithoutControl: pre-existing compact canvas-node control; the label sits directly above its single input. An htmlFor association is a tracked follow-up, out of scope for this styling pass. */}
                <label className="text-xs text-gray-300">Guidance</label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={20}
                  className="mt-1 w-full rounded-md bg-slate-800 border border-white/10 px-2 py-1 text-white"
                  value={data.guidanceScale ?? ''}
                  onChange={(e) =>
                    window.dispatchEvent(
                      new CustomEvent('node:edit', {
                        detail: {
                          id,
                          field: 'guidanceScale',
                          value: e.target.value ? Number(e.target.value) : undefined,
                        },
                      }),
                    )
                  }
                />
              </div>
            </div>
          </Collapsible.Panel>
        </Collapsible.Root>
      </ContextMenu.Popup>
    </ContextMenu.Root>
  );
}
