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
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Collapsible from "@radix-ui/react-collapsible";
import { motion } from "framer-motion";
import { Badge, Button, Callout, Heading, Text, TextArea, Tabs } from "@radix-ui/themes";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  MagicWandIcon,
  PaperPlaneIcon,
  ReloadIcon,
  StackIcon,
  ImageIcon,
  VideoIcon,
  TextIcon,
} from "@radix-ui/react-icons";

import { useToast } from "@/components/ui/ToastProvider";
import { CreativeLibrarySidebar } from "@/components/creative-assets/CreativeLibrarySidebar";
import { BrandSwitcherPill } from "@/components/navigation/BrandSwitcherPill";
import { ChatSurface } from "@/components/ai-studio/chat/ChatSurface";
import { createAiStudioJob, getAiStudioJob } from "@/lib/api/aiStudio";
import {
  providerAspectRatioOptions,
  type AiStudioJob,
  type AiStudioProvider,
  type AiStudioTemplate,
} from "@/lib/schemas/aiStudio";
import {
  type AttachmentNodeData,
  type GeneratorNodeData,
  type ModelNodeData,
  type NegativeNodeData,
  type PreviewNodeData,
  type PromptNodeData,
  type StudioNode,
} from "@/lib/ai-studio/nodeTypes";

type AIStudioClientProps = {
  brandProfileId: string;
  brandName: string;
  initialTemplates: AiStudioTemplate[];
  initialJobs: AiStudioJob[];
  loadErrors?: {
    templates?: string;
    jobs?: string;
  };
};

type LoadErrorMap = NonNullable<AIStudioClientProps["loadErrors"]>;

const DRAG_MIME = "application/reactflow-node-data";
const PENDING_STATUSES = new Set<AiStudioJob["status"]>(["queued", "processing"]);

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
      {data.mimeType.startsWith("video/") ? (
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
          <Badge size="1" variant="surface" color={data.status ? JOB_STATUS_META[data.status].color : "gray"}>
            {data.status ?? "idle"}
          </Badge>
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

const nodeTypes = {
  prompt: PromptNode,
  negative: NegativeNode,
  model: ModelNode,
  attachment: AttachmentNode,
  generator: GeneratorNode,
  preview: PreviewNode,
};

type PaletteType = "prompt" | "negative" | "model" | "attachment" | "generator" | "preview";

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
    | Partial<PreviewNodeData>;
  disabled?: boolean;
};

const paletteItems: PaletteItem[] = [
  { id: "palette-prompt", label: "Prompt", type: "prompt", icon: <TextIcon />, data: { prompt: "" } },
  { id: "palette-negative", label: "Negative", type: "negative", icon: <TextIcon />, data: { negativePrompt: "" } },
  { id: "palette-model", label: "Model", type: "model", icon: <ImageIcon />, data: { provider: "nano-banana", medium: "image", aspectRatio: "1:1" } },
  { id: "palette-attachment", label: "Reference Image", type: "attachment", icon: <ImageIcon />, data: { label: "Ref", path: "", mimeType: "image/png", previewUrl: "" } },
  { id: "palette-image-gen", label: "Image Generator", type: "generator", icon: <ImageIcon />, data: { provider: "nano-banana", medium: "image", prompt: "", aspectRatio: "1:1" } },
  { id: "palette-video-veo", label: "Video Gen (Veo 3.1)", type: "generator", icon: <VideoIcon />, data: { provider: "veo-3-1", medium: "video", prompt: "", aspectRatio: "16:9" }, disabled: true },
  { id: "palette-video-sora", label: "Video Gen (Sora 2)", type: "generator", icon: <VideoIcon />, data: { provider: "sora-2", medium: "video", prompt: "", aspectRatio: "16:9" }, disabled: true },
  { id: "palette-preview", label: "Preview", type: "preview", icon: <ImageIcon />, data: { artifactPreview: "", medium: "image" } },
];

export default function AIStudioClient({
  brandProfileId,
  brandName,
  initialTemplates: _initialTemplates,
  initialJobs,
  loadErrors: initialLoadErrors,
}: AIStudioClientProps) {
  const { show: showToast } = useToast();
  void _initialTemplates;

  const [loadErrors, setLoadErrors] = React.useState<LoadErrorMap>(() => initialLoadErrors ?? {});
  const [jobs, setJobs] = React.useState(() => initialJobs);
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioNode[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"chat" | "canvas">("chat");
  const [canvasOverlay, setCanvasOverlay] = React.useState(false);
  const [toolboxPos, setToolboxPos] = React.useState({ x: 96, y: 140 });

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

  React.useEffect(() => {
    const activeJobs = jobs.filter((job) => PENDING_STATUSES.has(job.status));
    if (activeJobs.length === 0) return;
    let cancelled = false;
    async function poll() {
      for (const job of activeJobs) {
        try {
          const updated = await getAiStudioJob(job.id, brandProfileId);
          if (!cancelled) {
            setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
            setNodes((prev) =>
              prev.map((n) =>
                (n.data as GeneratorNodeData).jobId === updated.id
                  ? {
                      ...n,
                      data: {
                        ...(n.data as GeneratorNodeData),
                        status: updated.status,
                        artifactPreview: updated.artifacts[0]?.previewUri ?? updated.artifacts[0]?.uri,
                        artifactName: updated.artifacts[0]?.fileName,
                      },
                    }
                  : n
              )
            );
          }
        } catch (err) {
          console.error("Failed to poll job", err);
        }
      }
    }
    const interval = window.setInterval(poll, 6000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobs, brandProfileId, setNodes]);

  const handleRefreshJobs = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Simple refresh: refetch active jobs only
      const activeIds = jobs.filter((j) => PENDING_STATUSES.has(j.status)).map((j) => j.id);
      const refreshed: AiStudioJob[] = [];
      for (const id of activeIds) {
        refreshed.push(await getAiStudioJob(id, brandProfileId));
      }
      if (refreshed.length > 0) {
        setJobs((prev) =>
          prev.map((j) => {
            const found = refreshed.find((r) => r.id === j.id);
            return found ?? j;
          })
        );
      }
      showToast({ title: "Job list refreshed", variant: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      showToast({ title: "Unable to refresh jobs", description: message, variant: "error" });
      setLoadErrors((current) => ({ ...current, jobs: message ?? "Unable to refresh jobs." }));
    } finally {
      setIsRefreshing(false);
    }
  }, [brandProfileId, jobs, showToast]);

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
      const data = node.data as GeneratorNodeData;
      if (!data.prompt || !data.aspectRatio) {
        showToast({ title: "Missing fields", description: "Prompt and aspect ratio required", variant: "error" });
        return;
      }
      try {
        updateNodeField(node.id, "status", "queued");
        const payload = {
          brandProfileId,
          provider: data.provider,
          medium: data.medium,
          prompt: data.prompt,
          aspectRatio: data.aspectRatio,
          negativePrompt: data.negativePrompt || undefined,
          guidanceScale: data.guidanceScale || undefined,
          seed: data.seed || undefined,
          metadata: {
            referenceAssetPath: data.referenceAssetPath,
          },
        };
        const job = await createAiStudioJob(payload);
        setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
        setNodes((prev) =>
          prev.map((n) =>
            n.id === node.id ? { ...n, data: { ...(n.data as GeneratorNodeData), jobId: job.id, status: job.status } } : n
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

    window.addEventListener("node:edit", onEdit);
    window.addEventListener("node:generate", onGenerate);
    window.addEventListener("node:duplicate", onDuplicate);
    window.addEventListener("node:delete", onDelete);
    return () => {
      window.removeEventListener("node:edit", onEdit);
      window.removeEventListener("node:generate", onGenerate);
      window.removeEventListener("node:duplicate", onDuplicate);
      window.removeEventListener("node:delete", onDelete);
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
    (params: Edge | Connection) => setEdges((eds) => addEdge({ ...params, type: "default" }, eds)),
    [setEdges]
  );

  const pendingCount = React.useMemo(() => jobs.filter((j) => PENDING_STATUSES.has(j.status)).length, [jobs]);

  return (
    <div className="fixed inset-0 isolate flex flex-col overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(59,130,246,0.15),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.12),transparent_32%),linear-gradient(180deg,rgba(10,12,24,0.95) 0%,rgba(10,12,24,0.98) 50%,rgba(7,9,18,1) 100%)]" />

      <main className="relative z-[1] flex flex-1 flex-col gap-3 px-6 sm:px-10 md:px-16 pt-4 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <Heading size="7" className="text-white">AI Studio</Heading>
            <Text color="gray">Build flows for {brandName}</Text>
          </div>
          <div className="flex items-center gap-3">
            <Tabs.Root value={activeTab} onValueChange={(v) => setActiveTab(v as "chat" | "canvas")}>
              <Tabs.List>
                <Tabs.Trigger value="chat">Chat</Tabs.Trigger>
                <Tabs.Trigger value="canvas">Canvas</Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
            <BrandSwitcherPill />
            <Button size="2" variant="ghost" onClick={handleRefreshJobs} disabled={isRefreshing}>
              <ReloadIcon /> Refresh
            </Button>
          </div>
        </div>

        {activeTab === "chat" ? (
          <div className="flex-1 min-h-0">
            <ChatSurface brandProfileId={brandProfileId} brandName={brandName} />
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Text color="gray">Build flows for {brandName}</Text>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Badge color={pendingCount > 0 ? "amber" : "green"} size="2">
                  {pendingCount > 0 ? `${pendingCount} in queue` : "Idle"}
                </Badge>
                <Button variant="ghost" size="2" onClick={handleRefreshJobs} disabled={isRefreshing}>
                  <ReloadIcon /> Refresh
                </Button>
              </div>
            </header>

            {loadErrors && (loadErrors.templates || loadErrors.jobs) ? (
              <Callout.Root color="red" variant="surface">
                <Callout.Icon>
                  <ExclamationTriangleIcon />
                </Callout.Icon>
                <Callout.Text>
                  {loadErrors.templates ? `Templates: ${loadErrors.templates}` : ""}
                  {loadErrors.jobs ? ` Jobs: ${loadErrors.jobs}` : ""}
                </Callout.Text>
              </Callout.Root>
            ) : null}

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
                      showToast({ title: "Coming soon", description: "Video nodes will be enabled next.", variant: "info" });
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
                fitView
                onDrop={handleCanvasDrop}
                onDragOver={(e) => e.preventDefault()}
                proOptions={{ hideAttribution: true }}
                style={{ width: "100%", height: "100%" }}
              >
                <Background />
                <MiniMap />
                <Controls />
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
