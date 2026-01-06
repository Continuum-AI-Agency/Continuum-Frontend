/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge, Button, Select, Text, TextArea } from "@radix-ui/themes";
import { MagicWandIcon, ImageIcon } from "@radix-ui/react-icons";

import type { ImageProcessorNodeData } from "@/lib/ai-studio/nodeTypes";

type ImageProcessorNodeProps = {
  id: string;
  data: ImageProcessorNodeData;
  selected: boolean;
};

export function ImageProcessorNode({ id: nodeId, data, selected }: ImageProcessorNodeProps) {
  const operationLabels = {
    inpainting: "Inpainting",
    outpainting: "Outpainting",
    relighting: "Relighting",
  };

  const operationColors = {
    inpainting: "purple",
    outpainting: "blue",
    relighting: "yellow",
  };

  return (
    <div className={`relative w-80 rounded-xl border ${selected ? "border-purple-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
      <div className="flex items-center justify-between">
        <Text className="text-gray-200">Image Processor</Text>
        <Badge size="1" variant="soft" color={operationColors[data.operation] as any}>
          {operationLabels[data.operation]}
        </Badge>
      </div>

      <div className="mt-2 space-y-2">
        <div>
          <Text size="1" color="gray" className="mb-1">Operation</Text>
          <Select.Root
            value={data.operation}
            onValueChange={(value) =>
              window.dispatchEvent(new CustomEvent("node:edit", {
                detail: { id: nodeId, field: "operation", value: value as "inpainting" | "outpainting" | "relighting" }
              }))
            }
          >
            <Select.Trigger className="w-full" />
            <Select.Content>
              <Select.Item value="inpainting">Inpainting</Select.Item>
              <Select.Item value="outpainting">Outpainting</Select.Item>
              <Select.Item value="relighting">Relighting</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>

        {(data.operation === "inpainting" || data.operation === "outpainting") && (
          <div>
            <Text size="1" color="gray" className="mb-1">Prompt</Text>
            <TextArea
              value={data.prompt ?? ""}
              onChange={(e) =>
                window.dispatchEvent(new CustomEvent("node:edit", {
                  detail: { id: nodeId, field: "prompt", value: e.target.value }
                }))
              }
              placeholder="Describe the edit..."
              className="h-16 bg-transparent text-white"
            />
          </div>
        )}

        {data.operation === "relighting" && (
          <div>
            <Text size="1" color="gray" className="mb-1">Strength</Text>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={data.strength ?? 0.5}
              onChange={(e) =>
                window.dispatchEvent(new CustomEvent("node:edit", {
                  detail: { id: nodeId, field: "strength", value: parseFloat(e.target.value) }
                }))
              }
              className="w-full"
            />
            <Text size="1" color="gray">{(data.strength ?? 0.5).toFixed(1)}</Text>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Badge size="1" variant="surface" color={data.status === "completed" ? "green" : data.status === "processing" ? "blue" : "gray"}>
            {data.status ?? "idle"}
          </Badge>
          <Button size="2" onClick={() => window.dispatchEvent(new CustomEvent("node:process", { detail: { id: nodeId } }))}>
            <MagicWandIcon /> Process
          </Button>
        </div>
      </div>

      <Handle type="target" position={Position.Left} className="h-3 w-3 !bg-purple-400" />
      <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-green-400" />
    </div>
  );
}