"use client";

import React from "react";
import { Card, ScrollArea, Text, Flex, Badge } from "@radix-ui/themes";
import Image from "next/image";

import { useToast } from "@/components/ui/ToastProvider";
import { useImageSseStream } from "@/hooks/useImageSseStream";
import { chatImageRequestSchema, getAspectsForModel, getMediumForModel } from "@/lib/schemas/chatImageRequest";
import { IMAGE_REFERENCE_MAX_BYTES, VIDEO_REFERENCE_MAX_BYTES, estimateBase64DecodedBytes, formatMiB } from "@/lib/ai-studio/referenceDrop";
import type {
  ChatImageHistoryItem,
  ChatImageRequestPayload,
  RefImage,
  RefVideo,
  SupportedModel,
  SupportedBackendModel,
  BackendChatImageRequestPayload,
} from "@/lib/types/chatImage";
import { getApiUrl } from "@/lib/api/config";
import type {
  PromptTemplate,
  PromptTemplateCreateInput,
  PromptTemplateUpdateInput,
} from "@/lib/schemas/promptTemplates";

import { ChatPanel } from "./ChatPanel";
import { PreviewPane } from "./PreviewPane";
import { ReferenceDock } from "./ReferenceDock";
import { ImageMarkupDialog } from "@/components/ai-studio/markup/ImageMarkupDialog";

type ChatSurfaceProps = {
  brandProfileId: string;
  brandName: string;
  initialHistory?: ChatImageHistoryItem[];
  promptTemplates?: PromptTemplate[];
  templatesLoading?: boolean;
  onCreatePromptTemplate?: (input: Omit<PromptTemplateCreateInput, "brandProfileId">) => Promise<void>;
  onUpdatePromptTemplate?: (input: PromptTemplateUpdateInput) => Promise<void>;
  onDeletePromptTemplate?: (id: string) => Promise<void>;
};

type ChatFormValues = {
  model: SupportedModel;
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
  imageSize?: "1K" | "2K" | "4K";
  negativePrompt?: string;
  seed?: number;
  cfgScale?: number;
  steps?: number;
};

export function ChatSurface({
  brandProfileId,
  brandName,
  initialHistory,
  promptTemplates,
  templatesLoading,
  onCreatePromptTemplate,
  onUpdatePromptTemplate,
  onDeletePromptTemplate,
}: ChatSurfaceProps) {
  const { show } = useToast();
  const { state: streamState, start, cancel, reset } = useImageSseStream();

  const [activeModel, setActiveModel] = React.useState<SupportedModel>("nano-banana");
  const [refs, setRefs] = React.useState<RefImage[]>([]);
  const [firstFrame, setFirstFrame] = React.useState<RefImage | undefined>(undefined);
  const [lastFrame, setLastFrame] = React.useState<RefImage | undefined>(undefined);
  const [referenceVideo, setReferenceVideo] = React.useState<RefVideo | undefined>(undefined);
  const [history, setHistory] = React.useState<ChatImageHistoryItem[]>(initialHistory ?? []);
  const [continueFrom, setContinueFrom] = React.useState<{ data: string; mime_type: string }[]>([]);
  const [resetNext, setResetNext] = React.useState(false);
  const [conversationTurns, setConversationTurns] = React.useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [previewMarkup, setPreviewMarkup] = React.useState<{ base64: string; mime: string } | null>(null);

  // Compute if any references are attached
  const hasAnyReferences = React.useMemo(() => {
    return refs.length > 0 || firstFrame !== undefined || lastFrame !== undefined || referenceVideo !== undefined;
  }, [refs, firstFrame, lastFrame, referenceVideo]);

  const handleSubmit = React.useCallback(
    async (form: ChatFormValues) => {
      setActiveModel(form.model);
      const medium = getMediumForModel(form.model);
      const isNano = form.model === "nano-banana";
      if (isNano && (firstFrame || lastFrame || referenceVideo)) {
        show({
          title: "Video inputs not supported",
          description: "Nano Banana only generates images. Remove first/last frame or reference video, or pick a video model.",
          variant: "error",
        });
        return;
      }
      const aspectRatio = form.aspectRatio ?? "1:1";

      const payload: ChatImageRequestPayload = {
        brandProfileId,
        model: form.model,
        medium,
        prompt: form.prompt,
        aspectRatio,
        resolution: form.model === "nano-banana" ? form.resolution || "1024x1024" : medium === "video" ? form.resolution || "720p" : undefined,
        imageSize: form.model === "gemini-3-pro-image-preview" ? form.imageSize || "1K" : undefined,
        durationSeconds: medium === "video" ? (form.durationSeconds as 4 | 6 | 8 | undefined) ?? 8 : undefined,
        negativePrompt: form.negativePrompt || undefined,
        seed: isNano ? undefined : form.seed || undefined,
        cfgScale: isNano ? undefined : form.cfgScale || undefined,
        steps: isNano ? undefined : form.steps || undefined,
        refs: refs.length ? refs : undefined,
        firstFrame: medium === "video" ? firstFrame : undefined,
        lastFrame: medium === "video" ? lastFrame : undefined,
        referenceVideo: medium === "video" ? referenceVideo : undefined,
      };

      const apiModel: SupportedBackendModel =
        payload.medium === "video"
          ? payload.model === "veo-3-1-fast"
            ? "veo-3.1-fast-generate-preview"
            : "veo-3.1-generate-preview"
          : payload.model === "nano-banana"
            ? "gemini-2.5-flash-image"
            : payload.model;

      const userTurn = { role: "user" as const, content: form.prompt };
      const nextConversationTurns = form.model === "gemini-3-pro-image-preview" ? [...conversationTurns, userTurn] : [];

      const apiPayload: BackendChatImageRequestPayload = {
        brand_id: payload.brandProfileId,
        model: apiModel,
        medium: payload.medium,
        prompt: payload.prompt,
        aspect_ratio: payload.aspectRatio,
        resolution:
          payload.model === "nano-banana"
            ? payload.resolution ?? "1024x1024"
            : payload.medium === "video"
              ? payload.resolution ?? "720p"
              : undefined,
        duration_seconds:
          payload.medium === "video"
            ? (String((payload.durationSeconds as 4 | 6 | 8 | undefined) ?? 8) as "4" | "6" | "8")
            : undefined,
        image_size: payload.model === "gemini-3-pro-image-preview" ? payload.imageSize ?? "1K" : undefined,
        reference_images: payload.refs?.map((r) => ({
          data: r.base64,
          mime_type: r.mime,
          filename: r.name,
          weight: r.weight,
          referenceType: r.referenceType,
        })) ?? undefined,
        first_frame:
          payload.medium === "video" && payload.firstFrame
            ? { data: payload.firstFrame.base64, mime_type: payload.firstFrame.mime, filename: payload.firstFrame.name }
            : undefined,
        last_frame:
          payload.medium === "video" && payload.lastFrame
            ? { data: payload.lastFrame.base64, mime_type: payload.lastFrame.mime, filename: payload.lastFrame.name }
            : undefined,
        reference_video:
          payload.medium === "video" && payload.referenceVideo
            ? {
                data: payload.referenceVideo.base64,
                mime_type: payload.referenceVideo.mime,
                filename: payload.referenceVideo.filename ?? payload.referenceVideo.name,
              }
            : undefined,
        negative_prompt: payload.negativePrompt || undefined,
        seed: payload.seed,
        cfg_scale: payload.cfgScale,
        steps: payload.steps,
        continue_from:
          payload.model === "gemini-3-pro-image-preview" && continueFrom.length ? continueFrom : undefined,
        history:
          payload.model === "gemini-3-pro-image-preview" && nextConversationTurns.length ? nextConversationTurns : undefined,
        reset: resetNext || undefined,
      } satisfies Record<string, unknown>;

      const attachmentIssues: string[] = [];
      const checkBase64 = (label: string, base64: string | undefined, maxBytes: number) => {
        if (!base64) return;
        const bytes = estimateBase64DecodedBytes(base64);
        if (bytes > maxBytes) {
          attachmentIssues.push(`${label}: ${formatMiB(bytes)} (max ${formatMiB(maxBytes)})`);
        }
      };

      for (const ref of payload.refs ?? []) {
        checkBase64(`Reference image${ref.name ? ` (${ref.name})` : ""}`, ref.base64, IMAGE_REFERENCE_MAX_BYTES);
      }
      if (payload.medium === "video") {
        checkBase64("First frame", payload.firstFrame?.base64, IMAGE_REFERENCE_MAX_BYTES);
        checkBase64("Last frame", payload.lastFrame?.base64, IMAGE_REFERENCE_MAX_BYTES);
        checkBase64("Reference video", payload.referenceVideo?.base64, VIDEO_REFERENCE_MAX_BYTES);
      }

      if (attachmentIssues.length > 0) {
        show({
          title: "Attachment too large",
          description: attachmentIssues.slice(0, 2).join(" • "),
          variant: "error",
        });
        return;
      }

      const parsed = chatImageRequestSchema.safeParse({ ...payload });
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message ?? "Invalid input";
        show({ title: "Fix form issues", description: message, variant: "error" });
        return;
      }

      // Optimistic history seed
      const optimistic: ChatImageHistoryItem = {
        id: `local-${Date.now()}`,
        model: payload.model,
        medium: payload.medium,
        prompt: payload.prompt,
        aspectRatio: payload.aspectRatio,
        createdAt: new Date().toISOString(),
        thumbBase64: payload.refs?.[0]?.base64 ?? "",
      };
      setHistory((prev) => [optimistic, ...prev]);

      show({ title: "Generating", description: `${medium === "video" ? "Video" : "Image"} request started`, variant: "warning" });
      const result = await start(apiPayload, {
        initUrl: payload.medium === "video" ? getApiUrl("/ai-studio/generate-video") : getApiUrl("/ai-studio/generate"),
        expectedMedia: payload.medium === "video" ? "video" : "image",
      });
      if (result.error) {
        reset();
        show({ title: "Generation failed", description: result.error, variant: "error" });
        return;
      }
      setResetNext(false);
      if (streamState.posterBase64) {
        setContinueFrom([{ data: streamState.posterBase64, mime_type: "image/png" }]);
      }
      if (result.jobId) {
        setHistory((prev) => [{ ...optimistic, id: result.jobId }, ...prev.slice(1)] as ChatImageHistoryItem[]);
      }

      if (payload.model === "gemini-3-pro-image-preview") {
        setConversationTurns(nextConversationTurns);
      }
    },
    [brandProfileId, refs, firstFrame, lastFrame, referenceVideo, show, start, continueFrom, streamState.posterBase64, resetNext, reset, conversationTurns]
  );

  const handleSelectHistory = React.useCallback((item: ChatImageHistoryItem) => {
    setHistory((prev) => {
      // move selected to top
      const filtered = prev.filter((h) => h.id !== item.id);
      return [item, ...filtered];
    });
  }, []);

  React.useEffect(() => {
    if (streamState.status !== "done" || !streamState.currentBase64) return;
    // attach thumb/full to latest entry
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const [first, ...rest] = prev;
      const updated: ChatImageHistoryItem = {
        ...first,
        thumbBase64: streamState.posterBase64 ?? streamState.currentBase64 ?? first.thumbBase64,
        fullBase64: streamState.currentBase64 ?? first.fullBase64,
        posterBase64: streamState.posterBase64 ?? first.posterBase64,
      };
      return [updated, ...rest];
    });
    if (streamState.currentBase64) {
      setContinueFrom([{ data: streamState.currentBase64, mime_type: "image/png" }]);
    }
    show({ title: "Generation complete", variant: "success" });
  }, [streamState.status, streamState.currentBase64, streamState.posterBase64, show]);

  const handleReset = React.useCallback(() => {
    reset();
    if (activeModel === "gemini-3-pro-image-preview") {
      setContinueFrom([]);
      setResetNext(true);
      setConversationTurns([]);
    }
    show({ title: "Stream reset", variant: "warning" });
  }, [reset, show, activeModel]);

  React.useEffect(() => {
    if (streamState.status === "error" && streamState.error) {
      show({ title: "Stream error", description: streamState.error, variant: "error" });
    }
  }, [streamState.status, streamState.error, show]);

  React.useEffect(() => {
    const lastEvent = streamState.lastEvent as { event?: string; message?: string; text?: string } | undefined;
    if (!lastEvent || activeModel !== "gemini-3-pro-image-preview") return;
    if (lastEvent.event === "text" || lastEvent.event === "conversation_append") {
      const content = (lastEvent.message ?? lastEvent.text ?? "").trim();
      if (!content) return;
      setConversationTurns((prev) => [...prev, { role: "assistant", content }]);
    }
  }, [streamState.lastEvent, activeModel]);

  const handleOpenPreviewMarkup = React.useCallback(() => {
    if (streamState.videoUrl) return;
    const base64 = streamState.currentBase64 ?? streamState.posterBase64;
    if (!base64) return;
    setPreviewMarkup({ base64, mime: "image/png" });
  }, [streamState.currentBase64, streamState.posterBase64, streamState.videoUrl]);

  return (
    <div className="relative ml-6 sm:ml-10 md:ml-[96px] flex h-full min-h-[720px] flex-col gap-4" style={{ color: "var(--gray-12)" }}>
      <div className="flex min-h-[560px] flex-1 gap-6">
        <Card
          size="3"
          className="w-full basis-[40%] max-w-2xl min-w-[400px] space-y-4 overflow-auto pb-4 pr-1"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--gray-6)" }}
        >
          <ChatPanel
            disabled={streamState.status === "starting"}
            isStreaming={streamState.status === "streaming"}
            onSubmit={handleSubmit}
            onCancel={cancel}
            onModelChange={setActiveModel}
            getAspectsForModel={getAspectsForModel}
            mediumForModel={getMediumForModel}
            hasAnyReferences={hasAnyReferences}
            refsSummary={{
              refCount: refs.length,
              hasFirst: Boolean(firstFrame),
              hasLast: Boolean(lastFrame),
            }}
            promptTemplates={
              promptTemplates && onCreatePromptTemplate && onUpdatePromptTemplate && onDeletePromptTemplate
                ? {
                    templates: promptTemplates,
                    isLoading: templatesLoading ?? false,
                    onCreate: onCreatePromptTemplate,
                    onUpdate: onUpdatePromptTemplate,
                    onDelete: onDeletePromptTemplate,
                  }
                : undefined
            }
          />
          <ReferenceDock
            mode={getMediumForModel(activeModel)}
            model={activeModel}
            maxRefs={getMediumForModel(activeModel) === "video" ? 3 : 14}
            refs={refs}
            firstFrame={firstFrame}
            lastFrame={lastFrame}
            referenceVideo={referenceVideo}
            onChangeRefs={setRefs}
            onChangeFirstFrame={setFirstFrame}
            onChangeLastFrame={setLastFrame}
            onChangeReferenceVideo={setReferenceVideo}
          />
        </Card>

        <Card
          size="3"
          className="flex min-w-[520px] flex-1 overflow-hidden shadow-2xl"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--gray-6)" }}
        >
          <PreviewPane
            brandName={brandName}
            streamState={streamState}
            onCancel={cancel}
            onReset={handleReset}
            canMarkup={Boolean((streamState.currentBase64 ?? streamState.posterBase64) && !streamState.videoUrl)}
            onMarkup={handleOpenPreviewMarkup}
          />
        </Card>
      </div>

      <HistoryPanel history={history} onSelectHistory={handleSelectHistory} />

      {previewMarkup ? (
        <ImageMarkupDialog
          open={Boolean(previewMarkup)}
          sourceBase64={previewMarkup.base64}
          sourceMime={previewMarkup.mime}
          title="Markup preview"
          maxBytes={IMAGE_REFERENCE_MAX_BYTES}
          onClose={() => setPreviewMarkup(null)}
          onSave={(result) => {
            const maxRefs = getMediumForModel(activeModel) === "video" ? 3 : 14;
            if (refs.length >= maxRefs) {
              show({ title: "Reference limit", description: `Max ${maxRefs} reference images`, variant: "error" });
              return;
            }
            const nextRef: RefImage = {
              id: `markup-${Date.now()}`,
              name: "preview-markup.png",
              path: "preview-markup.png",
              mime: result.mime,
              base64: result.base64,
              referenceType: getMediumForModel(activeModel) === "video" ? "asset" : undefined,
            };
            setRefs((prev) => prev.concat(nextRef));
            show({ title: "Markup saved", description: "Added to reference images.", variant: "success" });
            setPreviewMarkup(null);
          }}
        />
      ) : null}
    </div>
  );
}

function HistoryPanel({ history, onSelectHistory }: { history: ChatImageHistoryItem[]; onSelectHistory: (item: ChatImageHistoryItem) => void }) {
  return (
    <Card
      size="3"
      className="shadow-xl"
      style={{ backgroundColor: "var(--color-panel)", border: "1px solid var(--gray-6)" }}
    >
      <div className="flex items-center justify-between pb-2">
        <Text weight="medium">History (this session)</Text>
        <Badge color="gray">{history.length}</Badge>
      </div>
      <ScrollArea type="always" scrollbars="vertical" className="max-h-[220px] pr-1">
        {history.length === 0 ? (
          <Text size="1" color="gray">No generations yet.</Text>
        ) : (
          <Flex gap="2" wrap="wrap">
            {history.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectHistory(item)}
                draggable
                onDragStart={(e) => {
                  const payload = {
                    type: "asset_drop",
                    payload: {
                      path: item.id,
                      publicUrl: item.posterBase64
                        ? `data:image/png;base64,${item.posterBase64}`
                        : item.thumbBase64
                          ? `data:image/png;base64,${item.thumbBase64}`
                          : undefined,
                      mimeType: item.medium === "video" ? "video/mp4" : "image/png",
                    },
                  };
                  e.dataTransfer.setData("application/reactflow-node-data", JSON.stringify(payload));
                  e.dataTransfer.setData("application/vnd.continuum.asset", JSON.stringify({
                    name: item.prompt.slice(0, 32),
                    path: item.id,
                    contentType: item.medium === "video" ? "video/mp4" : "image/png",
                  }));
                }}
                className="group relative h-24 w-24 overflow-hidden rounded-lg border border-white/15 bg-white/5 transition hover:-translate-y-1 hover:border-white/30"
              >
                {item.thumbBase64 ? (
                  <Image
                    src={`data:image/png;base64,${item.thumbBase64}`}
                    alt={item.prompt}
                    fill
                    unoptimized
                    sizes="96px"
                    className="object-cover"
                  />
                ) : item.posterBase64 ? (
                  <Image
                    src={`data:image/png;base64,${item.posterBase64}`}
                    alt={item.prompt}
                    fill
                    unoptimized
                    sizes="96px"
                    className="object-cover"
                  />
                ) : item.fullBase64 ? (
                  <Image
                    src={`data:image/png;base64,${item.fullBase64}`}
                    alt={item.prompt}
                    fill
                    unoptimized
                    sizes="96px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-gray-400">No thumb</div>
                )}
                <span className="absolute left-1 top-1 rounded bg-slate-900/70 px-1 text-[10px] uppercase text-gray-200">
                  {item.model === "nano-banana" || item.model === "gemini-3-pro-image-preview" ? "Image" : "Video"}
                </span>
              </button>
            ))}
          </Flex>
        )}
      </ScrollArea>
    </Card>
  );
}
