/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge, Button, Select, Text, TextArea } from "@radix-ui/themes";
import { ChatBubbleIcon } from "@radix-ui/react-icons";

import type { LLMNodeData } from "@/lib/ai-studio/nodeTypes";

type LLMNodeProps = {
  id: string;
  data: LLMNodeData;
  selected: boolean;
};

const PROVIDER_MODELS = {
  openai: ["gpt-4", "gpt-3.5-turbo"],
  anthropic: ["claude-3-sonnet", "claude-3-haiku"],
  google: ["gemini-pro", "gemini-pro-vision"],
};

export function LLMNode({ id: nodeId, data, selected }: LLMNodeProps) {
  const providerLabel = data.provider === "openai" ? "OpenAI" : data.provider === "anthropic" ? "Anthropic" : "Google";

  return (
    <div className={`relative w-80 rounded-xl border ${selected ? "border-green-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
      <div className="flex items-center justify-between">
        <Text className="text-gray-200">LLM Generator</Text>
        <Badge size="1" variant="soft" color="green">
          {providerLabel}
        </Badge>
      </div>

      <div className="mt-2 space-y-2">
        <div>
          <Text size="1" color="gray" className="mb-1">Provider</Text>
          <Select.Root
            value={data.provider}
            onValueChange={(value) =>
              window.dispatchEvent(new CustomEvent("node:edit", {
                detail: { id: nodeId, field: "provider", value: value as "openai" | "anthropic" | "google" }
              }))
            }
          >
            <Select.Trigger className="w-full" />
            <Select.Content>
              <Select.Item value="openai">OpenAI</Select.Item>
              <Select.Item value="anthropic">Anthropic</Select.Item>
              <Select.Item value="google">Google</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>

        <div>
          <Text size="1" color="gray" className="mb-1">Model</Text>
          <Select.Root
            value={data.model}
            onValueChange={(value) =>
              window.dispatchEvent(new CustomEvent("node:edit", {
                detail: { id: nodeId, field: "model", value }
              }))
            }
          >
            <Select.Trigger className="w-full" />
            <Select.Content>
              {PROVIDER_MODELS[data.provider].map((model) => (
                <Select.Item key={model} value={model}>
                  {model}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>

        <div>
          <Text size="1" color="gray" className="mb-1">System Prompt (optional)</Text>
          <TextArea
            value={data.systemPrompt ?? ""}
            onChange={(e) =>
              window.dispatchEvent(new CustomEvent("node:edit", {
                detail: { id: nodeId, field: "systemPrompt", value: e.target.value || undefined }
              }))
            }
            placeholder="You are a creative prompt engineer..."
            className="h-16 bg-transparent text-white text-sm"
          />
        </div>

        <div>
          <Text size="1" color="gray" className="mb-1">User Prompt</Text>
          <TextArea
            value={data.userPrompt}
            onChange={(e) =>
              window.dispatchEvent(new CustomEvent("node:edit", {
                detail: { id: nodeId, field: "userPrompt", value: e.target.value }
              }))
            }
            placeholder="Generate a creative image prompt..."
            className="h-20 bg-transparent text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Text size="1" color="gray" className="mb-1">Temperature</Text>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={data.temperature ?? 0.7}
              onChange={(e) =>
                window.dispatchEvent(new CustomEvent("node:edit", {
                  detail: { id: nodeId, field: "temperature", value: parseFloat(e.target.value) }
                }))
              }
              className="w-full rounded-md bg-slate-800 border border-white/10 px-2 py-1 text-white text-sm"
            />
          </div>
          <div>
            <Text size="1" color="gray" className="mb-1">Max Tokens</Text>
            <input
              type="number"
              min="1"
              max="4000"
              value={data.maxTokens ?? 500}
              onChange={(e) =>
                window.dispatchEvent(new CustomEvent("node:edit", {
                  detail: { id: nodeId, field: "maxTokens", value: parseInt(e.target.value) }
                }))
              }
              className="w-full rounded-md bg-slate-800 border border-white/10 px-2 py-1 text-white text-sm"
            />
          </div>
        </div>

        {data.generatedText && (
          <div>
            <Text size="1" color="gray" className="mb-1">Generated Text</Text>
            <TextArea
              value={data.generatedText}
              readOnly
              className="h-20 bg-slate-800 text-white text-sm"
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <Badge size="1" variant="surface" color={data.status === "completed" ? "green" : data.status === "processing" ? "blue" : "gray"}>
            {data.status ?? "idle"}
          </Badge>
          <Button size="2" onClick={() => window.dispatchEvent(new CustomEvent("node:generate-text", { detail: { id: nodeId } }))}>
            <ChatBubbleIcon /> Generate
          </Button>
        </div>
      </div>

      <Handle type="target" position={Position.Left} className="h-3 w-3 !bg-green-400" />
      <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-blue-400" />
    </div>
  );
}