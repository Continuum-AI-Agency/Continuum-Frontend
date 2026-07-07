import { Handle, Position } from '@xyflow/react';

import type { AttachmentNodeData } from '@/lib/ai-studio/nodeTypes';
import { getPortColor } from '@/lib/ai-studio/portTypes';

type AttachmentNodeProps = {
  data: AttachmentNodeData;
  selected: boolean;
};

export function AttachmentNode({ data, selected }: AttachmentNodeProps) {
  const isVideo = data.mimeType?.startsWith('video/');
  const portType = isVideo ? ('video' as const) : ('image' as const);

  return (
    <div
      className={`relative w-56 rounded-xl border ${selected ? 'border-blue-400' : 'border-white/10'} bg-slate-900/90 p-3 shadow-lg`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: getPortColor(portType) }}
        />
        <span className="text-gray-200">{isVideo ? 'Video' : 'Image'}</span>
      </div>
      <div className="h-24 overflow-hidden rounded-lg border border-white/10 bg-black/40">
        {isVideo ? (
          // biome-ignore lint/a11y/useMediaCaption: pre-existing canvas attachment thumbnail (muted/looping preview); no caption track exists, out of scope for this styling swap.
          <video src={data.previewUrl} muted loop className="h-full w-full object-cover" />
        ) : (
          <img src={data.previewUrl} alt={data.label} className="h-full w-full object-cover" />
        )}
      </div>
      <span className="mt-1 block truncate text-xs text-gray-300">{data.label}</span>
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className={`h-3 w-3 ${isVideo ? '!bg-purple-500' : '!bg-purple-400'}`}
      />
    </div>
  );
}
