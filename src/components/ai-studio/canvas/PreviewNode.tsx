import { Handle, Position } from "@xyflow/react";
import { Text } from "@radix-ui/themes";

import { getPortColor } from "@/lib/ai-studio/portTypes";
import type { PreviewNodeData } from "@/lib/ai-studio/nodeTypes";

type PreviewNodeProps = {
  data: PreviewNodeData;
  selected: boolean;
};

export function PreviewNode({ data, selected }: PreviewNodeProps) {
  return (
    <div className={`relative w-[320px] rounded-2xl border ${selected ? "border-green-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-xl`}>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getPortColor('image') }} />
        <Text className="text-gray-200">Preview</Text>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60 min-h-[220px] flex items-center justify-center">
        {data.artifactPreview ? (
          data.medium === "video" ? (
            <video src={data.artifactPreview} controls className="h-full w-full object-cover" />
          ) : (
            <img src={data.artifactPreview} alt={data.artifactName ?? "artifact"} className="h-full w-full object-cover" />
          )
        ) : (
          <Text color="gray" className="px-4 text-center">
            Connect a generator to see output.
          </Text>
        )}
      </div>
      <Handle 
        type="target" 
        position={Position.Left} 
        id="input"
        className="!bg-purple-400 h-3 w-3" 
      />
    </div>
  );
}
