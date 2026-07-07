import { Handle, Position } from '@xyflow/react';

import type { PreviewNodeData } from '@/lib/ai-studio/nodeTypes';
import { getPortColor } from '@/lib/ai-studio/portTypes';

type PreviewNodeProps = {
  data: PreviewNodeData;
  selected: boolean;
};

export function PreviewNode({ data, selected }: PreviewNodeProps) {
  return (
    <div
      className={`relative w-[320px] rounded-2xl border ${selected ? 'border-green-400' : 'border-white/10'} bg-slate-900/90 p-3 shadow-xl`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: getPortColor('image') }}
        />
        <span className="text-gray-200">Preview</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60 min-h-[220px] flex items-center justify-center">
        {data.artifactPreview ? (
          data.medium === 'video' ? (
            // biome-ignore lint/a11y/useMediaCaption: pre-existing canvas preview of a user-generated artifact; no caption track exists, out of scope for this styling swap.
            <video src={data.artifactPreview} controls className="h-full w-full object-cover" />
          ) : (
            <img
              src={data.artifactPreview}
              alt={data.artifactName ?? 'artifact'}
              className="h-full w-full object-cover"
            />
          )
        ) : (
          <span className="px-4 text-center text-gray-300">Connect a generator to see output.</span>
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
