"use client";

import type { Edge } from '@xyflow/react';
import { StudioNode, ImageNodeData } from "../types";
import { NodeOutput } from "../types/execution";
import { useStudioStore } from "../stores/useStudioStore";
import { buildExtendVideoPayload, buildNanoGenPayload, buildVeoPayload, buildEnrichPayload, toBackendExtendVideoPayload, toBackendPayload } from "./buildNodePayload";
import { buildDataUrl, parseDataUrl } from "./dataUrl";
import { compositeImages } from "./compositeImages";
import { useWorkflowExecution } from "../hooks/useWorkflowExecution";
import { readServerSentEvents } from "@/lib/sse/readServerSentEvents";
import { resolveVideoGeneratorModel, isVideoGeneratorNodeType } from "./videoModel";

type ExecutorControls = ReturnType<typeof useWorkflowExecution>;

const MAX_CONCURRENT_EXECUTIONS = 3;
const MEDIA_NODE_TYPES = new Set(['nanoGen', 'videoGen', 'veoDirector', 'veoFast', 'extendVideo']);

const isMediaNodeType = (nodeType: string | undefined): nodeType is string =>
  typeof nodeType === 'string' && MEDIA_NODE_TYPES.has(nodeType);

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

const stringExternalInputHandles = new Set(['image', 'audio', 'video', 'document']);

const getStringExternalInputEdges = (edges: Edge[], nodeId: string) =>
  edges.filter(
    (edge) => edge.target === nodeId && stringExternalInputHandles.has(edge.targetHandle ?? '')
  );

const resolveTextInput = (
  edge: Edge,
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  allEdges: Edge[]
): string | undefined => {
  const output = resolvedOutputs.get(edge.source);
  if (output?.type === 'text') {
    return normalizeText(output.value);
  }

  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'string') {
    const sourceRequiresExecution = getStringExternalInputEdges(allEdges, sourceNode.id).length > 0;
    if (sourceRequiresExecution) {
      const existingValue = normalizeText((sourceNode.data as any).value);
      if (existingValue) {
        return existingValue;
      }
      return undefined;
    }
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
  nodeById: Map<string, StudioNode>,
  options?: { allowUri?: boolean }
): { base64: string; mimeType: string } | { uri: string } | undefined => {
  const allowUri = Boolean(options?.allowUri);
  const output = resolvedOutputs.get(edge.source);
  if (output?.type === 'video' && output.url) {
    const parsed = parseDataUrl(output.url);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
    if (allowUri && output.url.trim()) {
      return { uri: output.url.trim() };
    }
  }

  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'video') {
    const rawVideo = (sourceNode.data as any).video as string | undefined;
    const parsed = parseDataUrl(rawVideo);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
    if (allowUri && typeof rawVideo === 'string' && rawVideo.trim()) {
      return { uri: rawVideo.trim() };
    }
  }

  if (allowUri && (isVideoGeneratorNodeType(sourceNode?.type) || sourceNode?.type === 'extendVideo')) {
    const generatedVideo = (sourceNode.data as any).generatedVideo as string | undefined;
    const generatedVideoUrl = (sourceNode.data as any).generatedVideoUrl as string | undefined;
    const parsed = parseDataUrl(generatedVideo);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
    const fallbackUri = (typeof generatedVideo === 'string' && generatedVideo.trim()) || (typeof generatedVideoUrl === 'string' && generatedVideoUrl.trim());
    if (fallbackUri) {
      return { uri: fallbackUri };
    }
  }

  return undefined;
};

const resolveAudioInput = (
  edge: Edge,
  nodeById: Map<string, StudioNode>
): { base64: string; mimeType: string } | undefined => {
  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'audio') {
    const parsed = parseDataUrl((sourceNode.data as any).audio as string | undefined);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
  }
  return undefined;
};

const resolveDocumentInput = (
  edge: Edge,
  nodeById: Map<string, StudioNode>
): Array<{ name: string; content: string }> | undefined => {
  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type !== 'document') return undefined;
  const documents = ((sourceNode.data as any).documents ?? []) as Array<Record<string, unknown>>;
  const validDocuments = documents
    .map((document) => {
      const content = typeof document.content === 'string' ? document.content : '';
      if (!content.trim()) return null;
      const name = typeof document.name === 'string' && document.name.trim() ? document.name : 'document';
      return { name, content };
    })
    .filter((document): document is { name: string; content: string } => document !== null);

  return validDocuments.length > 0 ? validDocuments : undefined;
};

const getPromptValue = (
  node: StudioNode,
  incomingEdges: Edge[],
  resolvedOutputs: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
  allEdges: Edge[]
): { value?: string; fromEdge: boolean } => {
  const promptHandles = isVideoGeneratorNodeType(node.type) ? ['prompt-in', 'prompt'] : ['prompt'];
  const promptEdges = incomingEdges.filter((edge) => promptHandles.includes(edge.targetHandle ?? ""));

  if (promptEdges.length > 0) {
    const edgePrompt = promptEdges
      .map((edge) => resolveTextInput(edge, resolvedOutputs, nodeById, allEdges))
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
  nodeById: Map<string, StudioNode>,
  allEdges: Edge[]
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

  if (isVideoGeneratorNodeType(node.type)) {
    const videoModel = resolveVideoGeneratorModel(node);
    for (const edge of incomingEdges) {
      const handle = edge.targetHandle ?? "";
      if (handle === 'negative') {
        if (!resolveTextInput(edge, resolvedOutputs, nodeById, allEdges)) {
          return handle;
        }
      } else if (handle === 'ref-image' || handle === 'ref-images') {
        if (videoModel !== 'veo-3.1-fast' && !resolveImageInput(edge, resolvedOutputs, nodeById)) {
          return handle;
        }
      } else if (handle === 'ref-video') {
        if (videoModel === 'kling-omni' && !resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: false })) {
          return handle;
        }
      } else if (handle === 'first-frame' || handle === 'last-frame' || handle.startsWith('frame-')) {
        if (videoModel === 'veo-3.1-fast' && !resolveImageInput(edge, resolvedOutputs, nodeById)) {
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

  if (node.type === 'string') {
    const externalInputEdges = getStringExternalInputEdges(edges, node.id);
    if (externalInputEdges.length === 0) {
      return normalizeText((node.data as any).value)
        ? { ready: true }
        : { ready: false, reason: 'Missing required prompt' };
    }

    for (const edge of externalInputEdges) {
      const targetHandle = edge.targetHandle ?? '';
      const inputAvailable =
        targetHandle === 'image'
          ? Boolean(resolveImageInput(edge, resolvedOutputs, nodeById))
          : targetHandle === 'audio'
            ? Boolean(resolveAudioInput(edge, nodeById))
            : targetHandle === 'video'
              ? Boolean(resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: false }))
              : targetHandle === 'document'
                ? Boolean(resolveDocumentInput(edge, nodeById))
                : false;

      if (!inputAvailable) {
        return {
          ready: false,
          reason: `Missing connected input for ${targetHandle || 'string input'}`,
        };
      }
    }

    return { ready: true };
  }

  const failedEdge = incomingEdges.find((edge) => failedNodes.has(edge.source));
  if (failedEdge) {
    return { ready: false, reason: 'Upstream dependency failed' };
  }

  if (node.type === 'extendVideo') {
    const videoEdges = incomingEdges.filter((edge) => edge.targetHandle === 'video');
    if (videoEdges.length === 0) {
      return { ready: false, reason: 'Missing required video input' };
    }
    const hasVideo = videoEdges.some((edge) => resolveVideoInput(edge, resolvedOutputs, nodeById, { allowUri: true }));
    if (!hasVideo) {
      return { ready: false, reason: 'Missing connected input for video' };
    }

    const promptEdges = incomingEdges.filter((edge) => edge.targetHandle === 'prompt');
    if (promptEdges.length > 0) {
      const promptValue = promptEdges
        .map((edge) => resolveTextInput(edge, resolvedOutputs, nodeById, edges))
        .find(Boolean);
      if (!promptValue) {
        return { ready: false, reason: 'Missing connected input for prompt' };
      }
    }

    return { ready: true };
  }

  const prompt = getPromptValue(node, incomingEdges, resolvedOutputs, nodeById, edges);
  if (!prompt.value) {
    return {
      ready: false,
      reason: prompt.fromEdge ? 'Missing prompt input' : 'Missing required prompt',
    };
  }

  const missingOptional = findMissingOptionalInput(node, incomingEdges, resolvedOutputs, nodeById, edges);
  if (missingOptional) {
    return { ready: false, reason: `Missing connected input for ${missingOptional}` };
  }

  return { ready: true };
};

type ExecuteWorkflowOptions = {
  targetNodeId?: string;
  clearDownstream?: boolean;
  brandId?: string;
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

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const targetNode = options.targetNodeId ? nodeById.get(options.targetNodeId) : undefined;

  const executableNodes = targetNode
    ? (targetNode.type === 'string' || isMediaNodeType(targetNode.type)
        ? [targetNode]
        : [])
    : nodes.filter((node) => isMediaNodeType(node.type));
  const executableNodeIds = executableNodes.map((n) => n.id);

  if (executableNodeIds.length === 0) {
    console.log("No executable nodes found");
    return;
  }
  console.info("[studio] executeWorkflow scope", {
    targetNodeId: options.targetNodeId,
    executableNodeIds,
  });

  const nodesToReset = new Set(executableNodeIds);

  const resetNodeIds = nodes
    .filter((node) => (node.type === 'string' || isMediaNodeType(node.type)) && nodesToReset.has(node.id))
    .map((node) => node.id);

  for (const nodeId of resetNodeIds) {
    useStudioStore.getState().updateNodeData(nodeId, {
      isExecuting: false,
      isComplete: false,
      error: undefined,
      generatedImage: undefined,
      generatedImageUrl: undefined,
      generatedVideo: undefined,
      generatedVideoUrl: undefined,
    });
  }

  const resolvedOutputs = new Map<string, NodeOutput>();
  const failedNodes = new Set<string>();

  const imageNodePromises: Promise<void>[] = [];
  
  for (const node of nodes) {
    if (node.type === 'string') {
      const value = normalizeText((node.data as any).value);
      if (value) {
        resolvedOutputs.set(node.id, { type: 'text', value });
      }
    }

    if (node.type === 'image') {
      const imageData = node.data as ImageNodeData;
      
      if (imageData.markupLayer && imageData.originalImage) {
        const promise = compositeImages(imageData.originalImage, imageData.markupLayer)
          .then((composited) => {
            resolvedOutputs.set(node.id, { 
              type: 'image', 
              base64: composited.base64, 
              mimeType: composited.mimeType 
            });
          })
          .catch((error) => {
            console.error('Failed to composite image with markup:', error);
            const parsed = parseDataUrl(imageData.image);
            if (parsed?.base64) {
              resolvedOutputs.set(node.id, { type: 'image', base64: parsed.base64, mimeType: parsed.mimeType });
            }
          });
        imageNodePromises.push(promise);
      } else {
        const parsed = parseDataUrl(imageData.image);
        if (parsed?.base64) {
          resolvedOutputs.set(node.id, { type: 'image', base64: parsed.base64, mimeType: parsed.mimeType });
        }
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
         const genImage = (node.data as any).generatedImage as string | undefined;
         const genImageUrl = (node.data as any).generatedImageUrl as string | undefined;
         if (genImage) {
            const parsed = parseDataUrl(genImage);
            if (parsed?.base64) {
                resolvedOutputs.set(node.id, { type: 'image', base64: parsed.base64, mimeType: parsed.mimeType, url: genImageUrl });
            }
         }
      } else if (isVideoGeneratorNodeType(node.type) || node.type === 'extendVideo') {
         const genVideo = ((node.data as any).generatedVideo as string | undefined) ?? ((node.data as any).generatedVideoUrl as string | undefined);
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

  if (imageNodePromises.length > 0) {
    await Promise.all(imageNodePromises);
  }

  const updateNodeStatus = (nodeId: string, status: 'running' | 'completed' | 'failed', error?: string) => {
    useStudioStore.getState().updateNodeData(nodeId, {
      isExecuting: status === 'running',
      isComplete: status === 'completed',
      error: error,
    });
    if (status !== 'running') {
      useStudioStore.getState().triggerSave();
    }
  };

  const setNodeOutput = (nodeId: string, output: NodeOutput) => {
    resolvedOutputs.set(nodeId, output);
    if (output.type === 'image') {
      const parsed = output.base64.startsWith("data:") ? parseDataUrl(output.base64) : null;
      const mimeType = parsed?.mimeType ?? output.mimeType;
      const base64 = (parsed?.base64 ?? output.base64).replace(/\s+/g, "");
      const dataUrl = buildDataUrl(mimeType, base64);
      const persistentUrl = output.url && !output.url.startsWith("data:") ? output.url : undefined;
      console.info("[studio] setting generatedImage", {
        nodeId,
        mimeType,
        base64Length: base64.length,
        hasUrl: Boolean(persistentUrl),
      });
      useStudioStore.getState().updateNodeData(nodeId, {
        generatedImage: dataUrl,
        generatedImageUrl: persistentUrl,
        isComplete: true,
        isExecuting: false
      });
      useStudioStore.getState().triggerSave();
      const updatedNode = useStudioStore.getState().nodes.find((node) => node.id === nodeId);
      console.info("[studio] generatedImage set", {
        nodeId,
        hasGeneratedImage: Boolean((updatedNode?.data as any)?.generatedImage),
        hasGeneratedImageUrl: Boolean((updatedNode?.data as any)?.generatedImageUrl),
        previewPrefix: typeof (updatedNode?.data as any)?.generatedImage === "string"
          ? (updatedNode?.data as any).generatedImage.slice(0, 48)
          : undefined,
      });
    } else if (output.type === 'video') {
      const persistentUrl = output.url && !output.url.startsWith("data:") ? output.url : undefined;
      useStudioStore.getState().updateNodeData(nodeId, {
        generatedVideo: output.url,
        generatedVideoUrl: persistentUrl,
        isComplete: true,
        isExecuting: false
      });
      useStudioStore.getState().triggerSave();
    } else if (output.type === 'text') {
      useStudioStore.getState().updateNodeData(nodeId, { 
        value: output.value,
        isComplete: true,
        isExecuting: false
      });
      useStudioStore.getState().triggerSave();
    }
  };

  async function executeNode(nodeId: string): Promise<boolean> {
    const node = nodeById.get(nodeId);
    if (!node) return false;

    updateNodeStatus(nodeId, 'running');

    try {
      const brandId = options.brandId || "default-brand";
      if (node.type === 'string') {
        const payload = await buildEnrichPayload(node, resolvedOutputs, nodes, edges, brandId);
        
        const hasExternalInputs = (payload?.context?.images?.length ?? 0) > 0 || !!payload?.context?.audio || (payload?.context?.documents?.length ?? 0) > 0 || !!payload?.context?.video;

        console.info("[studio] executeNode string", { nodeId, hasExternalInputs, promptLength: payload?.prompt?.length });

        if (typeof executeEnrichment !== 'function') {
             updateNodeStatus(nodeId, 'failed', "Enrichment execution unavailable");
             return false;
        }

        let hasReceivedPartialUpdate = false;

        const onPartialUpdate = (data: { delta: string }) => {
             if (!data.delta) return;
             const currentNodes = useStudioStore.getState().nodes;
             const node = currentNodes.find(n => n.id === nodeId);
             const currentVal = (node?.data as any).value || "";
             const nextValue = hasReceivedPartialUpdate ? `${currentVal}${data.delta}` : data.delta;
             hasReceivedPartialUpdate = true;
             useStudioStore.getState().updateNodeData(nodeId, { value: nextValue });
        };

        let result;
        if (!hasExternalInputs && payload?.prompt && payload.prompt.trim()) {
            console.info("[studio] triggering fast enrichment for node", nodeId);
            const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
            const supabase = createSupabaseBrowserClient();
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            console.info("[studio] using token for fast enrichment", token ? "present" : "missing");
            if (!token) {
                throw new Error("Authentication session required for prompt enrichment");
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/prompt-fast-enrich`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'apikey': process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify({ prompt: payload.prompt }),
            });

            if (!response.ok) {
                const err = await response.text();
                console.error("[studio] Fast enrichment HTTP error", response.status, err);
                updateNodeStatus(nodeId, 'failed', err || "Fast enrichment failed");
                return false;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                updateNodeStatus(nodeId, 'failed', "No response body");
                return false;
            }

            let accumulatedValue = "";
            let streamError: string | undefined;

            await readServerSentEvents({
              reader,
              onEvent: (eventName, data) => {
                const payloadText = data.trimStart();

                if (eventName === "delta" || eventName === "message") {
                  try {
                    const parsed = JSON.parse(payloadText) as { delta?: string };
                    if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
                      accumulatedValue += parsed.delta;
                      onPartialUpdate({ delta: parsed.delta });
                    }
                  } catch {
                    console.warn("[studio] failed to parse fast enrichment delta", {
                      nodeId,
                      eventName,
                      payloadPreview: payloadText.slice(0, 120),
                    });
                  }
                  return;
                }

                if (eventName === "error") {
                  try {
                    const parsed = JSON.parse(payloadText) as { message?: string; error?: string };
                    streamError = parsed.message || parsed.error || payloadText || "Fast enrichment failed";
                  } catch {
                    streamError = payloadText || "Fast enrichment failed";
                  }
                }
              },
            });

            if (streamError) {
                console.error("[studio] fast enrichment stream error", { nodeId, streamError });
                updateNodeStatus(nodeId, 'failed', streamError);
                return false;
            }

            if (!accumulatedValue.trim()) {
                console.error("[studio] fast enrichment stream completed without output", { nodeId });
                updateNodeStatus(nodeId, 'failed', "Fast enrichment returned empty output");
                return false;
            }

            setNodeOutput(nodeId, { type: 'text', value: accumulatedValue });
            updateNodeStatus(nodeId, 'completed');
            console.info("[studio] fast enrichment complete", { nodeId, length: accumulatedValue.length });
            return true;
        } else {
            if (!payload) {
                setNodeOutput(nodeId, { type: 'text', value: (node.data as any).value || "" });
                return true;
            }
            result = await executeEnrichment(nodeId, payload, onPartialUpdate);
        }
        
        if (result && !result.success) {
             console.error("Enrichment error", result.error);
             updateNodeStatus(nodeId, 'failed', result.error || "Enrichment failed");
             return false;
        }
        
        if (result?.output?.type === 'text') {
             setNodeOutput(nodeId, result.output);
             updateNodeStatus(nodeId, 'completed');
             console.info("[studio] standard enrichment complete", { nodeId });
             return true;
        }
        
        if (result?.success) {
             updateNodeStatus(nodeId, 'completed');
             return true;
        }
      }

      if (node.type === 'extendVideo') {
        const payload = buildExtendVideoPayload(node, resolvedOutputs, nodes, edges, brandId);

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
        payload = buildNanoGenPayload(node, resolvedOutputs, nodes, edges, brandId);
      } else if (isVideoGeneratorNodeType(node.type)) {
        payload = buildVeoPayload(node, resolvedOutputs, nodes, edges, brandId);
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
    executableNodeIds.filter(id => {
      if (options.targetNodeId === id) {
        console.info("[studio] forcing target node into pending", id);
        return true;
      }
      return !resolvedOutputs.has(id);
    })
  );
  console.info("[studio] pendingNodes initialized", Array.from(pendingNodes));
  const runningNodes = new Map<string, Promise<{ id: string; success: boolean }>>();

  while (pendingNodes.size > 0 || runningNodes.size > 0) {
    const readyNodes = Array.from(pendingNodes).filter((nodeId) => {
      const node = nodeById.get(nodeId);
      if (!node) return false;
      const readiness = getNodeReadiness(node, edges, resolvedOutputs, nodeById, failedNodes);
      console.info("[studio] checking readiness", { nodeId, type: node.type, ready: readiness.ready, reason: readiness.reason });
      return readiness.ready;
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
