// Converts freshly-placed image reference nodes whose source is a remote URL
// (e.g. Instagram CDN) into inline base64 data URLs, driving a processing ->
// ready/error status on each node. Without this, a remote-URL reference never
// reaches the generation model, which only accepts inline base64.
//
// Dependencies are injected so the orchestration is testable without React Flow.

import type { InlinedImage } from "@/lib/ai-studio/inlineRemoteImage";
import type { ImageNodeData } from "../types";

interface ReferenceNodeInput {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}

interface InlineReferenceDeps {
  inline: (url: string) => Promise<InlinedImage>;
  updateNodeData: (id: string, data: Partial<ImageNodeData>) => void;
}

export async function inlineReferenceImageNodes(
  nodes: ReadonlyArray<ReferenceNodeInput>,
  { inline, updateNodeData }: InlineReferenceDeps,
): Promise<void> {
  const targets = nodes.filter(
    (node) => node.type === "image" && typeof node.data.sourceUrl === "string",
  );

  await Promise.all(
    targets.map(async (node) => {
      updateNodeData(node.id, { referenceStatus: "processing" });
      try {
        const { dataUrl } = await inline(node.data.sourceUrl as string);
        updateNodeData(node.id, { image: dataUrl, referenceStatus: "ready" });
      } catch {
        updateNodeData(node.id, { referenceStatus: "error" });
      }
    }),
  );
}
