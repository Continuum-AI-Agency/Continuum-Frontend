const dataUrlPattern = /^data:[^;]+;base64,/i;
const base64LikePattern = /^[a-z0-9+/=]+$/i;
const minBase64Length = 256;

function isEncodedPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (dataUrlPattern.test(trimmed)) return true;
  if (trimmed.length < minBase64Length) return false;
  return base64LikePattern.test(trimmed);
}

function stripEncodedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return isEncodedPayload(value) ? undefined : value;
}

function sanitizeNodeData(data: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data };
  const image = stripEncodedString(next.image);
  if (image === undefined && typeof next.image === "string") delete next.image;
  const video = stripEncodedString(next.video);
  if (video === undefined && typeof next.video === "string") delete next.video;
  const audio = stripEncodedString(next.audio);
  if (audio === undefined && typeof next.audio === "string") delete next.audio;

  if (Array.isArray(next.inputs)) {
    const sanitizedInputs = next.inputs
      .map((input) => {
        if (!input || typeof input !== "object") return null;
        const record = input as Record<string, unknown>;
        const sanitizedSrc = stripEncodedString(record.src);
        if (sanitizedSrc === undefined && typeof record.src === "string") return null;
        return { ...record, src: sanitizedSrc ?? record.src };
      })
      .filter((input): input is Record<string, unknown> => Boolean(input));
    next.inputs = sanitizedInputs;
  }

  if (Array.isArray(next.frameList)) {
    const sanitizedFrames = next.frameList
      .map((frame) => {
        if (!frame || typeof frame !== "object") return null;
        const record = frame as Record<string, unknown>;
        const sanitizedSrc = stripEncodedString(record.src);
        const nextFrame: Record<string, unknown> = { ...record };
        if (sanitizedSrc === undefined && typeof record.src === "string") {
          delete nextFrame.src;
        } else if (sanitizedSrc !== undefined) {
          nextFrame.src = sanitizedSrc;
        }
        return nextFrame;
      })
      .filter((frame): frame is Record<string, unknown> => Boolean(frame));
    next.frameList = sanitizedFrames;
  }

  if (Array.isArray(next.documents)) {
    const sanitizedDocuments = next.documents
      .map((doc) => {
        if (!doc || typeof doc !== "object") return null;
        const record = doc as Record<string, unknown>;
        const sanitizedContent = stripEncodedString(record.content);
        return {
          ...record,
          content: sanitizedContent ?? (typeof record.content === "string" ? "" : ""),
        };
      })
      .filter((doc): doc is Record<string, unknown> => Boolean(doc));
    next.documents = sanitizedDocuments;
  }

  return next;
}

export function sanitizeWorkflowNodes(nodes: unknown[]): unknown[] {
  return nodes.map((node) => {
    if (!node || typeof node !== "object") return node;
    const record = node as Record<string, unknown>;
    if (!record.data || typeof record.data !== "object") return node;
    return { ...record, data: sanitizeNodeData(record.data as Record<string, unknown>) };
  });
}
