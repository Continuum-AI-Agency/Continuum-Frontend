/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge, Button, Select, Text, TextArea, TextField } from "@radix-ui/themes";
import { MixIcon } from "@radix-ui/react-icons";

import type { CompositeNodeData } from "@/lib/ai-studio/nodeTypes";

type CompositeNodeProps = {
  id: string;
  data: CompositeNodeData;
  selected: boolean;
};

export function CompositeNode({ id: nodeId, data, selected }: CompositeNodeProps) {
  const operationLabels = {
    "text-overlay": "Text Overlay",
    "image-blend": "Image Blend",
    "mask-apply": "Mask Apply",
  };

  const positionLabels = {
    "top-left": "Top Left",
    "top-center": "Top Center",
    "top-right": "Top Right",
    center: "Center",
    "bottom-left": "Bottom Left",
    "bottom-center": "Bottom Center",
    "bottom-right": "Bottom Right",
  };

  return (
    <div className={`relative w-80 rounded-xl border ${selected ? "border-cyan-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
      <div className="flex items-center justify-between">
        <Text className="text-gray-200">Composite</Text>
        <Badge size="1" variant="soft" color="cyan">
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
                detail: { id: nodeId, field: "operation", value: value as "text-overlay" | "image-blend" | "mask-apply" }
              }))
            }
          >
            <Select.Trigger className="w-full" />
            <Select.Content>
              <Select.Item value="text-overlay">Text Overlay</Select.Item>
              <Select.Item value="image-blend">Image Blend</Select.Item>
              <Select.Item value="mask-apply">Mask Apply</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>

        {data.operation === "text-overlay" && (
          <>
            <div>
              <Text size="1" color="gray" className="mb-1">Text Content</Text>
              <TextArea
                value={data.textContent ?? ""}
                onChange={(e) =>
                  window.dispatchEvent(new CustomEvent("node:edit", {
                    detail: { id: nodeId, field: "textContent", value: e.target.value }
                  }))
                }
                placeholder="Enter text to overlay..."
                className="h-16 bg-transparent text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Text size="1" color="gray" className="mb-1">Position</Text>
                <Select.Root
                  value={data.textPosition ?? "center"}
                  onValueChange={(value) =>
                    window.dispatchEvent(new CustomEvent("node:edit", {
                      detail: { id: nodeId, field: "textPosition", value: value as any }
                    }))
                  }
                >
                  <Select.Trigger />
                  <Select.Content>
                    {Object.entries(positionLabels).map(([value, label]) => (
                      <Select.Item key={value} value={value}>
                        {label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </div>

              <div>
                <Text size="1" color="gray" className="mb-1">Font Size</Text>
                <TextField.Root
                  type="number"
                  min="8"
                  max="200"
                  value={data.fontSize ?? 32}
                  onChange={(e) =>
                    window.dispatchEvent(new CustomEvent("node:edit", {
                      detail: { id: nodeId, field: "fontSize", value: parseInt(e.target.value) }
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Text size="1" color="gray" className="mb-1">Font Color</Text>
              <input
                type="color"
                value={data.fontColor ?? "#ffffff"}
                onChange={(e) =>
                  window.dispatchEvent(new CustomEvent("node:edit", {
                    detail: { id: nodeId, field: "fontColor", value: e.target.value }
                  }))
                }
                className="w-full h-8 rounded border border-white/10"
              />
            </div>
          </>
        )}

        {data.operation === "image-blend" && (
          <>
            <div>
              <Text size="1" color="gray" className="mb-1">Blend Mode</Text>
              <Select.Root
                value={data.blendMode ?? "normal"}
                onValueChange={(value) =>
                  window.dispatchEvent(new CustomEvent("node:edit", {
                    detail: { id: nodeId, field: "blendMode", value: value as any }
                  }))
                }
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="normal">Normal</Select.Item>
                  <Select.Item value="multiply">Multiply</Select.Item>
                  <Select.Item value="screen">Screen</Select.Item>
                  <Select.Item value="overlay">Overlay</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>

            <div>
              <Text size="1" color="gray" className="mb-1">Opacity</Text>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={data.opacity ?? 1}
                onChange={(e) =>
                  window.dispatchEvent(new CustomEvent("node:edit", {
                    detail: { id: nodeId, field: "opacity", value: parseFloat(e.target.value) }
                  }))
                }
                className="w-full"
              />
              <Text size="1" color="gray">{(data.opacity ?? 1).toFixed(1)}</Text>
            </div>
          </>
        )}

        <div className="flex items-center justify-between">
          <Badge size="1" variant="surface" color={data.status === "completed" ? "green" : data.status === "processing" ? "blue" : "gray"}>
            {data.status ?? "idle"}
          </Badge>
          <Button size="2" onClick={() => window.dispatchEvent(new CustomEvent("node:composite", { detail: { id: nodeId } }))}>
            <MixIcon /> Composite
          </Button>
        </div>
      </div>

      <Handle type="target" position={Position.Left} className="h-3 w-3 !bg-cyan-400" />
      <Handle type="target" position={Position.Top} className="h-3 w-3 !bg-cyan-400" />
      {data.operation === "image-blend" && (
        <Handle type="target" position={Position.Bottom} className="h-3 w-3 !bg-cyan-400" />
      )}
      <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-green-400" />
    </div>
  );
}