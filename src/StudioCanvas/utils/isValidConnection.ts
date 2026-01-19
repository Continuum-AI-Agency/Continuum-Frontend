import { Connection, Edge, Node } from '@xyflow/react';
import { StudioNode, VideoGenNodeData } from '../types';
import { canAcceptSingleTextInput, hasExistingTargetConnection } from './connectionValidation';

export const getAllowedTargetHandles = (node: StudioNode): string[] => {
  switch (node.type) {
    case 'nanoGen':
      return ['prompt', 'ref-image', 'ref-images', 'trigger'];
    case 'veoDirector':
      return ['prompt-in', 'prompt', 'negative', 'ref-images', 'ref-image'];
    case 'veoFast':
      return ['prompt-in', 'prompt', 'negative', 'first-frame', 'last-frame'];
    case 'extendVideo':
      return ['prompt', 'video'];
    case 'string':
      return ['image', 'audio', 'document', 'video'];
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return [];
    default:
      return [];
  }
};

export const getAllowedSourceHandles = (node: StudioNode): string[] => {
  switch (node.type) {
    case 'string':
      return ['text'];
    case 'image':
      return ['image'];
    case 'video':
      return ['video'];
    case 'audio':
      return ['audio'];
    case 'document':
      return ['document'];
    case 'nanoGen':
      return ['image'];
    case 'veoDirector':
    case 'veoFast':
    case 'extendVideo':
      return ['video'];
    default:
      return [];
  }
};

export function isValidConnection(
  connection: Connection | Edge,
  edges: Edge[],
  nodes: StudioNode[]
): boolean {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const sourceNode = nodeById.get(connection.source);
  const targetNode = nodeById.get(connection.target);
  const targetHandle = connection.targetHandle ?? '';
  const sourceHandle = connection.sourceHandle ?? '';

  if (!sourceNode || !targetNode) return false;

  // Allow text connections to known text handles without requiring targetNode lookup details
  // (Legacy check, but we have targetNode now so we can be more specific if we want)
  if (sourceNode.type === 'string' && ['prompt', 'prompt-in', 'negative'].includes(targetHandle)) {
    return !hasExistingTargetConnection(edges, connection.target, targetHandle);
  }

  // Check handle compatibility for String Node Targets
  if (targetNode.type === 'string') {
      const handle = targetHandle || '';
      
      if (!canAcceptSingleTextInput(edges, connection.target, handle)) {
           return false;
      }

      if (handle === 'image' && (sourceNode.type === 'image' || sourceNode.type === 'nanoGen')) return true;
      if (handle === 'audio' && sourceNode.type === 'audio') return true;
      if (handle === 'video' && sourceNode.type === 'video') return true;
      if (handle === 'document' && sourceNode.type === 'document') return true;
      
      return false;
  }

  // Check handle compatibility for Extend Video Targets
  if (targetNode.type === 'extendVideo') {
      const handle = targetHandle || '';
      if (handle === 'video') {
        if (!(sourceNode.type === 'video' || sourceNode.type === 'veoDirector' || sourceNode.type === 'veoFast')) return false;
      } else if (handle === 'prompt') {
        if (sourceNode.type !== 'string') return false;
      } else {
        return false;
      }
  } else if (sourceNode.type === 'string') {
      if (!['prompt', 'prompt-in', 'negative'].includes(targetHandle || '')) return false;
  } else if (sourceNode.type === 'image' || sourceNode.type === 'nanoGen') {
      // Image sources can only connect to generation nodes, not to other reference nodes
      const handle = targetHandle || '';
      if (targetNode.type === 'veoDirector') {
        if (!['ref-image', 'ref-images'].includes(handle)) return false;
      } else if (targetNode.type === 'veoFast') {
         if (!['first-frame', 'last-frame'].includes(handle)) return false;
      } else if (!['ref-image'].includes(handle)) {
        return false;
      }
      if (targetNode.type === 'image' || targetNode.type === 'video') return false;
  } else if (sourceNode.type === 'video' || sourceNode.type === 'veoDirector' || sourceNode.type === 'veoFast') {
      if (targetNode.type === 'extendVideo' && targetHandle === 'video') {
      } else {
          return false;
      }
  }

  if (targetNode.type === 'veoDirector' && targetHandle === 'ref-images') {
      if (sourceNode.type !== 'image' && sourceNode.type !== 'nanoGen') return false;
  }

  if (!canAcceptSingleTextInput(edges, connection.target, targetHandle)) {
    return false;
  }

  // Check connection limits based on target node type and handle
  if (targetNode.type === 'nanoGen' && targetHandle === 'ref-image') {
    // Nano Banana supports up to 14 reference images
    const existingRefImageConnections = edges.filter(
      edge => edge.target === connection.target && edge.targetHandle === 'ref-image'
    ).length;
    if (existingRefImageConnections >= 14) return false;
  }

  if (targetNode.type === 'veoDirector') {
    if (targetHandle === 'first-frame' || targetHandle === 'last-frame') return false;
    
    if (targetHandle === 'ref-images') {
      const existingConnections = edges.filter(
        edge => edge.target === connection.target && edge.targetHandle === 'ref-images'
      ).length;
      if (existingConnections >= 3) return false;
    }
  }

  if (targetNode.type === 'veoFast') {
      if (targetHandle === 'ref-image' || targetHandle === 'ref-images') return false;

      if (targetHandle === 'first-frame') {
        const existingConnections = edges.filter(
          edge => edge.target === connection.target && edge.targetHandle === 'first-frame'
        ).length;
        if (existingConnections >= 1) return false;
      } else if (targetHandle === 'last-frame') {
        const existingConnections = edges.filter(
          edge => edge.target === connection.target && edge.targetHandle === 'last-frame'
        ).length;
        if (existingConnections >= 1) return false;
      } else {
          return false;
      }
  }

  if (targetNode.type === 'extendVideo' && targetHandle === 'video') {
    const existingConnections = edges.filter(
      edge => edge.target === connection.target && edge.targetHandle === 'video'
    ).length;
    if (existingConnections >= 1) return false;
  }

  return true;
}
