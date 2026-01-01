import { Handle, Position } from "@xyflow/react";
import { Text, TextArea } from "@radix-ui/themes";

import { getPortColor } from "@/lib/ai-studio/portTypes";
import type { NegativeNodeData } from "@/lib/ai-studio/nodeTypes";

type NegativeNodeProps = {
  id: string;
  data: NegativeNodeData;
  selected: boolean;
};

export function NegativeNode({ id: nodeId, data, selected }: NegativeNodeProps) {
  return (
    <div className={`relative w-64 rounded-xl border ${selected ? "border-amber-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getPortColor('text') }} />
        <Text className="text-gray-200">Negative Prompt</Text>
      </div>
      <TextArea
        value={data.negativePrompt}
        onChange={(e) =>
          window.dispatchEvent(new CustomEvent("node:edit", { detail: { id: nodeId, field: "negativePrompt", value: e.target.value } }))
        }
        placeholder="What to avoid..."
        className="min-h-[80px] bg-transparent text-white"
      />
      <Handle type="source" position={Position.Right} id="output" className="!bg-amber-400 h-3 w-3" />
    </div>
  );
}
