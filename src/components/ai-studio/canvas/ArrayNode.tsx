/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge, Button, Text, TextArea } from "@radix-ui/themes";
import { PlusIcon, TrashIcon } from "@radix-ui/react-icons";

import type { ArrayNodeData } from "@/lib/ai-studio/nodeTypes";

type ArrayNodeProps = {
  id: string;
  data: ArrayNodeData;
  selected: boolean;
};

export function ArrayNode({ id: nodeId, data, selected }: ArrayNodeProps) {
  const [items, setItems] = React.useState(data.items ?? []);

  const addItem = () => {
    const newItems = [...items, ""];
    setItems(newItems);
    window.dispatchEvent(new CustomEvent("node:edit", {
      detail: { id: nodeId, field: "items", value: newItems }
    }));
  };

  const updateItem = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
    window.dispatchEvent(new CustomEvent("node:edit", {
      detail: { id: nodeId, field: "items", value: newItems }
    }));
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    window.dispatchEvent(new CustomEvent("node:edit", {
      detail: { id: nodeId, field: "items", value: newItems }
    }));
  };

  return (
    <div className={`relative w-80 rounded-xl border ${selected ? "border-blue-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
      <div className="flex items-center justify-between">
        <Text className="text-gray-200">Array</Text>
        <Badge size="1" variant="soft">{items.length} items</Badge>
      </div>

      <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <TextArea
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              placeholder={`Item ${index + 1}...`}
              className="flex-1 h-16 bg-transparent text-white text-sm"
            />
            <Button
              size="1"
              variant="ghost"
              color="red"
              onClick={() => removeItem(index)}
              className="shrink-0"
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center">
        <Button size="2" variant="outline" onClick={addItem}>
          <PlusIcon /> Add Item
        </Button>
      </div>

      <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-purple-400" />
    </div>
  );
}