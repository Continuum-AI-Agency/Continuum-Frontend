"use client";

import type { Edge } from '@xyflow/react';
import { StudioNode } from "../types";
import { NodeExecutionState, NodeOutput, GenerationPayload } from "../types/execution";
import { useStudioStore } from "../stores/useStudioStore";
import { buildDependencyGraph, getExecutableNodes } from "./buildDependencyGraph";
import { buildNanoGenPayload, buildVeoPayload, toBackendPayload } from "./buildNodePayload";
import { parseDataUrl } from "./dataUrl";
import { useWorkflowExecution } from "../hooks/useWorkflowExecution";

type ExecutorControls = ReturnType<typeof useWorkflowExecution>;

export async function executeWorkflow(
  controls: ExecutorControls
) {
  const { nodes, edges, updateNodeData } = useStudioStore.getState();
  const { executeGeneration, cancel, reset } = controls;

  const executableNodes = nodes.filter((n) => n.type === 'nanoGen' || n.type === 'veoDirector');
  const executableNodeIds = executableNodes.map((n) => n.id);

  if (executableNodeIds.length === 0) {
    console.log("No executable nodes found");
    return;
  }

  for (const nodeId of executableNodeIds) {
    updateNodeData(nodeId, {
      isExecuting: false,
      isComplete: false,
      error: undefined,
      generatedImage: undefined,
      generatedVideo: undefined,
    });
  }

  const graph = buildDependencyGraph(nodes, edges);
  console.log("Dependency graph:", graph);

  const completedOutputs = new Map<string, NodeOutput>();
  const failedNodes = new Set<string>();
  const completedNodes = new Set<string>();
  
  for (const node of nodes) {
    if (node.type === 'string' && node.data.value) {
      completedOutputs.set(node.id, { type: 'text', value: node.data.value as string });
      completedNodes.add(node.id);
    }
    if (node.type === 'image') {
      const parsed = parseDataUrl(node.data.image as string | undefined);
      if (parsed) {
        completedOutputs.set(node.id, { type: 'image', base64: parsed.base64, mimeType: parsed.mimeType });
      }
      completedNodes.add(node.id);
    }
    if (node.type === 'video') {
      const video = node.data.video;
      if (typeof video === 'string' && video.trim().length > 0) {
        completedOutputs.set(node.id, { type: 'video', url: video });
      }
      completedNodes.add(node.id);
    }
  }

  let isCancelled = false;

  const updateNodeStatus = (nodeId: string, status: 'running' | 'completed' | 'failed', error?: string) => {
    updateNodeData(nodeId, {
      isExecuting: status === 'running',
      isComplete: status === 'completed',
      error: error,
    });
  };

  const setNodeOutput = (nodeId: string, output: NodeOutput) => {
    completedOutputs.set(nodeId, output);
    if (output.type === 'image') {
      updateNodeData(nodeId, {
        generatedImage: `data:${output.mimeType};base64,${output.base64}`,
      });
    } else if (output.type === 'video') {
      updateNodeData(nodeId, {
        generatedVideo: output.url,
      });
    }
  };

  async function executeNode(nodeId: string): Promise<boolean> {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return false;

    updateNodeStatus(nodeId, 'running');

    try {
      let payload: GenerationPayload | null = null;

      if (node.type === 'nanoGen') {
        payload = buildNanoGenPayload(node, completedOutputs, nodes, edges);
      } else if (node.type === 'veoDirector') {
        payload = buildVeoPayload(node, completedOutputs, nodes, edges);
      }

      if (!payload) {
        updateNodeStatus(nodeId, 'failed', 'Missing required inputs or prompt');
        return false;
      }

      console.log(`Executing ${node.type} (${nodeId})`);
      const backendPayload = toBackendPayload(payload);
      
      const result = await executeGeneration(nodeId, backendPayload);

      if (!result.success) {
        updateNodeStatus(nodeId, 'failed', result.error || 'Generation failed');
        return false;
      }

      if (result.output) {
        setNodeOutput(nodeId, result.output);
        updateNodeStatus(nodeId, 'completed');
        return true;
      }

      return false;
    } catch (err) {
      console.error(err);
      updateNodeStatus(nodeId, 'failed', String(err));
      return false;
    }
  }
  
  while (completedNodes.size < nodes.length) {
    const pendingNodes = executableNodeIds.filter(id => !completedNodes.has(id) && !failedNodes.has(id));
    
    if (pendingNodes.length === 0) {
      break; 
    }

    const readyNodes = pendingNodes.filter(nodeId => {
      const deps = graph.dependencies.get(nodeId) || [];
      return deps.every(depId => completedNodes.has(depId));
    });

    if (readyNodes.length === 0) {
      console.error("Deadlock detected or remaining nodes have failed dependencies");
      for (const id of pendingNodes) {
        failedNodes.add(id);
        updateNodeStatus(id, 'failed', 'Upstream dependency missing or failed');
      }
      break;
    }

    const results = await Promise.all(
      readyNodes.map(async (id) => {
        const success = await executeNode(id);
        return { id, success };
      })
    );

    for (const res of results) {
      if (res.success) {
        completedNodes.add(res.id);
      } else {
        failedNodes.add(res.id);
      }
    }
  }

  console.log("Workflow execution finished");
}
