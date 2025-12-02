import { z } from "zod";

import { providerAspectRatioOptions } from "@/lib/schemas/aiStudio";
import type { SupportedModel } from "@/lib/types/chatImage";

export const supportedModels = ["nano-banana", "gemini-3-pro-image-preview", "veo-3-1", "veo-3-1-fast", "sora-2"] as const satisfies ReadonlyArray<SupportedModel>;

const modelMedium: Record<SupportedModel, "image" | "video"> = {
  "nano-banana": "image",
  "gemini-3-pro-image-preview": "image",
  "veo-3-1": "video",
  "veo-3-1-fast": "video",
  "sora-2": "video",
};

const refImageSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  path: z.string(),
  mime: z.string().regex(/^image\//i, "Reference must be an image"),
  base64: z.string(),
  weight: z.number().optional(),
  referenceType: z.enum(["asset", "style"]).optional(),
});

const refVideoSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  mime: z.string().regex(/^video\//i, "Reference must be a video"),
  base64: z.string(),
  filename: z.string().optional(),
});

// Base object schema (no superRefine) so we can pick in the client form.
export const chatImageRequestBase = z.object({
  brandProfileId: z.string().min(1, "brandProfileId is required"),
  model: z.enum(supportedModels),
  prompt: z.string().min(1, "Prompt is required"),
  aspectRatio: z.string().optional(),
  durationSeconds: z.number().int().positive().optional(),
  resolution: z.string().optional(),
  seed: z.number().int().nonnegative().optional(),
  cfgScale: z.number().min(0).max(50).optional(),
  steps: z.number().int().positive().max(128).optional(),
  negativePrompt: z.string().optional(),
  refs: z.array(refImageSchema).optional(),
  firstFrame: refImageSchema.optional(),
  lastFrame: refImageSchema.optional(),
  referenceVideo: refVideoSchema.optional(),
  imageSize: z.enum(["1K", "2K", "4K"]).optional(),
});

export const chatImageRequestSchema = chatImageRequestBase.superRefine((value, ctx) => {
  const medium = modelMedium[value.model];
  const allowedAspects = providerAspectRatioOptions[value.model]?.[medium];

  if (medium === "video" && !value.aspectRatio) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["aspectRatio"], message: "Aspect ratio is required for video." });
  }

  if (value.model !== "nano-banana" && value.aspectRatio && allowedAspects && !allowedAspects.includes(value.aspectRatio)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["aspectRatio"],
      message: `Aspect ratio ${value.aspectRatio} is not supported for ${value.model} ${medium}. Allowed: ${allowedAspects.join(", ")}`,
    });
  }

  if (medium === "video" && value.refs && value.refs.length > 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["refs"],
      message: "Veo/Sora currently support up to 3 reference images.",
    });
  }

  if (medium === "image" && value.refs && value.refs.length > 14) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["refs"],
      message: "Images allow up to 14 reference images.",
    });
  }

  if (medium === "video" && (value.firstFrame || value.lastFrame) && !value.durationSeconds) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durationSeconds"],
      message: "Duration must be set when providing first or last frame.",
    });
  }

  if (value.model === "nano-banana" && value.resolution && !/^\d{2,4}x\d{2,4}$/i.test(value.resolution)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resolution"],
      message: "Resolution must be like 1024x1024",
    });
  }

  if (medium === "video" && value.resolution && !["720p", "1080p"].includes(value.resolution)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resolution"],
      message: "Resolution must be 720p or 1080p for Veo/Sora",
    });
  }

  if (value.model === "gemini-3-pro-image-preview") {
    if (!value.imageSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["imageSize"],
        message: "image_size is required for Pro image",
      });
    }
    if (!value.aspectRatio) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["aspectRatio"], message: "Aspect ratio is required for Pro image" });
    } else if (!/^\d{1,2}:\d{1,2}$/.test(value.aspectRatio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["aspectRatio"],
        message: "Aspect ratio must be like 1:1 or 16:9",
      });
    }
  }
});

export type ChatImageRequest = z.infer<typeof chatImageRequestSchema> & {
  medium: "image" | "video"; // attached at call-site for clarity
};

export function getMediumForModel(model: SupportedModel): "image" | "video" {
  return modelMedium[model];
}

export function getAspectsForModel(model: SupportedModel): readonly string[] {
  const medium = modelMedium[model];
  if (model === "gemini-3-pro-image-preview") {
    return ["1:1", "5:4", "4:5", "16:9", "9:16"] as const;
  }
  if (model === "veo-3-1-fast") {
    return providerAspectRatioOptions["veo-3-1"]?.[medium] ?? ["16:9", "9:16"];
  }
  return providerAspectRatioOptions[model]?.[medium] ?? [];
}
