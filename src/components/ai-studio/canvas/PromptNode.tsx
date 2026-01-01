import { Handle, Position } from "@xyflow/react";
import { Text, TextArea } from "@radix-ui/themes";

import { getPortColor } from "@/lib/ai-studio/portTypes";
import type { PromptNodeData } from "@/lib/ai-studio/nodeTypes";

type PromptNodeProps = {
  id: string;
  data: PromptNodeData;
  selected: boolean;
};

export function PromptNode({ id: nodeId, data, selected }: PromptNodeProps) {
  return (
    <div className={`relative w-64 rounded-xl border ${selected ? "border-blue-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getPortColor('text') }} />
        <Text className="text-gray-200">Prompt</Text>
      </div>
      <TextArea
        value={data.prompt}
        onChange={(e) =>
          window.dispatchEvent(new CustomEvent("node:edit", { detail: { id: nodeId, field: "prompt", value: e.target.value } }))
        }
        placeholder="Describe the visual..."
        className="min-h-[80px] bg-transparent text-white"
      />
      <Handle type="source" position={Position.Right} id="output" className="!bg-blue-400 h-3 w-3" />
    </div>
  );
}
