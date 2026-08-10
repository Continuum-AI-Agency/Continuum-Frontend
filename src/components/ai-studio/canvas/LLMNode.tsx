/* eslint-disable @next/next/no-img-element */
'use client';

import {
  getLlmModelsByProvider,
  getStatusBadgeLabel,
  isModelSelectable,
} from '@continuum/contracts';
import { Handle, Position } from '@xyflow/react';
import { MessageCircle } from 'lucide-react';

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
import type { LLMNodeData } from '@/lib/ai-studio/nodeTypes';

type LLMProvider = 'openai' | 'anthropic' | 'google';

type LLMNodeProps = {
  id: string;
  data: LLMNodeData;
  selected: boolean;
};

const PROVIDER_LABEL: Record<LLMProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

export function LLMNode({ id: nodeId, data, selected }: LLMNodeProps) {
  const provider = data.provider as LLMProvider;
  const providerLabel = PROVIDER_LABEL[provider] ?? provider;
  const providerModels = getLlmModelsByProvider(data.provider);

  return (
    <div
      className={`relative w-80 rounded-xl border ${selected ? 'border-green-400' : 'border-white/10'} bg-slate-900/90 p-3 shadow-lg`}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-200">LLM Generator</span>
        <Pill variant="success">{providerLabel}</Pill>
      </div>

      <div className="mt-2 space-y-2">
        <div>
          <span className="mb-1 block text-xs text-gray-300">Provider</span>
          <Select
            value={data.provider}
            onValueChange={(value) =>
              window.dispatchEvent(
                new CustomEvent('node:edit', {
                  detail: { id: nodeId, field: 'provider', value: value as LLMProvider },
                }),
              )
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <span className="mb-1 block text-xs text-gray-300">Model</span>
          <Select
            value={data.model}
            onValueChange={(value) =>
              window.dispatchEvent(
                new CustomEvent('node:edit', {
                  detail: { id: nodeId, field: 'model', value },
                }),
              )
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providerModels.map((m) => {
                const badgeLabel = getStatusBadgeLabel(m.status);
                return (
                  <SelectItem key={m.id} value={m.id} disabled={!isModelSelectable(m.status)}>
                    <div className="flex items-center gap-2">
                      <span>{m.label}</span>
                      {badgeLabel ? (
                        <Pill variant={m.status === 'beta' ? 'teal' : 'muted'}>{badgeLabel}</Pill>
                      ) : null}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div>
          <span className="mb-1 block text-xs text-gray-300">System Prompt (optional)</span>
          <Textarea
            value={data.systemPrompt ?? ''}
            onChange={(e) =>
              window.dispatchEvent(
                new CustomEvent('node:edit', {
                  detail: { id: nodeId, field: 'systemPrompt', value: e.target.value || undefined },
                }),
              )
            }
            placeholder="You are a creative prompt engineer..."
            className="h-16 bg-transparent text-white text-sm"
          />
        </div>

        <div>
          <span className="mb-1 block text-xs text-gray-300">User Prompt</span>
          <Textarea
            value={data.userPrompt}
            onChange={(e) =>
              window.dispatchEvent(
                new CustomEvent('node:edit', {
                  detail: { id: nodeId, field: 'userPrompt', value: e.target.value },
                }),
              )
            }
            placeholder="Generate a creative image prompt..."
            className="h-20 bg-transparent text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="mb-1 block text-xs text-gray-300">Temperature</span>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={data.temperature ?? 0.7}
              onChange={(e) =>
                window.dispatchEvent(
                  new CustomEvent('node:edit', {
                    detail: { id: nodeId, field: 'temperature', value: parseFloat(e.target.value) },
                  }),
                )
              }
              className="w-full rounded-md bg-slate-800 border border-white/10 px-2 py-1 text-white text-sm"
            />
          </div>
          <div>
            <span className="mb-1 block text-xs text-gray-300">Max Tokens</span>
            <input
              type="number"
              min="1"
              max="4000"
              value={data.maxTokens ?? 500}
              onChange={(e) =>
                window.dispatchEvent(
                  new CustomEvent('node:edit', {
                    detail: { id: nodeId, field: 'maxTokens', value: parseInt(e.target.value, 10) },
                  }),
                )
              }
              className="w-full rounded-md bg-slate-800 border border-white/10 px-2 py-1 text-white text-sm"
            />
          </div>
        </div>

        {data.generatedText && (
          <div>
            <span className="mb-1 block text-xs text-gray-300">Generated Text</span>
            <Textarea
              value={data.generatedText}
              readOnly
              className="h-20 bg-slate-800 text-white text-sm"
            />
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
              window.dispatchEvent(
                new CustomEvent('node:generate-text', { detail: { id: nodeId } }),
              )
            }
          >
            <MessageCircle /> Generate
          </Button>
        </div>
      </div>

      <Handle type="target" position={Position.Left} className="h-3 w-3 !bg-green-400" />
      <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-blue-400" />
    </div>
  );
}
