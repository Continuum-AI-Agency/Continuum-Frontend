/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  Handle,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  useStore,
  type Connection,
  type Edge,
  BaseEdge,
  EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Collapsible from "@radix-ui/react-collapsible";
import { motion } from "framer-motion";
import { Badge, Button, Heading, Text, TextArea, Tabs } from "@radix-ui/themes";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  MagicWandIcon,
  PaperPlaneIcon,
  StackIcon,
  ImageIcon,
  VideoIcon,
  TextIcon,
  ChatBubbleIcon,
  MixIcon,
} from "@radix-ui/react-icons";

import { ZoomControls } from "@/components/ai-studio/canvas/ZoomControls";
import { ArrayNode, IteratorNode, ImageProcessorNode, LLMNode, CompositeNode } from "@/components/ai-studio/canvas";
import { useToast } from "@/components/ui/ToastProvider";
import { CreativeLibrarySidebar } from "@/components/creative-assets/CreativeLibrarySidebar";
import { BrandSwitcherMenu } from "@/components/navigation/BrandSwitcherMenu";
import { ChatSurface } from "@/components/ai-studio/chat/ChatSurface";
import { createAiStudioJob } from "@/lib/api/aiStudio";
import {
  createPromptTemplateAction,
  deletePromptTemplateAction,
  updatePromptTemplateAction,
} from "./actions";
import {
  providerAspectRatioOptions,
  type AiStudioJob,
  type AiStudioProvider,
} from "@/lib/schemas/aiStudio";
import {
  type ArrayNodeData,
  type AttachmentNodeData,
  type CompositeNodeData,
  type GeneratorNodeData,
  type ImageProcessorNodeData,
  type IteratorNodeData,
  type LLMNodeData,
  type ModelNodeData,
  type NegativeNodeData,
  type PreviewNodeData,
  type PromptNodeData,
  type StudioNode,
} from "@/lib/ai-studio/nodeTypes";
import { resolveGeneratorInputs } from "@/lib/ai-studio/inputResolution";
import { arePortsCompatible, getNodeOutputPortType } from "@/lib/ai-studio/portTypes";
import type {
  PromptTemplateCreateInput,
  PromptTemplateUpdateInput,
} from "@/lib/schemas/promptTemplates";

type AIStudioClientProps = {
  brandProfileId: string;
  brandName: string;
  promptTemplates?: import("@/lib/schemas/promptTemplates").PromptTemplate[];
};

const DRAG_MIME = "application/reactflow-node-data";

const JOB_STATUS_META: Record<
  AiStudioJob["status"],
  { label: string; color: "gray" | "amber" | "blue" | "green" | "red"; icon: React.ReactNode }
> = {
  queued: { label: "Queued", color: "amber", icon: <StackIcon /> },
  processing: { label: "Processing", color: "blue", icon: <MagicWandIcon /> },
  completed: { label: "Completed", color: "green", icon: <CheckIcon /> },
  failed: { label: "Failed", color: "red", icon: <ExclamationTriangleIcon /> },
  cancelled: { label: "Cancelled", color: "gray", icon: <ExclamationTriangleIcon /> },
};

const PromptNode = ({ id: nodeId, data, selected }: { id: string; data: PromptNodeData; selected: boolean }) => (
  <div className={`relative w-64 rounded-xl border ${selected ? "border-blue-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
    <Text className="text-gray-200">Prompt</Text>
    <TextArea
      value={data.prompt}
      onChange={(e) =>
        window.dispatchEvent(new CustomEvent("node:edit", { detail: { id: nodeId, field: "prompt", value: e.target.value } }))
      }
      placeholder="Describe the visual..."
      className="mt-2 h-28 bg-transparent text-white"
    />
    <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-blue-400" />
  </div>
);

const NegativeNode = ({ id: nodeId, data, selected }: { id: string; data: NegativeNodeData; selected: boolean }) => (
  <div className={`relative w-64 rounded-xl border ${selected ? "border-amber-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
    <Text className="text-gray-200">Negative Prompt</Text>
    <TextArea
      value={data.negativePrompt}
      onChange={(e) =>
        window.dispatchEvent(new CustomEvent("node:edit", { detail: { id: nodeId, field: "negativePrompt", value: e.target.value } }))
      }
      placeholder="What to avoid..."
      className="mt-2 h-28 bg-transparent text-white"
    />
    <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-amber-400" />
  </div>
);

const ModelNode = ({ id: nodeId, data, selected }: { id: string; data: ModelNodeData; selected: boolean }) => (
  <div className={`relative w-64 rounded-xl border ${selected ? "border-purple-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
    <Text className="text-gray-200">Model</Text>
    <select
      className="mt-2 w-full rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-sm text-white"
      value={data.provider}
      onChange={(e) =>
        window.dispatchEvent(new CustomEvent("node:edit", { detail: { id: nodeId, field: "provider", value: e.target.value as AiStudioProvider } }))
      }
    >
      <option value="nano-banana">Nano Banana</option>
      <option value="veo-3-1" disabled>
        Veo 3.1 (coming soon)
      </option>
      <option value="sora-2" disabled>
        Sora 2 (coming soon)
      </option>
    </select>
    <div className="mt-2 flex flex-wrap gap-1">
      {(providerAspectRatioOptions[data.provider]?.[data.medium] ?? ["1:1", "16:9"]).map((ratio) => (
        <Button
          key={ratio}
          size="1"
          variant={data.aspectRatio === ratio ? "solid" : "outline"}
          className="rounded-full"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("node:edit", { detail: { id: nodeId, field: "aspectRatio", value: ratio } }))
          }
        >
          {ratio}
        </Button>
      ))}
    </div>
    <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-purple-400" />
  </div>
);

const AttachmentNode = ({ data, selected }: { data: AttachmentNodeData; selected: boolean }) => (
  <div className={`relative w-56 rounded-xl border ${selected ? "border-blue-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-lg`}>
    <Text className="text-gray-200">Attachment</Text>
    <div className="mt-2 h-24 overflow-hidden rounded-lg border border-white/10 bg-black/40">
      {data.mimeType?.startsWith("video/") ? (
        <video src={data.previewUrl} muted loop className="h-full w-full object-cover" />
      ) : (
        <img src={data.previewUrl} alt={data.label} className="h-full w-full object-cover" />
      )}
    </div>
    <Text size="1" color="gray" className="mt-1 block truncate">
      {data.label}
    </Text>
    <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-purple-400" />
  </div>
);

const PreviewNode = ({ data, selected }: { data: PreviewNodeData; selected: boolean }) => (
  <div className={`relative w-[320px] rounded-2xl border ${selected ? "border-green-400" : "border-white/10"} bg-slate-900/90 p-3 shadow-xl`}>
    <Text className="text-gray-200">Preview</Text>
    <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/60 min-h-[220px] flex items-center justify-center">
      {data.artifactPreview ? (
        data.medium === "video" ? (
          <video src={data.artifactPreview} controls className="h-full w-full object-cover" />
        ) : (
          <img src={data.artifactPreview} alt={data.artifactName ?? "artifact"} className="h-full w-full object-cover" />
        )
      ) : (
        <Text color="gray" className="px-4 text-center">
          Connect a generator to see output.
        </Text>
      )}
    </div>
    <Handle type="target" position={Position.Left} className="h-3 w-3 !bg-green-400" />
  </div>
);

const GeneratorNode = ({ id, data, selected }: { id: string; data: GeneratorNodeData; selected: boolean }) => (
  <ContextMenu.Root>
    <ContextMenu.Trigger asChild>
      <div className={`relative w-96 max-w-md rounded-2xl border ${selected ? "border-blue-400 shadow-[0_0_0_2px_rgba(59,130,246,0.35)]" : "border-white/10"} bg-slate-900/95 p-3 shadow-xl`}>
        <div className="flex items-center justify-between">
          <Badge size="2" variant="soft">
            Nano Banana
          </Badge>
          <Badge size="1" variant="soft" color="purple">
            image
          </Badge>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {(providerAspectRatioOptions["nano-banana"]?.image ?? ["1:1", "16:9"]).map((ratio) => (
            <Button
              key={ratio}
              size="1"
              variant={data.aspectRatio === ratio ? "solid" : "outline"}
              className="rounded-full"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("node:edit", { detail: { id, field: "aspectRatio", value: ratio } }))
              }
            >
              {ratio}
            </Button>
          ))}
        </div>

        <TextArea
          value={data.prompt}
          onChange={(e) => window.dispatchEvent(new CustomEvent("node:edit", { detail: { id, field: "prompt", value: e.target.value } }))}
          placeholder="Prompt..."
          className="mt-2 min-h-[80px] bg-transparent text-white"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-300">
          <Badge size="1" variant="soft">
            {data.aspectRatio}
          </Badge>
          {data.referenceAssetPath ? <Badge size="1" variant="soft">ref</Badge> : null}
          {data.negativePrompt ? <Badge size="1" variant="soft" color="amber">neg</Badge> : null}
        </div>

        <div className="mt-3 flex items-center justify-between">
          {(() => {
            const meta = data.status ? JOB_STATUS_META[data.status as keyof typeof JOB_STATUS_META] : undefined;
            return (
              <Badge size="1" variant="surface" color={meta?.color ?? "gray"}>
                {data.status ?? "idle"}
              </Badge>
            );
          })()}
          <Button size="2" onClick={() => window.dispatchEvent(new CustomEvent("node:generate", { detail: { id } }))}>
            <PaperPlaneIcon /> Generate
          </Button>
        </div>

        <Handle type="target" id="prompt" position={Position.Left} className="h-3 w-3 !bg-blue-400" />
        <Handle type="target" id="ref" position={Position.Left} style={{ top: "60%" }} className="h-3 w-3 !bg-purple-400" />
        <Handle type="target" id="negative" position={Position.Top} className="h-3 w-3 !bg-amber-400" />
        <Handle type="source" position={Position.Right} className="h-3 w-3 !bg-green-400" />
      </div>
    </ContextMenu.Trigger>

    <ContextMenu.Content className="rounded-lg border border-white/10 bg-slate-900/95 p-2 text-sm text-white shadow-xl">
      <ContextMenu.Item onSelect={() => window.dispatchEvent(new CustomEvent("node:duplicate", { detail: { id } }))}>Duplicate</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => window.dispatchEvent(new CustomEvent("node:delete", { detail: { id } }))} className="text-red-300">
        Delete
      </ContextMenu.Item>
      <ContextMenu.Separator className="my-1 h-px bg-white/10" />
      <ContextMenu.Label className="text-gray-300">Advanced</ContextMenu.Label>
      <Collapsible.Root>
        <Collapsible.Trigger className="mt-1 w-full rounded-md px-1 py-1 text-left text-xs text-gray-300 hover:bg-white/5">Advanced</Collapsible.Trigger>
        <Collapsible.Content className="space-y-2 px-1 py-1">
          <div>
            <label className="text-xs text-gray-300">Negative prompt</label>
            <TextArea
              value={data.negativePrompt ?? ""}
              onChange={(e) => window.dispatchEvent(new CustomEvent("node:edit", { detail: { id, field: "negativePrompt", value: e.target.value } }))}
              className="mt-1 h-16 bg-slate-800 text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-300">Seed</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md bg-slate-800 border border-white/10 px-2 py-1 text-white"
                value={data.seed ?? ""}
                onChange={(e) =>
                  window.dispatchEvent(
                    new CustomEvent("node:edit", { detail: { id, field: "seed", value: e.target.value ? Number(e.target.value) : undefined } })
                  )
                }
              />
            </div>
            <div>
              <label className="text-xs text-gray-300">Guidance</label>
              <input
                type="number"
                step="0.5"
                min={0}
                max={20}
                className="mt-1 w-full rounded-md bg-slate-800 border border-white/10 px-2 py-1 text-white"
                value={data.guidanceScale ?? ""}
                onChange={(e) =>
                  window.dispatchEvent(
                    new CustomEvent("node:edit", { detail: { id, field: "guidanceScale", value: e.target.value ? Number(e.target.value) : undefined } })
                  )
                }
              />
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </ContextMenu.Content>
  </ContextMenu.Root>
);

const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  source,
  target,
  style = {},
  markerEnd,
}: EdgeProps) => {
  const nodes = useStore((state) => state.nodes);
  const sourceNode = nodes.find((n: any) => n.id === source);
  const isActive = sourceNode?.data?.status === 'processing' || sourceNode?.data?.status === 'queued';

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Bottom,
    targetX,
    targetY,
    targetPosition: Position.Top,
  });

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isActive ? '#10b981' : '#94a3b8',
          strokeWidth: isActive ? 3 : 2,
          filter: isActive ? 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.6))' : undefined,
        }}
      />
    </>
  );
};

const edgeTypes = {
  default: CustomEdge,
};

const nodeTypes = {
  prompt: PromptNode,
  negative: NegativeNode,
  model: ModelNode,
  attachment: AttachmentNode,
  generator: GeneratorNode,
  preview: PreviewNode,
  array: ArrayNode,
  iterator: IteratorNode,
  imageProcessor: ImageProcessorNode,
  llm: LLMNode,
  composite: CompositeNode,
};

type PaletteType = "prompt" | "negative" | "model" | "attachment" | "array" | "iterator" | "imageProcessor" | "llm" | "composite" | "generator" | "preview";

type PaletteItem = {
  id: string;
  label: string;
  type: PaletteType;
  icon: React.ReactNode;
  data:
    | Partial<GeneratorNodeData>
    | Partial<PromptNodeData>
    | Partial<AttachmentNodeData>
    | Partial<ModelNodeData>
    | Partial<NegativeNodeData>
    | Partial<PreviewNodeData>
    | Partial<ArrayNodeData>
    | Partial<IteratorNodeData>
    | Partial<ImageProcessorNodeData>
    | Partial<LLMNodeData>
    | Partial<CompositeNodeData>;
  disabled?: boolean;
};

const paletteItems: PaletteItem[] = [
  { id: "palette-prompt", label: "Prompt", type: "prompt", icon: <TextIcon />, data: { prompt: "" } },
  { id: "palette-negative", label: "Negative", type: "negative", icon: <TextIcon />, data: { negativePrompt: "" } },
  { id: "palette-model", label: "Model", type: "model", icon: <ImageIcon />, data: { provider: "nano-banana", medium: "image", aspectRatio: "1:1" } },
  { id: "palette-attachment", label: "Reference Image", type: "attachment", icon: <ImageIcon />, data: { label: "Ref", path: "", mimeType: "image/png", previewUrl: "" } },
  { id: "palette-array", label: "Array", type: "array", icon: <StackIcon />, data: { items: [] } },
  { id: "palette-iterator", label: "Iterator", type: "iterator", icon: <MagicWandIcon />, data: { arrayId: undefined, currentIndex: 0, totalItems: 0 } },
  { id: "palette-image-processor", label: "Image Processor", type: "imageProcessor", icon: <ImageIcon />, data: { operation: "inpainting", prompt: "", strength: 0.5 } },
  { id: "palette-llm", label: "LLM Generator", type: "llm", icon: <ChatBubbleIcon />, data: { provider: "openai", model: "gpt-4", userPrompt: "", temperature: 0.7, maxTokens: 500 } },
  { id: "palette-composite", label: "Composite", type: "composite", icon: <MixIcon />, data: { operation: "text-overlay", textContent: "", textPosition: "center", fontSize: 32, fontColor: "#ffffff" } },
  { id: "palette-image-gen", label: "Image Generator", type: "generator", icon: <ImageIcon />, data: { provider: "nano-banana", medium: "image", prompt: "", aspectRatio: "1:1" } },
  { id: "palette-video-veo", label: "Video Gen (Veo 3.1)", type: "generator", icon: <VideoIcon />, data: { provider: "veo-3-1", medium: "video", prompt: "", aspectRatio: "16:9" }, disabled: true },
  { id: "palette-video-sora", label: "Video Gen (Sora 2)", type: "generator", icon: <VideoIcon />, data: { provider: "sora-2", medium: "video", prompt: "", aspectRatio: "16:9" }, disabled: true },
  { id: "palette-preview", label: "Preview", type: "preview", icon: <ImageIcon />, data: { artifactPreview: "", medium: "image" } },
];

export default function AIStudioClient({
  brandProfileId,
  brandName,
  promptTemplates,
}: AIStudioClientProps) {
  const { show: showToast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [activeTab, setActiveTab] = React.useState<"chat" | "canvas">("chat");
  const [templates, setTemplates] = React.useState(promptTemplates ?? []);
  const [templatesLoading, setTemplatesLoading] = React.useState(false);
  const [canvasOverlay, setCanvasOverlay] = React.useState(false);
  const [toolboxPos, setToolboxPos] = React.useState({ x: 96, y: 140 });
  const reactFlowInstanceRef = React.useRef<any>(null);

  const onReactFlowInit = React.useCallback((instance: any) => {
    reactFlowInstanceRef.current = instance;
  }, []);

  const handleZoomIn = () => {
    (reactFlowInstanceRef.current as any)?.zoomIn?.({ duration: 300 });
  };

  const handleZoomOut = () => {
    (reactFlowInstanceRef.current as any)?.zoomOut?.({ duration: 300 });
  };

  const handleFitView = () => {
    (reactFlowInstanceRef.current as any)?.fitView?.({ padding: 0.1, duration: 300 });
  };

  const handleCreateTemplate = React.useCallback(
    async (input: Omit<PromptTemplateCreateInput, "brandProfileId">) => {
      setTemplatesLoading(true);
      try {
        const created = await createPromptTemplateAction({
          brandProfileId,
          name: input.name,
          prompt: input.prompt,
          category: input.category,
        });
        setTemplates((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        showToast({ title: "Template saved", variant: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save template";
        showToast({ title: "Save failed", description: message, variant: "error" });
        throw error;
      } finally {
        setTemplatesLoading(false);
      }
    },
    [brandProfileId, showToast]
  );

  const handleUpdateTemplate = React.useCallback(
    async (input: PromptTemplateUpdateInput) => {
      setTemplatesLoading(true);
      try {
        const updated = await updatePromptTemplateAction(input);
        setTemplates((prev) => [updated, ...prev.filter((item) => item.id !== updated.id)]);
        showToast({ title: "Template updated", variant: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update template";
        showToast({ title: "Update failed", description: message, variant: "error" });
        throw error;
      } finally {
        setTemplatesLoading(false);
      }
    },
    [showToast]
  );

  const handleDeleteTemplate = React.useCallback(
    async (id: string) => {
      setTemplatesLoading(true);
      try {
        await deletePromptTemplateAction(id);
        setTemplates((prev) => prev.filter((item) => item.id !== id));
        showToast({ title: "Template deleted", variant: "success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to delete template";
        showToast({ title: "Delete failed", description: message, variant: "error" });
        throw error;
      } finally {
        setTemplatesLoading(false);
      }
    },
    [showToast]
  );

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      setCanvasOverlay(host !== "localhost" && host !== "127.0.0.1");
    }
  }, []);

  React.useEffect(() => {
    const nodesSeed: StudioNode[] = [
      { id: "model-1", type: "model", position: { x: 120, y: 120 }, data: { provider: "nano-banana", medium: "image", aspectRatio: "1:1" } },
      { id: "prompt-1", type: "prompt", position: { x: 120, y: 280 }, data: { prompt: "" } },
      { id: "neg-1", type: "negative", position: { x: 120, y: 440 }, data: { negativePrompt: "" } },
      { id: "gen-1", type: "generator", position: { x: 420, y: 260 }, data: { provider: "nano-banana", medium: "image", prompt: "", aspectRatio: "1:1" } },
      { id: "preview-1", type: "preview", position: { x: 720, y: 240 }, data: { artifactPreview: "", medium: "image" } },
    ];
    setNodes(nodesSeed);
    setEdges([
      { id: "e-model-gen", source: "model-1", target: "gen-1", targetHandle: "model", type: "default" },
      { id: "e-prompt-gen", source: "prompt-1", target: "gen-1", targetHandle: "prompt", type: "default" },
      { id: "e-neg-gen", source: "neg-1", target: "gen-1", targetHandle: "negative", type: "default" },
      { id: "e-gen-preview", source: "gen-1", target: "preview-1", type: "default" },
    ]);
  }, [setNodes, setEdges]);

  const updateNodeField = React.useCallback(
    (id: string, field: string, value: unknown) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                data: { ...(n.data as Record<string, unknown>), [field]: value },
              }
            : n
        )
      );
    },
    [setNodes]
  );

  React.useEffect(() => {
    const onEdit = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string; field: string; value: unknown };
      updateNodeField(detail.id, detail.field, detail.value);
    };
    const onGenerate = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string };
      const node = nodes.find((n) => n.id === detail.id && n.type === "generator");
      if (!node) return;

      const resolved = resolveGeneratorInputs(detail.id, nodes, edges);
      if (!resolved.prompt || !resolved.aspectRatio) {
        showToast({ title: "Missing fields", description: "Prompt and aspect ratio required", variant: "error" });
        return;
      }
      try {
        updateNodeField(node.id, "status", "queued");
        const generatorData = node.data as GeneratorNodeData;
        const payload = {
          brandProfileId,
          provider: resolved.provider,
          medium: generatorData.medium,
          prompt: resolved.prompt,
          aspectRatio: resolved.aspectRatio,
          negativePrompt: resolved.negativePrompt,
          guidanceScale: generatorData.guidanceScale || undefined,
          seed: generatorData.seed || undefined,
          metadata: {
            referenceAssetPath: resolved.refs.length > 0 ? resolved.refs[0].path : undefined,
            firstFramePath: resolved.firstFrame?.path,
            lastFramePath: resolved.lastFrame?.path,
          },
        };
        const job = await createAiStudioJob(payload);
        setNodes((prev) =>
          prev.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  data: {
                    ...(n.data as GeneratorNodeData),
                    jobId: job.id,
                    status: job.status,
                    artifactPreview: job.artifacts[0]?.previewUri ?? job.artifacts[0]?.uri,
                    artifactName: job.artifacts[0]?.fileName,
                  },
                }
              : n
          )
        );
        showToast({ title: "Generation started", description: JOB_STATUS_META[job.status].label, variant: "success" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start job";
        showToast({ title: "Generation failed", description: message, variant: "error" });
        updateNodeField(node.id, "status", "failed");
      }
    };
    const onDuplicate = (e: Event) => {
      const { id } = (e as CustomEvent).detail as { id: string };
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      const dup: StudioNode = {
        ...node,
        id: `${node.id}-copy-${crypto.randomUUID().slice(0, 4)}`,
        position: { x: node.position.x + 60, y: node.position.y + 60 },
        selected: false,
      };
      setNodes((prev) => prev.concat(dup));
    };
    const onDelete = (e: Event) => {
      const { id } = (e as CustomEvent).detail as { id: string };
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setEdges((prev) => prev.filter((edge) => edge.source !== id && edge.target !== id));
    };

    const onIterate = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string };
      const iteratorNode = nodes.find((n) => n.id === detail.id && n.type === "iterator");
      if (!iteratorNode) return;

      const arrayEdge = edges.find((edge) => edge.target === detail.id && edge.targetHandle === "array");
      if (!arrayEdge) {
        showToast({ title: "No array connected", description: "Connect an Array node to iterate over", variant: "error" });
        return;
      }

      const arrayNode = nodes.find((n) => n.id === arrayEdge.source && n.type === "array");
      if (!arrayNode) return;

      const arrayData = arrayNode.data as ArrayNodeData;
      const iteratorData = iteratorNode.data as IteratorNodeData;

      const currentIndex = iteratorData.currentIndex ?? 0;
      if (currentIndex >= arrayData.items.length) {
        showToast({ title: "Iteration complete", description: "All items processed", variant: "success" });
        return;
      }

      const newIndex = currentIndex + 1;
      updateNodeField(iteratorNode.id, "currentIndex", newIndex);
      updateNodeField(iteratorNode.id, "totalItems", arrayData.items.length);
      updateNodeField(iteratorNode.id, "arrayId", arrayNode.id);

      showToast({ title: "Iterating", description: `Processing item ${newIndex}/${arrayData.items.length}`, variant: "info" });
    };

    const onResetIterator = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string };
      updateNodeField(detail.id, "currentIndex", 0);
      updateNodeField(detail.id, "totalItems", 0);
      updateNodeField(detail.id, "arrayId", undefined);
      showToast({ title: "Iterator reset", variant: "info" });
    };

    const onProcess = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string };
      const processorNode = nodes.find((n) => n.id === detail.id && n.type === "imageProcessor");
      if (!processorNode) return;

      const processorData = processorNode.data as ImageProcessorNodeData;
      if (!processorData.prompt && processorData.operation !== "relighting") {
        showToast({ title: "Missing prompt", description: "Prompt required for this operation", variant: "error" });
        return;
      }

      try {
        updateNodeField(processorNode.id, "status", "processing");
        // For now, simulate processing - in real implementation, call image processing API
        setTimeout(() => {
          updateNodeField(processorNode.id, "status", "completed");
          updateNodeField(processorNode.id, "outputImage", "processed-image.png");
          updateNodeField(processorNode.id, "outputName", "processed.png");
          showToast({ title: "Processing complete", variant: "success" });
        }, 2000);
        showToast({ title: "Processing started", variant: "info" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to process image";
        showToast({ title: "Processing failed", description: message, variant: "error" });
        updateNodeField(processorNode.id, "status", "failed");
      }
    };

    const onGenerateText = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string };
      const llmNode = nodes.find((n) => n.id === detail.id && n.type === "llm");
      if (!llmNode) return;

      const llmData = llmNode.data as LLMNodeData;
      if (!llmData.userPrompt) {
        showToast({ title: "Missing prompt", description: "User prompt required", variant: "error" });
        return;
      }

      try {
        updateNodeField(llmNode.id, "status", "processing");
        // For now, simulate LLM generation - in real implementation, call LLM API
        setTimeout(() => {
          const mockText = `Generated creative prompt: ${llmData.userPrompt} - Enhanced with artistic details, vibrant colors, and dramatic lighting.`;
          updateNodeField(llmNode.id, "status", "completed");
          updateNodeField(llmNode.id, "generatedText", mockText);
          showToast({ title: "Text generated", variant: "success" });
        }, 1500);
        showToast({ title: "Generating text", variant: "info" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate text";
        showToast({ title: "Generation failed", description: message, variant: "error" });
        updateNodeField(llmNode.id, "status", "failed");
      }
    };

    const onComposite = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string };
      const compositeNode = nodes.find((n) => n.id === detail.id && n.type === "composite");
      if (!compositeNode) return;

      const compositeData = compositeNode.data as CompositeNodeData;
      if (compositeData.operation === "text-overlay" && !compositeData.textContent) {
        showToast({ title: "Missing text", description: "Text content required for overlay", variant: "error" });
        return;
      }

      try {
        updateNodeField(compositeNode.id, "status", "processing");
        // For now, simulate compositing - in real implementation, call image compositing API
        setTimeout(() => {
          updateNodeField(compositeNode.id, "status", "completed");
          updateNodeField(compositeNode.id, "outputImage", "composite-image.png");
          updateNodeField(compositeNode.id, "outputName", "composite.png");
          showToast({ title: "Compositing complete", variant: "success" });
        }, 2000);
        showToast({ title: "Compositing started", variant: "info" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to composite";
        showToast({ title: "Compositing failed", description: message, variant: "error" });
        updateNodeField(compositeNode.id, "status", "failed");
      }
    };

    window.addEventListener("node:edit", onEdit);
    window.addEventListener("node:generate", onGenerate);
    window.addEventListener("node:duplicate", onDuplicate);
    window.addEventListener("node:delete", onDelete);
    window.addEventListener("node:iterate", onIterate);
    window.addEventListener("node:reset-iterator", onResetIterator);
    window.addEventListener("node:process", onProcess);
    window.addEventListener("node:generate-text", onGenerateText);
    window.addEventListener("node:composite", onComposite);
    return () => {
      window.removeEventListener("node:edit", onEdit);
      window.removeEventListener("node:generate", onGenerate);
      window.removeEventListener("node:duplicate", onDuplicate);
      window.removeEventListener("node:delete", onDelete);
      window.removeEventListener("node:iterate", onIterate);
      window.removeEventListener("node:reset-iterator", onResetIterator);
      window.removeEventListener("node:process", onProcess);
      window.removeEventListener("node:generate-text", onGenerateText);
      window.removeEventListener("node:composite", onComposite);
    };
  }, [nodes, brandProfileId, setNodes, setEdges, showToast, updateNodeField]);

  const handleCanvasDrop = React.useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const position = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };

      const payloadRaw = event.dataTransfer.getData(DRAG_MIME);
      if (payloadRaw) {
        try {
          const parsed = JSON.parse(payloadRaw) as {
            type?: string;
            payload?: {
              path?: string;
              publicUrl?: string;
              mimeType?: string;
              id?: string;
              nodeType?: StudioNode["type"];
              data?: unknown;
            };
          };
          if (parsed.type === "asset_drop" && parsed.payload?.path) {
            const mime = parsed.payload.mimeType ?? "image/png";
            const previewUrl = parsed.payload.publicUrl ?? parsed.payload.path;
            const attachmentNode: StudioNode = {
              id: `att-${crypto.randomUUID()}`,
              type: "attachment",
              position,
              data: {
                label: parsed.payload.path.split("/").pop() ?? parsed.payload.path,
                path: parsed.payload.path,
                mimeType: mime,
                previewUrl,
              },
            };
            setNodes((prev) => prev.concat(attachmentNode));
            showToast({ title: "Attachment node created. Connect it to a generator.", variant: "success" });
            return;
          }
          if (parsed.type === "palette") {
            const newNode: StudioNode = {
              id: `${parsed.payload?.id ?? "node"}-${crypto.randomUUID().slice(0, 6)}`,
              type: (parsed.payload?.nodeType as StudioNode["type"]) ?? "prompt",
              position,
              data: parsed.payload?.data ?? {},
            };
            setNodes((prev) => prev.concat(newNode));
            return;
          }
        } catch (err) {
          console.error("parse drop payload failed", err);
        }
      }
    },
    [setNodes, showToast]
  );

  const handleConnect = React.useCallback(
    (params: Edge | Connection) => {
      // Validate connection compatibility
      const sourceNode = nodes.find(n => n.id === params.source);
      const targetHandleType = params.targetHandle || undefined;
      if (sourceNode) {
        const sourcePortType = getNodeOutputPortType(sourceNode);
        if (sourcePortType && !arePortsCompatible(sourcePortType, targetHandleType)) {
          showToast({
            title: "Incompatible connection",
            description: "This connection type is not supported",
            variant: "error"
          });
          return;
        }
      }
      setEdges((eds) => addEdge({ ...params, type: "default" }, eds));
    },
    [nodes, setEdges, showToast]
  );

  return (
    <div className="fixed inset-x-0 top-0 h-screen h-[100dvh] md:left-[var(--app-sidebar-width,88px)] isolate flex flex-col overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(59,130,246,0.15),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(10,12,24,0.95) 0%,rgba(10,12,24,0.98) 50%,rgba(7,9,18,1) 100%)]" />

      <main className="relative z-[1] flex flex-1 flex-col gap-3 px-6 sm:px-10 md:px-16 pt-4 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <Heading size="7" className="text-white">AI Studio</Heading>
            <Text color="gray">Build flows for {brandName}</Text>
          </div>
          <div className="flex items-center gap-3">
            <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as "chat" | "canvas")} activationMode="manual">
              <Tabs.List>
                <Tabs.Trigger value="chat">Chat</Tabs.Trigger>
                <Tabs.Trigger value="canvas">Canvas</Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
            <BrandSwitcherMenu />
          </div>
        </div>

        {activeTab === "chat" ? (
          <div className="flex-1 min-h-0">
            <ChatSurface
              brandProfileId={brandProfileId}
              brandName={brandName}
              promptTemplates={templates}
              templatesLoading={templatesLoading}
              onCreatePromptTemplate={handleCreateTemplate}
              onUpdatePromptTemplate={handleUpdateTemplate}
              onDeletePromptTemplate={handleDeleteTemplate}
            />
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Text color="gray">Build flows for {brandName}</Text>
              </div>
            </header>

            <motion.div
              className="pointer-events-auto fixed z-40 flex w-40 flex-col gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-2 shadow-xl"
              drag
              dragMomentum={false}
              dragElastic={0.12}
              initial={toolboxPos}
              onDragEnd={(_, info) => setToolboxPos({ x: info.point.x, y: info.point.y })}
            >
              <Text size="2" className="px-2 text-gray-200">
                Tools
              </Text>
              {paletteItems.map((item) => (
                <button
                  key={item.id}
                  draggable={!item.disabled}
                  onDragStart={(e) => {
                    if (item.disabled) {
                      e.preventDefault();
                      showToast({ title: "Coming soon", description: "Video nodes will be enabled next.", variant: "warning" });
                      return;
                    }
                    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ type: "palette", payload: { id: item.id, nodeType: item.type, data: item.data } }));
                  }}
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                    item.disabled ? "text-gray-500 opacity-60 cursor-not-allowed" : "text-gray-100 hover:bg-white/10"
                  }`}
                >
                  <span className="text-gray-300">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </motion.div>

            <div className="relative flex-1 min-h-0 overflow-hidden">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                onDrop={handleCanvasDrop}
                onDragOver={(e) => e.preventDefault()}
                proOptions={{ hideAttribution: true }}
                style={{ width: "100%", height: "100%" }}
              >
                 <Background />
               </ReactFlow>
              {canvasOverlay ? (
                <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur">
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/95 px-6 py-5 text-center shadow-2xl">
                    <Text size="4" weight="bold" className="text-white">Graph-based image generation coming soon</Text>
                    <Text color="gray" className="mt-1">Switch to localhost to build flows, or stay tuned for release.</Text>
                    <Button size="2" onClick={() => setCanvasOverlay(false)}>Dismiss</Button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </main>

      <CreativeLibrarySidebar brandProfileId={brandProfileId} />
    </div>
  );
}
