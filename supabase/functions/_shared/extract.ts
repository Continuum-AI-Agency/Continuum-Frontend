export type ExtractOptions = {
  mimeType?: string;
  fileName?: string;
};

export async function extractText(
  bytes: Uint8Array,
  options: ExtractOptions
): Promise<{ text: string; mimeType: string; fileName?: string }> {
  const mime = options.mimeType ?? inferMimeType(options.fileName);
  if (mime?.startsWith("text/") || mime === "application/json") {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return { text: decoder.decode(bytes), mimeType: mime, fileName: options.fileName };
  }

  const UNSUPPORTED_BINARY_FORMATS: Record<string, string> = {
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.template": "DOCM",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  };

  if (mime && mime in UNSUPPORTED_BINARY_FORMATS) {
    const label = UNSUPPORTED_BINARY_FORMATS[mime];
    throw new Error(
      `${label} files are not yet supported for text extraction. Please convert to .txt, .md, .csv, or .json and re-upload.`
    );
  }

  throw new Error(
    `Format "${mime ?? "unknown"}" is not yet supported for text extraction. Please convert to .txt, .md, .csv, or .json and re-upload.`
  );
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


