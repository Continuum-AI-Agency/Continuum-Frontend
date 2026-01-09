import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, HandleProps } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStudioStore } from '../stores/useStudioStore';
import { VeoDirectorNodeData } from '../types';
import { BlockToolbar } from '../components/BlockToolbar';
import { VideoIcon } from '@radix-ui/react-icons';
import { Label } from '@/components/ui/label';

const LimitedHandle = ({ maxConnections, isConnectable, ...props }: HandleProps & { maxConnections?: number }) => {
  const edges = useStudioStore((state) => state.edges);
  
  const checkConnectable = useCallback((params: any) => {
    let baseConnectable = true;
    
    // Handle isConnectable prop safely
    if (typeof isConnectable === 'boolean') {
        baseConnectable = isConnectable;
    } else if (typeof isConnectable === 'function') {
        const result = (isConnectable as Function)(params);
        baseConnectable = result === undefined ? true : result;
    }
    
    if (!baseConnectable) return false;
    
    if (maxConnections) {
      const nodeEdges = edges.filter(
        (e) => (e.target === params.nodeId && e.targetHandle === params.handleId) ||
               (e.source === params.nodeId && e.sourceHandle === params.handleId)
      );
      if (nodeEdges.length >= maxConnections) return false;
    }
    
    return true;
  }, [edges, maxConnections, isConnectable]);

  return <Handle {...props} isConnectable={checkConnectable} />;
};

export function VideoGenBlock({ id, data, selected }: NodeProps<Node<VeoDirectorNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  
  const [isHovered, setIsHovered] = useState(false);

  const handleModelChange = useCallback((value: string) => {
    updateNodeData(id, { model: value as any });
  }, [id, updateNodeData]);

  return (
    <div 
      className="relative group h-full w-full min-w-[300px] min-h-[170px]" 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <NodeResizer 
        minWidth={300} 
        minHeight={170} 
        isVisible={selected} 
        lineClassName="border-purple-400" 
        handleClassName="h-3 w-3 bg-purple-500 border-2 border-white rounded-full"
      />

      <BlockToolbar 
        isVisible={isHovered || !!data.isToolbarVisible}
        onDuplicate={() => duplicateNode(id)}
        onDelete={() => deleteNode(id)}
        onRun={() => console.log('Run video node')}
        onDownload={() => console.log('Download video')}
      />

      <Card className="h-full border-2 border-slate-200 shadow-md bg-white flex flex-col overflow-hidden">
        <div className="p-2 border-b bg-slate-50 flex items-center justify-between gap-2 z-10">
           <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Video Block</Label>
           <Select value={data.model} onValueChange={handleModelChange}>
            <SelectTrigger className="h-6 text-[10px] border-slate-200 w-32 bg-white">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="veo-3.1">Veo 3.1 (Cinematic)</SelectItem>
              <SelectItem value="veo-3.1-fast">Veo Fast (Social)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative flex-1 bg-black group/preview min-h-0">
           {data.generatedVideo ? (
             <video 
               src={data.generatedVideo as string} 
               controls 
               className="w-full h-full object-cover"
             />
           ) : (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
               <VideoIcon className="w-10 h-10 opacity-50" />
               <span className="text-xs">No video generated</span>
             </div>
           )}

           <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-4 py-8 pointer-events-none">
              <div className="relative pointer-events-auto">
                <LimitedHandle 
                  type="target" 
                  position={Position.Left} 
                  id="prompt-in" 
                  maxConnections={1}
                  className="!w-3 !h-3 !bg-slate-400 !-left-1.5" 
                  title="Prompt"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-medium text-white bg-black/50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Prompt</span>
              </div>
              
              <div className="relative pointer-events-auto">
                <LimitedHandle 
                  type="target" 
                  position={Position.Left} 
                  id="first-frame" 
                  maxConnections={1}
                  className="!w-3 !h-3 !bg-indigo-400 !-left-1.5" 
                  title="First Frame"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-medium text-white bg-black/50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Start</span>
              </div>

              <div className="relative pointer-events-auto">
                <LimitedHandle 
                  type="target" 
                  position={Position.Left} 
                  id="last-frame" 
                  maxConnections={1}
                  className="!w-3 !h-3 !bg-indigo-400 !-left-1.5" 
                  title="Last Frame"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-medium text-white bg-black/50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">End</span>
              </div>
           </div>

           <Handle 
             type="source" 
             position={Position.Right} 
             id="video" 
             className="!bg-purple-500 !w-3 !h-3 top-1/2" 
           />
        </div>
      </Card>
    </div>
  );
}
