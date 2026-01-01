import { Handle, Position } from "@xyflow/react";
import { Badge, Button, TextArea } from "@radix-ui/themes";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Collapsible from "@radix-ui/react-collapsible";
import {
  PaperPlaneIcon,
  StackIcon,
  MagicWandIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";

import { getPortColor } from "@/lib/ai-studio/portTypes";
import { providerAspectRatioOptions, type AiStudioJob } from "@/lib/schemas/aiStudio";
import type { GeneratorNodeData } from "@/lib/ai-studio/nodeTypes";

type GeneratorNodeProps = {
  id: string;
  data: GeneratorNodeData;
  selected: boolean;
};

const JOB_STATUS_META: Record<
  AiStudioJob["status"],
  { label: string; color: "gray" | "amber" | "blue" | "green" | "red"; icon: React.ReactNode }
> = {
  queued: { label: "Queued", color: "amber", icon: <StackIcon /> },
  processing: { label: "Processing", color: "blue", icon: <MagicWandIcon /> },
  completed: { label: "Completed", color: "green", icon: <CheckIcon /> },
  failed: { label: "Failed", color: "red", icon: <ExclamationTriangleIcon /> },
  cancelled: { label: "Cancelled", color: "gray", icon: <ExclamationTriangleIcon /> },
};

export function GeneratorNode({ id, data, selected }: GeneratorNodeProps) {
  const isVideo = data.medium === 'video';
  
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className={`relative w-96 max-w-md rounded-2xl border ${selected ? "border-blue-400 shadow-[0_0_0_2px_rgba(59,130,246,0.35)]" : "border-white/10"} bg-slate-900/95 p-3 shadow-xl`}>
          <div className="flex items-center justify-between">
            <Badge size="2" variant="soft">
              {data.provider}
            </Badge>
            <Badge size="1" variant="soft" color={isVideo ? "purple" : "blue"}>
              {data.medium}
            </Badge>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {(providerAspectRatioOptions[data.provider]?.[data.medium] ?? ["1:1", "16:9"]).map((ratio) => (
              <Button
                key={ratio}
                size="1"
                variant={data.aspectRatio === ratio ? "solid" : "outline"}
                className="rounded-full"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("node:edit", { detail: { id, field: "aspectRatio", value: ratio } }))
                }
              >
                {ratio}
              </Button>
            ))}
          </div>

          <TextArea
            value={data.prompt}
            onChange={(e) => window.dispatchEvent(new CustomEvent("node:edit", { detail: { id, field: "prompt", value: e.target.value } }))}
            placeholder="Prompt..."
            className="mt-2 min-h-[60px] bg-transparent text-white"
          />

          <div className="mt-3 flex items-center justify-between">
            {(() => {
              const meta = data.status ? JOB_STATUS_META[data.status as keyof typeof JOB_STATUS_META] : undefined;
              return (
                <Badge size="1" variant="surface" color={meta?.color ?? "gray"}>
                  {data.status ?? "idle"}
                </Badge>
              );
            })()}
            <Button size="2" onClick={() => window.dispatchEvent(new CustomEvent("node:generate", { detail: { id } }))}>
              <PaperPlaneIcon /> Generate
            </Button>
          </div>

          <Handle 
            type="target" 
            id="prompt" 
            position={Position.Left} 
            style={{ top: "30%" }} 
            className="!bg-blue-400 h-3 w-3" 
          />
          <Handle 
            type="target" 
            id="negative" 
            position={Position.Left} 
            style={{ top: "45%" }} 
            className="!bg-amber-400 h-3 w-3" 
          />
          <Handle 
            type="target" 
            id="ref" 
            position={Position.Left} 
            style={{ top: "60%" }} 
            className="!bg-purple-400 h-3 w-3" 
          />
          
          {isVideo && (
            <>
              <Handle 
                type="target" 
                id="firstFrame" 
                position={Position.Left} 
                style={{ top: "72%" }} 
                className="!bg-purple-400 h-3 w-3" 
              />
              <Handle 
                type="target" 
                id="lastFrame" 
                position={Position.Left} 
                style={{ top: "82%" }} 
                className="!bg-purple-400 h-3 w-3" 
              />
            </>
          )}
          
          <Handle 
            type="source" 
            position={Position.Right} 
            style={{ top: "50%" }} 
            className="!bg-green-400 h-3 w-3" 
          />
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Content className="rounded-lg border border-white/10 bg-slate-900/95 p-2 text-sm text-white shadow-xl">
        <ContextMenu.Item onSelect={() => window.dispatchEvent(new CustomEvent("node:duplicate", { detail: { id } }))}>
          Duplicate
        </ContextMenu.Item>
        <ContextMenu.Item onSelect={() => window.dispatchEvent(new CustomEvent("node:delete", { detail: { id } }))} className="text-red-300">
          Delete
        </ContextMenu.Item>
        <ContextMenu.Separator className="my-1 h-px bg-white/10" />
        <ContextMenu.Label className="text-gray-300">Advanced</ContextMenu.Label>
        <Collapsible.Root>
          <Collapsible.Trigger className="mt-1 w-full rounded-md px-1 py-1 text-left text-xs text-gray-300 hover:bg-white/5">
            Advanced
          </Collapsible.Trigger>
          <Collapsible.Content className="space-y-2 px-1 py-1">
            <div>
              <label className="text-xs text-gray-300">Negative prompt</label>
              <TextArea
                value={data.negativePrompt ?? ""}
                onChange={(e) =>
                  window.dispatchEvent(
                    new CustomEvent("node:edit", { detail: { id, field: "negativePrompt", value: e.target.value } })
                  )
                }
                className="mt-1 h-16 bg-slate-800 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-300">Seed</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md bg-slate-800 border border-white/10 px-2 py-1 text-white"
                  value={data.seed ?? ""}
                  onChange={(e) =>
                    window.dispatchEvent(
                      new CustomEvent("node:edit", {
                        detail: { id, field: "seed", value: e.target.value ? Number(e.target.value) : undefined },
                      })
                    )
                  }
                />
              </div>
              <div>
                <label className="text-xs text-gray-300">Guidance</label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={20}
                  className="mt-1 w-full rounded-md bg-slate-800 border border-white/10 px-2 py-1 text-white"
                  value={data.guidanceScale ?? ""}
                  onChange={(e) =>
                    window.dispatchEvent(
                      new CustomEvent("node:edit", {
                        detail: { id, field: "guidanceScale", value: e.target.value ? Number(e.target.value) : undefined },
                      })
                    )
                  }
                />
              </div>
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
