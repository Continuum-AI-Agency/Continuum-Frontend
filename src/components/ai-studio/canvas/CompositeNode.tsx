/* eslint-disable @next/next/no-img-element */
'use client';

import { Handle, Position } from '@xyflow/react';
import { Shuffle } from 'lucide-react';
import React from 'react';

import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { CompositeNodeData } from '@/lib/ai-studio/nodeTypes';

type CompositeNodeProps = {
  id: string;
  data: CompositeNodeData;
  selected: boolean;
};

export function CompositeNode({ id: nodeId, data, selected }: CompositeNodeProps) {
  const operationLabels = {
    'text-overlay': 'Text Overlay',
    'image-blend': 'Image Blend',
    'mask-apply': 'Mask Apply',
  };

  const positionLabels = {
    'top-left': 'Top Left',
    'top-center': 'Top Center',
    'top-right': 'Top Right',
    center: 'Center',
    'bottom-left': 'Bottom Left',
    'bottom-center': 'Bottom Center',
    'bottom-right': 'Bottom Right',
  };

  return (
    <div
      className={`relative w-80 rounded-xl border ${selected ? 'border-cyan-400' : 'border-white/10'} bg-slate-900/90 p-3 shadow-lg`}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-200">Composite</span>
        <Pill variant="teal">{operationLabels[data.operation]}</Pill>
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
                    value: value as 'text-overlay' | 'image-blend' | 'mask-apply',
                  },
                }),
              )
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text-overlay">Text Overlay</SelectItem>
              <SelectItem value="image-blend">Image Blend</SelectItem>
              <SelectItem value="mask-apply">Mask Apply</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {data.operation === 'text-overlay' && (
          <>
            <div>
              <span className="mb-1 block text-xs text-gray-300">Text Content</span>
              <Textarea
                value={data.textContent ?? ''}
                onChange={(e) =>
                  window.dispatchEvent(
                    new CustomEvent('node:edit', {
                      detail: { id: nodeId, field: 'textContent', value: e.target.value },
                    }),
                  )
                }
                placeholder="Enter text to overlay..."
                className="h-16 bg-transparent text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="mb-1 block text-xs text-gray-300">Position</span>
                <Select
                  value={data.textPosition ?? 'center'}
                  onValueChange={(value) =>
                    window.dispatchEvent(
                      new CustomEvent('node:edit', {
                        detail: { id: nodeId, field: 'textPosition', value: value as any },
                      }),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(positionLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <span className="mb-1 block text-xs text-gray-300">Font Size</span>
                <Input
                  type="number"
                  min="8"
                  max="200"
                  value={data.fontSize ?? 32}
                  onChange={(e) =>
                    window.dispatchEvent(
                      new CustomEvent('node:edit', {
                        detail: { id: nodeId, field: 'fontSize', value: parseInt(e.target.value) },
                      }),
                    )
                  }
                />
              </div>
            </div>

            <div>
              <span className="mb-1 block text-xs text-gray-300">Font Color</span>
              <input
                type="color"
                value={data.fontColor ?? '#ffffff'}
                onChange={(e) =>
                  window.dispatchEvent(
                    new CustomEvent('node:edit', {
                      detail: { id: nodeId, field: 'fontColor', value: e.target.value },
                    }),
                  )
                }
                className="w-full h-8 rounded border border-white/10"
              />
            </div>
          </>
        )}

        {data.operation === 'image-blend' && (
          <>
            <div>
              <span className="mb-1 block text-xs text-gray-300">Blend Mode</span>
              <Select
                value={data.blendMode ?? 'normal'}
                onValueChange={(value) =>
                  window.dispatchEvent(
                    new CustomEvent('node:edit', {
                      detail: { id: nodeId, field: 'blendMode', value: value as any },
                    }),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="multiply">Multiply</SelectItem>
                  <SelectItem value="screen">Screen</SelectItem>
                  <SelectItem value="overlay">Overlay</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <span className="mb-1 block text-xs text-gray-300">Opacity</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={data.opacity ?? 1}
                onChange={(e) =>
                  window.dispatchEvent(
                    new CustomEvent('node:edit', {
                      detail: { id: nodeId, field: 'opacity', value: parseFloat(e.target.value) },
                    }),
                  )
                }
                className="w-full"
              />
              <span className="text-xs text-gray-300">{(data.opacity ?? 1).toFixed(1)}</span>
            </div>
          </>
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
              window.dispatchEvent(new CustomEvent('node:composite', { detail: { id: nodeId } }))
            }
          >
            <Shuffle /> Composite
          </Button>
        </div>
      </div>

      <Handle type="target" position={Position.Left} className="h-3 w-3 !bg-cyan-400" />
      <Handle type="target" position={Position.Top} className="h-3 w-3 !bg-cyan-400" />
      {data.operation === 'image-blend' && (
        <Handle type="target" position={Position.Bottom} className="h-3 w-3 !bg-cyan-400" />
      )}
      <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-green-400" />
    </div>
  );
}
