export type PortType = 'text' | 'image' | 'video' | 'aspect' | 'provider';

export type Port = {
  id: string;
  type: PortType;
  label?: string;
  required: boolean;
  position?: 'top' | 'right' | 'bottom' | 'left';
};

export type NodePortDefinition = {
  inputs: Port[];
  outputs: Port[];
};

export const PORT_COLORS: Record<PortType, string> = {
  text: '#3b82f6',
  image: '#a855f7',
  video: '#a855f7',
  aspect: '#22c55e',
  provider: '#f59e0b',
};

export type TargetHandleId = 'prompt' | 'negative' | 'ref' | 'firstFrame' | 'lastFrame' | 'referenceVideo' | 'aspect' | 'provider' | 'input';

export const HANDLE_ID_TO_PORT_TYPE: Record<TargetHandleId, PortType> = {
  prompt: 'text',
  negative: 'text',
  ref: 'image',
  firstFrame: 'image',
  lastFrame: 'image',
  referenceVideo: 'video',
  aspect: 'aspect',
  provider: 'provider',
  input: 'image',
};

export const PORT_COMPATIBILITY: Record<PortType, TargetHandleId[]> = {
  text: ['prompt', 'negative'],
  image: ['ref', 'firstFrame', 'lastFrame', 'input'],
  video: ['referenceVideo'],
  aspect: ['aspect'],
  provider: ['provider'],
};

export function getPortColor(type: PortType): string {
  return PORT_COLORS[type];
}

export function getTargetPortType(handleId: string | undefined): PortType | undefined {
  if (!handleId) return undefined;
  return HANDLE_ID_TO_PORT_TYPE[handleId as TargetHandleId];
}

export function arePortsCompatible(sourceType: PortType, targetHandleId: string | undefined): boolean {
  if (!targetHandleId) return false;
  const targetHandle = targetHandleId as TargetHandleId;
  const allowedTargets = PORT_COMPATIBILITY[sourceType] ?? [];
  return allowedTargets.includes(targetHandle);
}

import type { StudioNode, AttachmentNodeData, GeneratorNodeData } from './nodeTypes';

export function getNodeOutputPortType(node: StudioNode): PortType | undefined {
  switch (node.type) {
    case 'prompt':
    case 'negative':
      return 'text';
    case 'attachment':
      const attData = node.data as AttachmentNodeData;
      return attData.mimeType?.startsWith('video/') ? 'video' : 'image';
    case 'model':
      return 'provider';
    case 'array':
      return 'text'; // Array outputs individual text items
    case 'iterator':
      return 'text'; // Iterator outputs current array item
    case 'imageProcessor':
      return 'image'; // Processor outputs processed image
    case 'llm':
      return 'text'; // LLM outputs generated text
    case 'composite':
      return 'image'; // Composite outputs combined image
    case 'generator':
      const genData = node.data as GeneratorNodeData;
      return genData.outputType ?? 'image';
    default:
      return undefined;
  }
}
