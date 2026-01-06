/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge, Button, Text } from "@radix-ui/themes";
import { PlayIcon, StopIcon } from "@radix-ui/react-icons";

import type { IteratorNodeData } from "@/lib/ai-studio/nodeTypes";

type IteratorNodeProps = {
  id: string;
  data: IteratorNodeData;
  selected: boolean;
};

export function IteratorNode({ id: nodeId, data, selected }: IteratorNodeProps) {
  const currentIndex = data.currentIndex ?? 0;
  const totalItems = data.totalItems ?? 0;
  const progress = totalItems > 0 ? Math.round((currentIndex / totalItems) * 100) : 0;

  const handleIterate = () => {
    window.dispatchEvent(new CustomEvent("node:iterate", { detail: { id: nodeId } }));
  };

  const handleReset = () => {
    window.dispatchEvent(new CustomEvent("node:reset-iterator", { detail: { id: nodeId } }));
  };

  return (
    <div className={`relative w-64 rounded-xl border ${selected ? "border-orange-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
      <div className="flex items-center justify-between">
        <Text className="text-gray-200">Iterator</Text>
        <Badge size="1" variant="soft" color="orange">
          {currentIndex}/{totalItems}
        </Badge>
      </div>

      <div className="mt-2">
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div
            className="bg-orange-400 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <Text size="1" color="gray" className="mt-1">
          {progress}% complete
        </Text>
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="2" variant="outline" onClick={handleIterate} className="flex-1">
          <PlayIcon /> Iterate
        </Button>
        <Button size="2" variant="ghost" onClick={handleReset}>
          <StopIcon />
        </Button>
      </div>

      <Handle type="target" position={Position.Left} className="h-3 w-3 !bg-purple-400" />
      <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-blue-400" />
    </div>
  );
}