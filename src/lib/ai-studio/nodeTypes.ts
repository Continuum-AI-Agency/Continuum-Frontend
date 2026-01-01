import type { Node } from "@xyflow/react";
import type { AiStudioMedium, AiStudioProvider } from "@/lib/schemas/aiStudio";

export type GeneratorNodeData = {
  provider: AiStudioProvider;
  medium: AiStudioMedium;
  prompt: string;
  aspectRatio: string;
  referenceAssetPath?: string;
  firstFramePath?: string;
  lastFramePath?: string;
  negativePrompt?: string;
  guidanceScale?: number;
  seed?: number;
  imageSize?: "1k" | "2k" | "4k";
  responseModality?: "image" | "image+text";
  status?: string;
  jobId?: string;
  artifactPreview?: string;
  artifactName?: string;
  outputPath?: string;
  outputUrl?: string;
  outputType?: 'image' | 'video';
};

export type AttachmentNodeData = {
  label: string;
  path: string;
  mimeType: string;
  previewUrl: string;
};

export type PromptNodeData = {
  prompt: string;
};

export type NegativeNodeData = {
  negativePrompt: string;
};

export type ModelNodeData = {
  provider: AiStudioProvider;
  medium: AiStudioMedium;
  aspectRatio: string;
  imageSize?: "1k" | "2k" | "4k";
  responseModality?: "image" | "image+text";
};

export type PreviewNodeData = {
  artifactPreview?: string;
  artifactName?: string;
  medium?: AiStudioMedium;
};

export type NodeData =
  | GeneratorNodeData
  | AttachmentNodeData
  | PromptNodeData
  | NegativeNodeData
  | ModelNodeData
  | PreviewNodeData;

export type StudioNode = Node<NodeData>;
