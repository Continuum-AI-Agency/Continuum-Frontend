"use client";

import React from "react";

import { useToast } from "@/components/ui/ToastProvider";
import { useImageSseStream } from "@/hooks/useImageSseStream";
import { chatImageRequestSchema, getAspectsForModel, getMediumForModel } from "@/lib/schemas/chatImageRequest";
import type { ChatImageHistoryItem, ChatImageRequestPayload, RefImage, RefVideo, SupportedModel } from "@/lib/types/chatImage";

import { ChatPanel } from "./ChatPanel";
import { PreviewPane } from "./PreviewPane";
import { ReferenceDock } from "./ReferenceDock";

type ChatSurfaceProps = {
  brandProfileId: string;
  brandName: string;
  initialHistory?: ChatImageHistoryItem[];
};

export function ChatSurface({ brandProfileId, brandName, initialHistory }: ChatSurfaceProps) {
  const { show } = useToast();
  const { state: streamState, start, cancel, reset } = useImageSseStream();

  const [activeModel, setActiveModel] = React.useState<SupportedModel>("veo-3-1");
  const [refs, setRefs] = React.useState<RefImage[]>([]);
  const [firstFrame, setFirstFrame] = React.useState<RefImage | undefined>(undefined);
  const [lastFrame, setLastFrame] = React.useState<RefImage | undefined>(undefined);
  const [referenceVideo, setReferenceVideo] = React.useState<RefVideo | undefined>(undefined);
  const [history, setHistory] = React.useState<ChatImageHistoryItem[]>(initialHistory ?? []);

  const handleSubmit = React.useCallback(
    async (form: {
      model: SupportedModel;
      prompt: string;
      aspectRatio: string;
      durationSeconds?: number;
      resolution?: string;
      imageSize?: "1K" | "2K" | "4K";
      negativePrompt?: string;
      seed?: number;
      cfgScale?: number;
      steps?: number;
    }) => {
      setActiveModel(form.model);
      const medium = getMediumForModel(form.model);
      const isNano = form.model === "nano-banana";
      const payload: ChatImageRequestPayload = {
        brandProfileId,
        model: form.model,
        medium,
        prompt: form.prompt,
        aspectRatio: form.aspectRatio,
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

      await start(payload);
    },
    [brandProfileId, refs, firstFrame, lastFrame, show, start]
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
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const [first, ...rest] = prev;
      const updated: ChatImageHistoryItem = {
        ...first,
        thumbBase64: streamState.posterBase64 ?? streamState.currentBase64,
        fullBase64: streamState.currentBase64,
        posterBase64: streamState.posterBase64,
      };
      return [updated, ...rest];
    });
  }, [streamState.status, streamState.currentBase64, streamState.posterBase64]);

  const handleReset = React.useCallback(() => {
    reset();
    show({ title: "Stream reset", variant: "info" });
  }, [reset, show]);

  return (
    <div className="flex h-full min-h-[640px] gap-4 overflow-hidden">
      <div className="w-full basis-[42%] max-w-xl min-w-[360px] space-y-4 overflow-auto pb-4 pr-1">
        <ChatPanel
          disabled={streamState.status === "starting"}
          isStreaming={streamState.status === "streaming"}
          onSubmit={handleSubmit}
          onCancel={cancel}
          onModelChange={setActiveModel}
          getAspectsForModel={getAspectsForModel}
          mediumForModel={getMediumForModel}
          refsSummary={{
            refCount: refs.length,
            hasFirst: Boolean(firstFrame),
            hasLast: Boolean(lastFrame),
          }}
        />
        <ReferenceDock
          mode={getMediumForModel(activeModel)}
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
      </div>

      <div className="flex-1 min-w-0">
        <PreviewPane
          brandName={brandName}
          streamState={streamState}
          history={history}
          onSelectHistory={handleSelectHistory}
          onCancel={cancel}
          onReset={handleReset}
        />
      </div>
    </div>
  );
}
