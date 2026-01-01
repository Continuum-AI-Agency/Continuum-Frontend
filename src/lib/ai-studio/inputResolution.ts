import type { Edge, Node } from "@xyflow/react";

import type { AiStudioProvider } from "@/lib/schemas/aiStudio";
import {
  type AttachmentNodeData,
  type GeneratorNodeData,
  type ModelNodeData,
  type NegativeNodeData,
  type PromptNodeData,
} from "@/lib/ai-studio/nodeTypes";
import type { RefImage } from "@/lib/types/chatImage";

export type ResolvedInputs = {
  prompt: string;
  negativePrompt?: string;
  refs: RefImage[];
  firstFrame?: RefImage;
  lastFrame?: RefImage;
  aspectRatio: string;
  provider: AiStudioProvider;
  resolution?: string;
  duration?: number;
};

type CanvasNode = Node;

export { extractText, extractImageRef, extractAspectRatio, extractProvider };

function extractText(node: CanvasNode): string | undefined {
  const data = node.data as unknown;
  if (node.type === 'prompt') return (data as PromptNodeData).prompt;
  if (node.type === 'negative') return (data as NegativeNodeData).negativePrompt;
  if (node.type === 'generator') return (data as GeneratorNodeData).prompt;
  return undefined;
}

function extractImageRef(node: CanvasNode): RefImage | undefined {
  const data = node.data as unknown;
  
  if (node.type === 'attachment') {
    const att = data as AttachmentNodeData;
    return {
      id: node.id,
      name: att.label,
      path: att.path,
      mime: att.mimeType,
      base64: '',
      referenceType: 'asset',
    };
  }
  
  if (node.type === 'generator') {
    const gen = data as GeneratorNodeData;
    if (gen.outputPath && gen.outputType === 'image') {
      return {
        id: node.id,
        name: gen.artifactName || 'output',
        path: gen.outputPath,
        mime: 'image/png',
        base64: '',
        referenceType: 'asset',
      };
    }
  }
  
  return undefined;
}

function extractAspectRatio(node: CanvasNode): string | undefined {
  const data = node.data as unknown;
  if (node.type === 'model') return (data as ModelNodeData).aspectRatio;
  if (node.type === 'generator') return (data as GeneratorNodeData).aspectRatio;
  return undefined;
}

function extractProvider(node: CanvasNode): AiStudioProvider | undefined {
  const data = node.data as unknown;
  if (node.type === 'model') return (data as ModelNodeData).provider;
  if (node.type === 'generator') return (data as GeneratorNodeData).provider;
  return undefined;
}

export function resolveGeneratorInputs(
  nodeId: string,
  nodes: CanvasNode[],
  edges: Edge[]
): ResolvedInputs {
  const generatorNode = nodes.find(n => n.id === nodeId);
  if (!generatorNode || generatorNode.type !== 'generator') {
    return {
      prompt: '',
      refs: [],
      aspectRatio: '1:1',
      provider: 'nano-banana',
    };
  }
  
  const generatorData = generatorNode.data as GeneratorNodeData;  
  const inputs: ResolvedInputs = {
    prompt: generatorData.prompt,
    negativePrompt: undefined,
    refs: [],
    firstFrame: undefined,
    lastFrame: undefined,
    aspectRatio: generatorData.aspectRatio,
    provider: generatorData.provider,
    resolution: undefined,
    duration: undefined,
  };

  const incomingEdges = edges.filter(e => e.target === nodeId);  
  for (const edge of incomingEdges) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    if (!sourceNode) continue;

    switch (edge.targetHandle) {
      case 'prompt':
        const text = extractText(sourceNode);
        if (text) inputs.prompt = text;
        break;
      
      case 'negative':
        const negativeText = extractText(sourceNode);
        if (negativeText) inputs.negativePrompt = negativeText;
        break;
      
      case 'ref':
        const refData = extractImageRef(sourceNode);
        if (refData) inputs.refs.push(refData);
        break;
      
      case 'firstFrame':
        inputs.firstFrame = extractImageRef(sourceNode);
        break;
      
      case 'lastFrame':
        inputs.lastFrame = extractImageRef(sourceNode);
        break;
      
      case 'aspect':
        const aspect = extractAspectRatio(sourceNode);
        if (aspect) inputs.aspectRatio = aspect;
        break;
      
      case 'provider':
        const provider = extractProvider(sourceNode);
        if (provider) inputs.provider = provider;
        break;
    }
  }
  
  return inputs;
}
