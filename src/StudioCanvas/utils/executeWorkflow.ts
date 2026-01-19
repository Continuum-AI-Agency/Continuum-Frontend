"use client";

import type { Edge } from '@xyflow/react';
import { StudioNode } from "../types";
import { NodeOutput } from "../types/execution";
import { useStudioStore } from "../stores/useStudioStore";
import { buildExtendVideoPayload, buildNanoGenPayload, buildVeoPayload, buildEnrichPayload, toBackendExtendVideoPayload, toBackendPayload } from "./buildNodePayload";
import type { ExtendVideoPayload } from "../types/execution";
import { buildDataUrl, parseDataUrl } from "./dataUrl";
import { useWorkflowExecution } from "../hooks/useWorkflowExecution";

type ExecutorControls = ReturnType<typeof useWorkflowExecution>;

const MAX_CONCURRENT_EXECUTIONS = 3;

type NodeReadiness = {
  ready: boolean;
  reason?: string;
};

const normalizeText = (value?: string | null): string | undefined => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length ? trimmed : undefined;
};

const getIncomingEdges = (edges: Edge[], nodeId: string) =>
  edges.filter((edge) => edge.target === nodeId);

const resolveTextInput = (
  edge: Edge,
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>
): string | undefined => {
  const output = resolvedOutputs.get(edge.source);
  if (output?.type === 'text') {
    return normalizeText(output.value);
  }

  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'string') {
    return normalizeText((sourceNode.data as any).value);
  }

  return undefined;
};

const resolveImageInput = (
  edge: Edge,
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>
): { base64: string; mimeType: string } | undefined => {
  const output = resolvedOutputs.get(edge.source);
  if (output?.type === 'image' && output.base64) {
    return { base64: output.base64, mimeType: output.mimeType };
  }

  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'image') {
    const parsed = parseDataUrl((sourceNode.data as any).image as string | undefined);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
  }

  return undefined;
};

const resolveVideoInput = (
  edge: Edge,
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>
): { base64: string; mimeType: string } | undefined => {
  const output = resolvedOutputs.get(edge.source);
  if (output?.type === 'video' && output.url) {
    const parsed = parseDataUrl(output.url);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
  }

  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'video') {
    const parsed = parseDataUrl((sourceNode.data as any).video as string | undefined);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
  }

  return undefined;
};
const getPromptValue = (
  node: StudioNode,
  incomingEdges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>
): { value?: string; fromEdge: boolean } => {
  const promptHandles = (node.type === 'veoDirector' || node.type === 'veoFast') ? ['prompt-in', 'prompt'] : ['prompt'];
  const promptEdges = incomingEdges.filter((edge) => promptHandles.includes(edge.targetHandle ?? ""));

  if (promptEdges.length > 0) {
    const edgePrompt = promptEdges
      .map((edge) => resolveTextInput(edge, resolvedOutputs, nodeById))
      .find(Boolean);
    return { value: edgePrompt, fromEdge: true };
  }

  const inlinePrompt =
    node.type === 'nanoGen'
      ? normalizeText((node.data as any).positivePrompt)
      : normalizeText((node.data as any).prompt);

  return { value: inlinePrompt, fromEdge: false };
};

const findMissingOptionalInput = (
  node: StudioNode,
  incomingEdges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>
): string | undefined => {
  if (node.type === 'nanoGen') {
    const refEdges = incomingEdges.filter((edge) =>
      ['ref-image', 'ref-images'].includes(edge.targetHandle ?? "")
    );
    for (const edge of refEdges) {
      if (!resolveImageInput(edge, resolvedOutputs, nodeById)) {
        return edge.targetHandle ?? 'ref-images';
      }
    }
    return undefined;
  }

  if (node.type === 'veoDirector' || node.type === 'veoFast') {
    const referenceMode = ((node.data as { referenceMode?: 'images' | 'frames' }).referenceMode ?? 'images');
    for (const edge of incomingEdges) {
      const handle = edge.targetHandle ?? "";
      if (handle === 'negative') {
        if (!resolveTextInput(edge, resolvedOutputs, nodeById)) {
          return handle;
        }
      } else if (handle === 'ref-image' || handle === 'ref-images') {
        if (node.type === 'veoDirector' && referenceMode === 'images' && !resolveImageInput(edge, resolvedOutputs, nodeById)) {
          return handle;
        }
      } else if (handle === 'first-frame' || handle === 'last-frame' || handle.startsWith('frame-')) {
        if ((node.type === 'veoFast' || referenceMode === 'frames') && !resolveImageInput(edge, resolvedOutputs, nodeById)) {
          return handle;
        }
      }
    }
  }

  return undefined;
};

const getNodeReadiness = (
  node: StudioNode,
  edges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  failedNodes: Set<string>
): NodeReadiness => {
  const incomingEdges = getIncomingEdges(edges, node.id);

  const failedEdge = incomingEdges.find((edge) => failedNodes.has(edge.source));
  if (failedEdge) {
    return { ready: false, reason: 'Upstream dependency failed' };
  }

  if (node.type === 'extendVideo') {
    const videoEdges = incomingEdges.filter((edge) => edge.targetHandle === 'video');
    if (videoEdges.length === 0) {
      return { ready: false, reason: 'Missing required video input' };
    }
    const hasVideo = videoEdges.some((edge) => resolveVideoInput(edge, resolvedOutputs, nodeById));
    if (!hasVideo) {
      return { ready: false, reason: 'Missing connected input for video' };
    }

    const promptEdges = incomingEdges.filter((edge) => edge.targetHandle === 'prompt');
    if (promptEdges.length > 0) {
      const promptValue = promptEdges
        .map((edge) => resolveTextInput(edge, resolvedOutputs, nodeById))
        .find(Boolean);
      if (!promptValue) {
        return { ready: false, reason: 'Missing connected input for prompt' };
      }
    }

    return { ready: true };
  }

  const prompt = getPromptValue(node, incomingEdges, resolvedOutputs, nodeById);
  if (!prompt.value) {
    return {
      ready: false,
      reason: prompt.fromEdge ? 'Missing prompt input' : 'Missing required prompt',
    };
  }

  const missingOptional = findMissingOptionalInput(node, incomingEdges, resolvedOutputs, nodeById);
  if (missingOptional) {
    return { ready: false, reason: `Missing connected input for ${missingOptional}` };
  }

  return { ready: true };
};

type ExecuteWorkflowOptions = {
  targetNodeId?: string;
  clearDownstream?: boolean;
};

const buildUpstreamScope = (nodes: StudioNode[], edges: Edge[], targetNodeId: string): Set<string> => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const scope = new Set<string>();
  const queue: string[] = [];

  if (!nodeIds.has(targetNodeId)) return scope;

  scope.add(targetNodeId);
  queue.push(targetNodeId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const incoming = edges.filter((edge) => edge.target === current);
    for (const edge of incoming) {
      if (!nodeIds.has(edge.source)) continue;
      if (scope.has(edge.source)) continue;
      scope.add(edge.source);
      queue.push(edge.source);
    }
  }

  return scope;
};

const buildDownstreamScope = (nodes: StudioNode[], edges: Edge[], sourceIds: Set<string>): Set<string> => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const scope = new Set<string>();
  const queue: string[] = [];

  for (const id of sourceIds) {
    if (nodeIds.has(id)) {
      queue.push(id);
      scope.add(id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const outgoing = edges.filter((edge) => edge.source === current);
    for (const edge of outgoing) {
      if (!nodeIds.has(edge.target)) continue;
      if (scope.has(edge.target)) continue;
      scope.add(edge.target);
      queue.push(edge.target);
    }
  }

  return scope;
};

export async function executeWorkflow(
  controls: ExecutorControls,
  options: ExecuteWorkflowOptions = {}
) {
  const { nodes, edges } = useStudioStore.getState();
  const { executeGeneration, executeEnrichment } = controls;
  console.info("[studio] executeWorkflow start", {
    targetNodeId: options.targetNodeId,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });

  const executionScope = options.targetNodeId
    ? buildUpstreamScope(nodes, edges, options.targetNodeId)
    : new Set(nodes.map((node) => node.id));

  const executableNodes = nodes.filter(
    (n) => (n.type === 'nanoGen' || n.type === 'veoDirector' || n.type === 'veoFast' || n.type === 'extendVideo' || n.type === 'string') && executionScope.has(n.id)
  );
  const executableNodeIds = executableNodes.map((n) => n.id);

  if (executableNodeIds.length === 0) {
    console.log("No executable nodes found");
    return;
  }
  console.info("[studio] executeWorkflow scope", {
    targetNodeId: options.targetNodeId,
    executableNodeIds,
  });

  const clearDownstream = options.clearDownstream ?? true;
  
  let nodesToReset = new Set<string>();
  if (options.targetNodeId) {
    if (clearDownstream) {
      nodesToReset = buildDownstreamScope(nodes, edges, new Set([options.targetNodeId]));
    } else {
      nodesToReset = new Set([options.targetNodeId]);
    }
  } else {
    // Global run - reset everything in executable scope
    nodesToReset = clearDownstream
      ? buildDownstreamScope(nodes, edges, new Set(executableNodeIds))
      : new Set(executableNodeIds);
  }

  const resetNodeIds = nodes
    .filter((node) => (node.type === 'nanoGen' || node.type === 'veoDirector' || node.type === 'veoFast' || node.type === 'extendVideo' || node.type === 'string') && nodesToReset.has(node.id))
    .map((node) => node.id);

  for (const nodeId of resetNodeIds) {
    useStudioStore.getState().updateNodeData(nodeId, {
      isExecuting: false,
      isComplete: false,
      error: undefined,
      generatedImage: undefined,
      generatedVideo: undefined,
    });
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const resolvedOutputs = new Map<string, NodeOutput>();
  const failedNodes = new Set<string>();

  for (const node of nodes) {
    if (node.type === 'string') {
      const value = normalizeText((node.data as any).value);
      if (value) {
        resolvedOutputs.set(node.id, { type: 'text', value });
      }
    }

    if (node.type === 'image') {
      const parsed = parseDataUrl((node.data as any).image as string | undefined);
      if (parsed?.base64) {
        resolvedOutputs.set(node.id, { type: 'image', base64: parsed.base64, mimeType: parsed.mimeType });
      }
    }

    if (node.type === 'video') {
      const parsed = parseDataUrl((node.data as any).video as string | undefined);
      if (parsed?.base64) {
        resolvedOutputs.set(node.id, { type: 'video', url: (node.data as any).video });
      }
    }

    // Pre-populate completed generator outputs if they were not reset
    if (!resetNodeIds.includes(node.id) && (node.data as any).isComplete && !(node.data as any).error) {
      if (node.type === 'nanoGen') {
         const genImage = (node.data as any).generatedImage as string;
         if (genImage) {
            const parsed = parseDataUrl(genImage);
            if (parsed?.base64) {
                resolvedOutputs.set(node.id, { type: 'image', base64: parsed.base64, mimeType: parsed.mimeType });
            }
         }
      } else if (node.type === 'veoDirector' || node.type === 'veoFast' || node.type === 'extendVideo') {
         const genVideo = (node.data as any).generatedVideo as string;
         if (genVideo) {
             resolvedOutputs.set(node.id, { type: 'video', url: genVideo });
         }
      } else if (node.type === 'string') {
         // Already handled above, but just in case logic changes
         const val = (node.data as any).value;
         if (val && !resolvedOutputs.has(node.id)) {
            resolvedOutputs.set(node.id, { type: 'text', value: val });
         }
      }
    }
  }

  const updateNodeStatus = (nodeId: string, status: 'running' | 'completed' | 'failed', error?: string) => {
    useStudioStore.getState().updateNodeData(nodeId, {
      isExecuting: status === 'running',
      isComplete: status === 'completed',
      error: error,
    });
  };

  const setNodeOutput = (nodeId: string, output: NodeOutput) => {
    resolvedOutputs.set(nodeId, output);
    if (output.type === 'image') {
      const parsed = output.base64.startsWith("data:") ? parseDataUrl(output.base64) : null;
      const mimeType = parsed?.mimeType ?? output.mimeType;
      const base64 = (parsed?.base64 ?? output.base64).replace(/\s+/g, "");
      const dataUrl = buildDataUrl(mimeType, base64);
      console.info("[studio] setting generatedImage", {
        nodeId,
        mimeType,
        base64Length: base64.length,
      });
      useStudioStore.getState().updateNodeData(nodeId, { generatedImage: dataUrl });
      const updatedNode = useStudioStore.getState().nodes.find((node) => node.id === nodeId);
      console.info("[studio] generatedImage set", {
        nodeId,
        hasGeneratedImage: Boolean((updatedNode?.data as any)?.generatedImage),
        previewPrefix: typeof (updatedNode?.data as any)?.generatedImage === "string"
          ? (updatedNode?.data as any).generatedImage.slice(0, 48)
          : undefined,
      });
    } else if (output.type === 'video') {
      useStudioStore.getState().updateNodeData(nodeId, {
        generatedVideo: output.url,
      });
    } else if (output.type === 'text') {
      useStudioStore.getState().updateNodeData(nodeId, { value: output.value });
    }
  };

  async function executeNode(nodeId: string): Promise<boolean> {
    const node = nodeById.get(nodeId);
    if (!node) return false;

    updateNodeStatus(nodeId, 'running');

    try {
      if (node.type === 'string') {
        const payload = buildEnrichPayload(node, resolvedOutputs, nodes, edges);
        
        const hasExternalInputs = (payload?.context?.images?.length ?? 0) > 0 || !!payload?.context?.audio || (payload?.context?.documents?.length ?? 0) > 0 || !!payload?.context?.video;

        if (!hasExternalInputs && payload?.prompt) {
             setNodeOutput(nodeId, { type: 'text', value: payload.prompt });
             updateNodeStatus(nodeId, 'completed');
             return true;
        }
        
        if (!payload) {
            updateNodeStatus(nodeId, 'completed');
            return true;
        }

        if (typeof executeEnrichment !== 'function') {
             updateNodeStatus(nodeId, 'failed', "Enrichment execution unavailable");
             return false;
        }

        useStudioStore.getState().updateNodeData(nodeId, { value: "" });

        const onPartialUpdate = (data: { delta: string }) => {
             const currentNodes = useStudioStore.getState().nodes;
             const node = currentNodes.find(n => n.id === nodeId);
             const currentVal = (node?.data as any).value || "";
             useStudioStore.getState().updateNodeData(nodeId, { value: currentVal + data.delta });
        };

        const result = await executeEnrichment(nodeId, payload, onPartialUpdate);
        
        if (!result.success) {
             console.error("Enrichment error", result.error);
             updateNodeStatus(nodeId, 'failed', result.error || "Enrichment failed");
             return false;
        }
        
        if (result.output?.type === 'text') {
             setNodeOutput(nodeId, { type: 'text', value: result.output.value });
             useStudioStore.getState().updateNodeData(nodeId, { value: result.output.value });
             updateNodeStatus(nodeId, 'completed');
             return true;
        }
      }

      if (node.type === 'extendVideo') {
        const payload = buildExtendVideoPayload(node, resolvedOutputs, nodes, edges);

        if (!payload) {
          updateNodeStatus(nodeId, 'failed', 'Missing required inputs or prompt');
          return false;
        }

        if (!('executeVideoExtension' in controls) || typeof controls.executeVideoExtension !== 'function') {
          updateNodeStatus(nodeId, 'failed', 'Video extension execution unavailable');
          return false;
        }
        const backendPayload = toBackendExtendVideoPayload(payload);
        const result = await controls.executeVideoExtension(nodeId, backendPayload);
        console.info("[studio] executeVideoExtension result", {
          nodeId,
          success: result.success,
          hasOutput: Boolean(result.output),
          error: result.error,
        });

        if (!result.success) {
          updateNodeStatus(nodeId, 'failed', result.error || 'Generation failed');
          return false;
        }

        if (result.output) {
          setNodeOutput(nodeId, result.output);
          updateNodeStatus(nodeId, 'completed');
          return true;
        }

        updateNodeStatus(nodeId, 'failed', 'No output received');
        return false;
      }

      let payload = null;

      if (node.type === 'nanoGen') {
        payload = buildNanoGenPayload(node, resolvedOutputs, nodes, edges);
      } else if (node.type === 'veoDirector' || node.type === 'veoFast') {
        payload = buildVeoPayload(node, resolvedOutputs, nodes, edges);
      }

      if (!payload) {
        updateNodeStatus(nodeId, 'failed', 'Missing required inputs or prompt');
        return false;
      }

      const backendPayload = toBackendPayload(payload);
      const result = await executeGeneration(nodeId, backendPayload);
      console.info("[studio] executeGeneration result", {
        nodeId,
        success: result.success,
        hasOutput: Boolean(result.output),
        error: result.error,
      });

      if (!result.success) {
        updateNodeStatus(nodeId, 'failed', result.error || 'Generation failed');
        return false;
      }

      if (result.output) {
        setNodeOutput(nodeId, result.output);
        updateNodeStatus(nodeId, 'completed');
        return true;
      }

      updateNodeStatus(nodeId, 'failed', 'No output received');
      return false;
    } catch (err) {
      console.error(err);
      updateNodeStatus(nodeId, 'failed', String(err));
      return false;
    }
  }

  const pendingNodes = new Set(
    executableNodeIds.filter(id => !resolvedOutputs.has(id))
  );
  const runningNodes = new Map<string, Promise<{ id: string; success: boolean }>>();

  while (pendingNodes.size > 0 || runningNodes.size > 0) {
    const readyNodes = Array.from(pendingNodes).filter((nodeId) => {
      const node = nodeById.get(nodeId);
      if (!node) return false;
      return getNodeReadiness(node, edges, resolvedOutputs, nodeById, failedNodes).ready;
    });

    while (readyNodes.length > 0 && runningNodes.size < MAX_CONCURRENT_EXECUTIONS) {
      const nodeId = readyNodes.shift()!;
      pendingNodes.delete(nodeId);
      const execution = executeNode(nodeId).then((success) => ({ id: nodeId, success }));
      runningNodes.set(nodeId, execution);
    }

    if (runningNodes.size === 0) {
      for (const nodeId of pendingNodes) {
        const node = nodeById.get(nodeId);
        if (!node) continue;
        const readiness = getNodeReadiness(node, edges, resolvedOutputs, nodeById, failedNodes);
        updateNodeStatus(nodeId, 'failed', readiness.reason ?? 'Missing required inputs or prompt');
        failedNodes.add(nodeId);
      }
      pendingNodes.clear();
      break;
    }

    const result = await Promise.race(runningNodes.values());
    runningNodes.delete(result.id);
    if (!result.success) {
      failedNodes.add(result.id);
    }
  }

  console.log("Workflow execution finished");
}
