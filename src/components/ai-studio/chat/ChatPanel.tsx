"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge, Button, Callout, Flex, RadioGroup, Select, Separator, Text, TextArea, TextField } from "@radix-ui/themes";
import { ExclamationTriangleIcon, MixerVerticalIcon, PaperPlaneIcon, StopIcon } from "@radix-ui/react-icons";
import { useForm } from "react-hook-form";

import { chatImageRequestBase, getAspectsForModel, getMediumForModel } from "@/lib/schemas/chatImageRequest";
import type { SupportedModel } from "@/lib/types/chatImage";

type FormValues = {
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
};

type ChatPanelProps = {
  disabled?: boolean;
  isStreaming?: boolean;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  onModelChange?: (model: SupportedModel) => void;
  getAspectsForModel: typeof getAspectsForModel;
  mediumForModel: typeof getMediumForModel;
  refsSummary?: { refCount: number; hasFirst: boolean; hasLast: boolean };
};

const MODEL_OPTIONS: { value: SupportedModel; label: string; disabled?: boolean }[] = [
  { value: "nano-banana", label: "Nano Banana (Gemini 2.5 Flash Image)" },
  { value: "veo-3-1", label: "Veo 3.1 (Video)" },
  { value: "veo-3-1-fast", label: "Veo 3.1 Fast (Video)" },
  { value: "sora-2", label: "Sora 2 (Coming soon)", disabled: true },
];

export function ChatPanel({
  disabled,
  isStreaming,
  onSubmit,
  onCancel,
  onModelChange,
  getAspectsForModel,
  mediumForModel,
  refsSummary,
}: ChatPanelProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(
      chatImageRequestBase.pick({
        model: true,
        prompt: true,
        aspectRatio: true,
        resolution: true,
        imageSize: true,
        negativePrompt: true,
        seed: true,
        cfgScale: true,
        steps: true,
      })
    ),
    defaultValues: {
      model: "veo-3-1",
      prompt: "",
      aspectRatio: getAspectsForModel("veo-3-1")[0] ?? "16:9",
      resolution: "720p",
      durationSeconds: 8,
    },
    mode: "onSubmit",
  });

  const model = form.watch("model");
  const medium = mediumForModel(model);
  const aspectOptions = React.useMemo(() => getAspectsForModel(model), [getAspectsForModel, model]);

  React.useEffect(() => {
    onModelChange?.(model);
    // reset aspect if current is not allowed
    if (!aspectOptions.includes(form.getValues("aspectRatio"))) {
      form.setValue("aspectRatio", aspectOptions[0] ?? "1:1");
    }
    if (model === "nano-banana") {
      form.setValue("resolution", form.getValues("resolution") || "1024x1024");
      form.setValue("imageSize", undefined);
    } else if (model === "gemini-3-pro-image-preview") {
      form.setValue("resolution", "");
      form.setValue("imageSize", form.getValues("imageSize") || "1K");
    } else {
      form.setValue("resolution", form.getValues("resolution") || "720p");
      form.setValue("imageSize", undefined);
      if (!form.getValues("durationSeconds")) form.setValue("durationSeconds", 8);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, aspectOptions, medium]);

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit(values);
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 via-slate-900/80 to-slate-950/90 p-4 text-white shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <div className="space-y-0.5">
          <Text weight="medium">Generate</Text>
          <Text size="1" color="gray">Model-aware controls with advanced tucked away.</Text>
        </div>
        <Badge variant="soft" size="2">{medium === "image" ? "Image" : "Video"}</Badge>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <Text size="1" color="gray">Model</Text>
          <Select.Root
            value={model}
            onValueChange={(value) => form.setValue("model", value as SupportedModel)}
            disabled={disabled || isStreaming}
          >
            <Select.Trigger className="w-full" />
            <Select.Content>
              {MODEL_OPTIONS.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>

        <div className="space-y-1">
          <Text size="1" color="gray">Prompt</Text>
          <TextArea
            value={form.watch("prompt")}
            onChange={(e) => form.setValue("prompt", e.target.value)}
            placeholder="Describe what you want to see"
            rows={4}
            className="min-h-[120px]"
            disabled={disabled || isStreaming}
          />
        </div>

        {model === "nano-banana" ? (
          <div className="space-y-1">
            <Text size="1" color="gray">Resolution (WxH)</Text>
            <TextField.Root
              placeholder="1024x1024"
              value={form.watch("resolution") ?? ""}
              onChange={(e) => form.setValue("resolution", e.target.value)}
              disabled={disabled || isStreaming}
            />
          </div>
        ) : medium === "video" ? (
          <div className="space-y-1">
            <Text size="1" color="gray">Resolution</Text>
            <Select.Root
              value={form.watch("resolution") ?? "720p"}
              onValueChange={(value) => form.setValue("resolution", value)}
              disabled={disabled || isStreaming}
            >
              <Select.Trigger className="w-full" />
              <Select.Content>
                <Select.Item value="720p">720p</Select.Item>
                <Select.Item value="1080p">1080p</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
        ) : null}

        <div className="space-y-1">
          <Text size="1" color="gray">Aspect ratio</Text>
          <Flex gap="2" wrap="wrap">
        {aspectOptions.map((ratio) => (
          <Button
            key={ratio}
            size="1"
            variant={form.watch("aspectRatio") === ratio ? "solid" : "surface"}
            onClick={(e) => {
              e.preventDefault();
              form.setValue("aspectRatio", ratio);
            }}
            disabled={disabled || isStreaming}
          >
            {ratio}
          </Button>
        ))}
      </Flex>
    </div>

        {model === "gemini-3-pro-image-preview" ? (
          <div className="space-y-1">
            <Text size="1" color="gray">Image size</Text>
            <Flex gap="2" wrap="wrap">
              {(["1K", "2K", "4K"] as const).map((size) => (
                <Button
                  key={size}
                  size="1"
                  variant={form.watch("imageSize") === size ? "solid" : "surface"}
                  onClick={(e) => {
                    e.preventDefault();
                    form.setValue("imageSize", size);
                  }}
                  disabled={disabled || isStreaming}
                >
                  {size}
                </Button>
              ))}
            </Flex>
          </div>
        ) : null}

        {medium === "video" ? (
          <div className="space-y-1">
            <Flex align="center" justify="between">
              <Text size="1" color="gray">Duration (secs)</Text>
              <Text size="1" color="gray">Default 8s</Text>
            </Flex>
            <RadioGroup.Root
              value={String(form.watch("durationSeconds") ?? "8")}
              onValueChange={(value) => form.setValue("durationSeconds", Number(value))}
              className="flex gap-2"
              disabled={disabled || isStreaming}
            >
              {([4, 6, 8] as const).map((d) => (
                <RadioGroup.Item key={d} value={String(d)}>{d}</RadioGroup.Item>
              ))}
            </RadioGroup.Root>
          </div>
        ) : null}

        <Separator my="2" className="border-white/10" />

        <details className="rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-white/20" open={false}>
          <summary className="flex cursor-pointer items-center gap-2 text-sm text-gray-200">
            <MixerVerticalIcon /> Advanced
          </summary>
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <Text size="1" color="gray">Negative prompt</Text>
              <TextArea
                value={form.watch("negativePrompt") ?? ""}
                onChange={(e) => form.setValue("negativePrompt", e.target.value || undefined)}
                rows={2}
                className="min-h-[72px]"
                disabled={disabled || isStreaming}
              />
            </div>
            {model !== "nano-banana" ? (
              <div className="grid grid-cols-3 gap-2">
                <TextField.Root
                  type="number"
                  placeholder="Seed"
                  value={form.watch("seed") ?? ""}
                  onChange={(e) => form.setValue("seed", e.target.value ? Number(e.target.value) : undefined)}
                  disabled={disabled || isStreaming}
                />
                <TextField.Root
                  type="number"
                  placeholder="CFG"
                  value={form.watch("cfgScale") ?? ""}
                  onChange={(e) => form.setValue("cfgScale", e.target.value ? Number(e.target.value) : undefined)}
                  disabled={disabled || isStreaming}
                />
                <TextField.Root
                  type="number"
                  placeholder="Steps"
                  value={form.watch("steps") ?? ""}
                  onChange={(e) => form.setValue("steps", e.target.value ? Number(e.target.value) : undefined)}
                  disabled={disabled || isStreaming}
                />
              </div>
            ) : (
              <Text size="1" color="gray">Advanced knobs not required for Nano Banana.</Text>
            )}
          </div>
        </details>

        <Callout.Root color="gray" variant="soft">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            {refsSummary?.refCount ? `${refsSummary.refCount} reference image${refsSummary.refCount === 1 ? "" : "s"} attached.` : "No reference images attached."}
            {medium === "video" ? ` ${refsSummary?.hasFirst ? "First frame set." : ""} ${refsSummary?.hasLast ? "Last frame set." : ""}` : ""}
          </Callout.Text>
        </Callout.Root>

        <Flex gap="2">
          <Button type="submit" className="flex-1" disabled={disabled || isStreaming}>
            <PaperPlaneIcon /> {isStreaming ? "Streaming" : "Generate"}
          </Button>
          <Button type="button" variant="outline" color="red" onClick={onCancel} disabled={!isStreaming}>
            <StopIcon /> Cancel
          </Button>
        </Flex>
      </form>
    </div>
  );
}
