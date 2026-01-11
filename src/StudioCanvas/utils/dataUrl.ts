export type ParsedDataUrl = {
  mimeType: string;
  base64: string;
};

export function parseDataUrl(value?: string | null): ParsedDataUrl | null {
  if (!value || typeof value !== "string") return null;
  const match = /^data:([^;]+);base64,(.*)$/.exec(value);
  if (!match) return null;
  const mimeType = match[1] ?? "application/octet-stream";
  const base64 = match[2] ?? "";
  return { mimeType, base64 };
}

export function buildDataUrl(mimeType: string, base64: string): string {
  const safeMime = mimeType || "application/octet-stream";
  return `data:${safeMime};base64,${base64}`;
}
