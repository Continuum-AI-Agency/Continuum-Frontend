/* eslint-disable @next/next/no-img-element */
'use client';

import { PlusIcon, TrashIcon } from '@radix-ui/react-icons';
import { Handle, Position } from '@xyflow/react';
import React from 'react';

import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ArrayNodeData } from '@/lib/ai-studio/nodeTypes';

type ArrayNodeProps = {
  id: string;
  data: ArrayNodeData;
  selected: boolean;
};

export function ArrayNode({ id: nodeId, data, selected }: ArrayNodeProps) {
  const [items, setItems] = React.useState(data.items ?? []);

  const addItem = () => {
    const newItems = [...items, ''];
    setItems(newItems);
    window.dispatchEvent(
      new CustomEvent('node:edit', {
        detail: { id: nodeId, field: 'items', value: newItems },
      }),
    );
  };

  const updateItem = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
    window.dispatchEvent(
      new CustomEvent('node:edit', {
        detail: { id: nodeId, field: 'items', value: newItems },
      }),
    );
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    window.dispatchEvent(
      new CustomEvent('node:edit', {
        detail: { id: nodeId, field: 'items', value: newItems },
      }),
    );
  };

  return (
    <div
      className={`relative w-80 rounded-xl border ${selected ? 'border-blue-400' : 'border-white/10'} bg-slate-900/90 p-3 shadow-lg`}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-200">Array</span>
        <Pill variant="muted">{items.length} items</Pill>
      </div>

      <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <Textarea
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              placeholder={`Item ${index + 1}...`}
              className="flex-1 h-16 bg-transparent text-white text-sm"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeItem(index)}
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center">
        <Button variant="outline" onClick={addItem}>
          <PlusIcon /> Add Item
        </Button>
      </div>

      <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-purple-400" />
    </div>
  );
}
