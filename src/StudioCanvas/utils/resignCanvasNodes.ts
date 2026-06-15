import type { StudioNode } from "../types";
import { request } from "@/lib/api/http";

type SignItem = { bucket: string; path: string };
type SignResult = { path: string; signedUrl: string };

function collectSignItems(nodes: StudioNode[]): SignItem[] {
  const items: SignItem[] = [];
  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;

    // Generated outputs (nanoGen / video generators).
    const imgPath = data.generatedImageStoragePath;
    const imgBucket = data.generatedImageBucket;
    if (typeof imgPath === "string" && typeof imgBucket === "string") {
      items.push({ bucket: imgBucket, path: imgPath });
    }
    const vidPath = data.generatedVideoStoragePath;
    const vidBucket = data.generatedVideoBucket;
    if (typeof vidPath === "string" && typeof vidBucket === "string") {
      items.push({ bucket: vidBucket, path: vidPath });
    }

    // Uploaded reference nodes (image/video). sourcePath + bucket re-sign into the
    // node's media value so a saved/broadcast reference renders after its signed
    // URL has expired.
    const refPath = data.sourcePath;
    const refBucket = data.bucket;
    if (typeof refPath === "string" && typeof refBucket === "string") {
      items.push({ bucket: refBucket, path: refPath });
    }
  }
  return items;
}

function applySignedUrls(nodes: StudioNode[], urlMap: Map<string, string>): StudioNode[] {
  return nodes.map((node) => {
    const data = node.data as Record<string, unknown>;
    const imgPath = data.generatedImageStoragePath;
    const vidPath = data.generatedVideoStoragePath;
    const refPath = data.sourcePath;
    const imgUrl = typeof imgPath === "string" ? urlMap.get(imgPath) : undefined;
    const vidUrl = typeof vidPath === "string" ? urlMap.get(vidPath) : undefined;
    const refUrl = typeof refPath === "string" ? urlMap.get(refPath) : undefined;
    if (!imgUrl && !vidUrl && !refUrl) return node;

    const refField = node.type === "video" ? "video" : "image";
    return {
      ...node,
      data: {
        ...data,
        ...(imgUrl ? { generatedImageUrl: imgUrl } : {}),
        ...(vidUrl ? { generatedVideoUrl: vidUrl } : {}),
        ...(refUrl ? { [refField]: refUrl, sourceUrl: refUrl } : {}),
      } as StudioNode["data"],
    };
  });
}

export async function resignCanvasNodes(nodes: StudioNode[]): Promise<StudioNode[]> {
  const items = collectSignItems(nodes);
  if (items.length === 0) return nodes;

  try {
    const results = await request<SignResult[]>({
      path: "/api/ai-studio/sign",
      method: "POST",
      body: { items },
    });

    const urlMap = new Map<string, string>(results.map((r) => [r.path, r.signedUrl]));
    return applySignedUrls(nodes, urlMap);
  } catch (err) {
    console.warn("[studio] resignCanvasNodes: failed to re-sign, using stale URLs", err);
    return nodes;
  }
}
