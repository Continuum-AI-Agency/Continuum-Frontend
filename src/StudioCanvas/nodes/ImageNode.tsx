import React, { useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useStudioStore } from '../stores/useStudioStore';
import { BaseNodeData } from '../types';

export interface ImageNodeData extends BaseNodeData {
  image?: string;
  fileName?: string;
}

export function ImageNode({ id, data }: NodeProps<Node<ImageNodeData>>) {
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const [preview, setPreview] = useState<string | undefined>(data.image);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        updateNodeData(id, { image: result, fileName: file.name });
      };
      reader.readAsDataURL(file);
    }
  }, [id, updateNodeData]);

  return (
    <Card className="w-64 border border-slate-200 shadow-sm overflow-hidden p-0 relative">
      <CardHeader className="py-2 px-3 bg-slate-50 border-b flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-medium text-slate-500">Image Input</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative w-full aspect-square bg-slate-100 group">
            <Label htmlFor={`file-${id}`} className="cursor-pointer flex items-center justify-center w-full h-full hover:bg-slate-200/50 transition-colors">
                {preview ? (
                    <>
                        <img src={preview} alt="Preview" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">Replace</span>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center">
                        <span className="text-3xl">🖼️</span>
                        <span className="text-xs">Click or Drag Image</span>
                    </div>
                )}
            </Label>
            <Input 
                id={`file-${id}`} 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileUpload}
            />
        </div>
        {data.fileName && (
            <div className="px-2 py-1 bg-slate-50 border-t text-[10px] text-muted-foreground truncate">
                {data.fileName}
            </div>
        )}
      </CardContent>
      <Handle type="source" position={Position.Right} id="image" className="!bg-indigo-500 !w-3 !h-3 !-right-1.5" />
    </Card>
  );
}
