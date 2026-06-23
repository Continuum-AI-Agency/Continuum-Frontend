import { getStatusBadgeLabel, isModelSelectable, MODEL_CATALOG, MODEL_NODE_MODEL_IDS } from "@continuum/contracts";
import { Badge, Button, Text } from "@radix-ui/themes";
import { Handle, Position } from "@xyflow/react";

import type { ModelNodeData } from "@/lib/ai-studio/nodeTypes";
import { getPortColor } from "@/lib/ai-studio/portTypes";
import { type AiStudioProvider, providerAspectRatioOptions } from "@/lib/schemas/aiStudio";

const MODEL_NODE_OPTIONS = MODEL_CATALOG.filter(
  (m) => (MODEL_NODE_MODEL_IDS as readonly string[]).includes(m.id)
);

type ModelNodeProps = {
  id: string;
  data: ModelNodeData;
  selected: boolean;
};

export function ModelNode({ id: nodeId, data, selected }: ModelNodeProps) {
  return (
    <div className={`relative w-64 rounded-xl border ${selected ? "border-purple-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getPortColor('provider') }} />
        <Text className="text-gray-200">Model</Text>
      </div>
      <select
        className="w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-sm text-white"
        value={data.provider}
        onChange={(e) =>
          window.dispatchEvent(new CustomEvent("node:edit", { detail: { id: nodeId, field: "provider", value: e.target.value as AiStudioProvider } }))
        }
      >
        {MODEL_NODE_OPTIONS.map((m) => (
          <option key={m.id} value={m.id} disabled={!isModelSelectable(m.status)}>
            {m.label}{getStatusBadgeLabel(m.status) ? ` (${getStatusBadgeLabel(m.status)})` : ""}
          </option>
        ))}
      </select>
      <div className="mt-1 flex flex-wrap gap-1">
        {MODEL_NODE_OPTIONS.map((m) => {
          const badgeLabel = getStatusBadgeLabel(m.status)
          if (!badgeLabel || data.provider !== m.id) return null
          return (
            <Badge key={m.id} size="1" variant="soft" color="gray">
              {badgeLabel}
            </Badge>
          )
        })}
      </div>
      
      <div className="mt-2 flex flex-wrap gap-1">
        {(providerAspectRatioOptions[data.provider]?.[data.medium] ?? ["1:1", "16:9"]).map((ratio) => (
          <Button
            key={ratio}
            size="1"
            variant={data.aspectRatio === ratio ? "solid" : "outline"}
            className="rounded-full"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("node:edit", { detail: { id: nodeId, field: "aspectRatio", value: ratio } }))
            }
          >
            {ratio}
          </Button>
        ))}
      </div>
      
      <Handle type="source" position={Position.Right} id="aspect" style={{ top: "70%" }} className="!bg-green-400 h-3 w-3" />
      <Handle type="source" position={Position.Right} id="provider" style={{ top: "85%" }} className="!bg-amber-400 h-3 w-3" />
    </div>
  );
}
