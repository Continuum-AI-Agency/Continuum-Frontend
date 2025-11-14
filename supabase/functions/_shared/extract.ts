export type ExtractOptions = {
  mimeType?: string;
  fileName?: string;
};

export async function extractText(
  bytes: Uint8Array,
  options: ExtractOptions
): Promise<{ text: string; mimeType: string; fileName?: string }> {
  const mime = options.mimeType ?? inferMimeType(options.fileName);
  if (mime?.startsWith("text/")) {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return { text: decoder.decode(bytes), mimeType: mime, fileName: options.fileName };
  }
  // TODO: Add PDF, DOCX, PPTX, HTML extraction. For now, treat as text fallback.
  const decoder = new TextDecoder("utf-8", { fatal: false });
  return { text: decoder.decode(bytes), mimeType: mime ?? "text/plain", fileName: options.fileName };
}

function inferMimeType(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return undefined;
}


