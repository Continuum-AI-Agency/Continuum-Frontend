/* eslint-disable @next/next/no-img-element */
'use client';

import { MagicWandIcon } from '@radix-ui/react-icons';
import { Handle, Position } from '@xyflow/react';
import React from 'react';

import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ImageProcessorNodeData } from '@/lib/ai-studio/nodeTypes';

type ImageProcessorNodeProps = {
  id: string;
  data: ImageProcessorNodeData;
  selected: boolean;
};

const operationLabels = {
  inpainting: 'Inpainting',
  outpainting: 'Outpainting',
  relighting: 'Relighting',
};

const operationVariants = {
  inpainting: 'violet',
  outpainting: 'teal',
  relighting: 'warning',
} as const;

export function ImageProcessorNode({ id: nodeId, data, selected }: ImageProcessorNodeProps) {
  return (
    <div
      className={`relative w-80 rounded-xl border ${selected ? 'border-purple-400' : 'border-white/10'} bg-slate-900/90 p-3 shadow-lg`}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-200">Image Processor</span>
        <Pill variant={operationVariants[data.operation]}>{operationLabels[data.operation]}</Pill>
      </div>

      <div className="mt-2 space-y-2">
        <div>
          <span className="mb-1 block text-xs text-gray-300">Operation</span>
          <Select
            value={data.operation}
            onValueChange={(value) =>
              window.dispatchEvent(
                new CustomEvent('node:edit', {
                  detail: {
                    id: nodeId,
                    field: 'operation',
                    value: value as 'inpainting' | 'outpainting' | 'relighting',
                  },
                }),
              )
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inpainting">Inpainting</SelectItem>
              <SelectItem value="outpainting">Outpainting</SelectItem>
              <SelectItem value="relighting">Relighting</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(data.operation === 'inpainting' || data.operation === 'outpainting') && (
          <div>
            <span className="mb-1 block text-xs text-gray-300">Prompt</span>
            <Textarea
              value={data.prompt ?? ''}
              onChange={(e) =>
                window.dispatchEvent(
                  new CustomEvent('node:edit', {
                    detail: { id: nodeId, field: 'prompt', value: e.target.value },
                  }),
                )
              }
              placeholder="Describe the edit..."
              className="h-16 bg-transparent text-white"
            />
          </div>
        )}

        {data.operation === 'relighting' && (
          <div>
            <span className="mb-1 block text-xs text-gray-300">Strength</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={data.strength ?? 0.5}
              onChange={(e) =>
                window.dispatchEvent(
                  new CustomEvent('node:edit', {
                    detail: { id: nodeId, field: 'strength', value: parseFloat(e.target.value) },
                  }),
                )
              }
              className="w-full"
            />
            <span className="text-xs text-gray-300">{(data.strength ?? 0.5).toFixed(1)}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Pill
            variant={
              data.status === 'completed'
                ? 'success'
                : data.status === 'processing'
                  ? 'teal'
                  : 'muted'
            }
          >
            {data.status ?? 'idle'}
          </Pill>
          <Button
            onClick={() =>
              window.dispatchEvent(new CustomEvent('node:process', { detail: { id: nodeId } }))
            }
          >
            <MagicWandIcon /> Process
          </Button>
        </div>
      </div>

      <Handle type="target" position={Position.Left} className="h-3 w-3 !bg-purple-400" />
      <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-green-400" />
    </div>
  );
}
