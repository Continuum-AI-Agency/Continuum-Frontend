import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, HandleProps } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStudioStore } from '../stores/useStudioStore';
import { NanoGenNodeData } from '../types';
import { BlockToolbar } from '../components/BlockToolbar';
import { ImageIcon, UploadIcon } from '@radix-ui/react-icons';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

const LimitedHandle = ({ maxConnections, isConnectable, ...props }: HandleProps & { maxConnections?: number }) => {
  const edges = useStudioStore((state) => state.edges);
  
  const checkConnectable = useCallback((params: any) => {
    let baseConnectable = true;
    
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

  return <Handle {...props} isConnectable={checkConnectable as any} />;
};

export function ImageGenBlock({ id, data, selected }: NodeProps<Node<NanoGenNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const duplicateNode = useStudioStore((state) => state.duplicateNode);
  const deleteNode = useStudioStore((state) => state.deleteNode);
  
  const [isHovered, setIsHovered] = useState(false);

  const handleModelChange = useCallback((value: string) => {
    updateNodeData(id, { model: value as any });
  }, [id, updateNodeData]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateNodeData(id, { uploadedImage: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  }, [id, updateNodeData]);

  const previewImage = data.generatedImage || data.uploadedImage;
  const refImageLimit = data.model === 'nano-banana-pro' ? 4 : 1;

  return (
    <div 
      className="relative group h-full w-full min-w-[200px] min-h-[200px]" 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <NodeResizer 
        minWidth={200} 
        minHeight={200} 
        isVisible={selected} 
        lineClassName="border-indigo-400" 
        handleClassName="h-3 w-3 bg-indigo-500 border-2 border-white rounded-full"
      />

      <BlockToolbar 
        isVisible={isHovered || !!data.isToolbarVisible}
        onDuplicate={() => duplicateNode(id)}
        onDelete={() => deleteNode(id)}
        onRun={() => console.log('Run image node')}
        onDownload={() => console.log('Download image')}
      />

      <Card className="h-full border-2 border-slate-200 shadow-md bg-white flex flex-col overflow-hidden">
        <div className="p-2 border-b bg-slate-50 flex items-center justify-between gap-2 z-10">
           <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Image Block</Label>
           <Select value={data.model || 'nano-banana'} onValueChange={handleModelChange}>
            <SelectTrigger className="h-6 text-[10px] border-slate-200 w-32 bg-white">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nano-banana">Nano Banana</SelectItem>
              <SelectItem value="nano-banana-pro">Nano Banana Pro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative flex-1 bg-slate-100 group/preview min-h-0">
           {previewImage ? (
             <img 
               src={previewImage as string} 
               alt="Result" 
               className="w-full h-full object-cover"
             />
           ) : (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
               <ImageIcon className="w-8 h-8 opacity-50" />
               <span className="text-xs">No image yet</span>
             </div>
           )}
           
           <div className={cn(
             "absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 transition-opacity z-10",
             !previewImage && "opacity-100 pointer-events-none", 
             previewImage && "group-hover/preview:opacity-100"
           )}>
              <label className="cursor-pointer bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md flex items-center gap-2 border border-white/20 transition-all pointer-events-auto">
                <UploadIcon className="w-3 h-3" />
                {previewImage ? 'Replace Image' : 'Upload Image'}
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
              </label>
           </div>
           
           <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-center gap-4 py-8 pointer-events-none">
              <div className="relative pointer-events-auto">
                <LimitedHandle 
                  type="target" 
                  position={Position.Left} 
                  id="prompt" 
                  maxConnections={1}
                  className="!w-3 !h-3 !bg-indigo-500 !-left-1.5" 
                  title="Positive Prompt"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-medium text-white bg-black/50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Prompt</span>
              </div>
              
              <div className="relative pointer-events-auto">
                <LimitedHandle 
                  type="target" 
                  position={Position.Left} 
                  id="negative" 
                  maxConnections={1}
                  className="!w-3 !h-3 !bg-red-400 !-left-1.5" 
                  title="Negative Prompt"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-medium text-white bg-black/50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Neg</span>
              </div>

              <div className="relative pointer-events-auto">
                <LimitedHandle 
                  type="target" 
                  position={Position.Left} 
                  id="ref-image" 
                  maxConnections={refImageLimit}
                  className="!w-3 !h-3 !bg-purple-400 !-left-1.5" 
                  title={`Reference Images (Max ${refImageLimit})`}
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-medium text-white bg-black/50 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Ref</span>
              </div>
           </div>

           <Handle 
             type="source" 
             position={Position.Right} 
             id="image" 
             className="!bg-indigo-500 !w-3 !h-3 top-1/2" 
           />
        </div>
      </Card>
    </div>
  );
}
