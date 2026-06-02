import type {
  DocumentErrorCode,
  DocumentKind,
  DocumentProgressStep,
  OnboardingDocument,
} from "@/lib/onboarding/state";

export type DocumentDensity = "compact" | "full";

export type DocumentView = OnboardingDocument;

export type ProgressLabel = {
  text: string;
  tone: "neutral" | "progress" | "success" | "error";
};

export function describeStep(doc: DocumentView): ProgressLabel {
  const step: DocumentProgressStep | undefined =
    doc.progressStep ??
    (doc.status === "ready" ? "ready" : doc.status === "error" ? "error" : "extracting");
  const percent =
    typeof doc.progressPercent === "number" ? ` ${doc.progressPercent}%` : "";
  switch (step) {
    case "uploading":
      return { text: `Uploading${percent}`, tone: "progress" };
    case "extracting":
      return { text: `Extracting text${percent}`, tone: "progress" };
    case "chunking":
      return { text: "Splitting content", tone: "progress" };
    case "embedding":
      return { text: `Indexing${percent}`, tone: "progress" };
    case "ready":
      return { text: "Ready", tone: "success" };
    case "error":
      return { text: describeError(doc.errorCode, doc.errorMessage), tone: "error" };
    default:
      return { text: "Processing", tone: "progress" };
  }
}

export function describeError(code?: DocumentErrorCode, message?: string): string {
  if (message && message.length > 0 && message.length < 120) return message;
  switch (code) {
    case "UNSUPPORTED_FORMAT":
      return "Format not supported";
    case "STORAGE_FETCH_FAILED":
      return "Could not read file";
    case "EXTRACT_FAILED":
      return "Extraction failed";
    case "EMPTY_TEXT":
      return "No text found";
    case "EMBED_BATCH_FAILED":
      return "Indexing failed";
    case "CHUNK_INSERT_FAILED":
      return "Save failed";
    default:
      return "Processing error";
  }
}

const KIND_LABEL: Record<DocumentKind, string> = {
  pdf: "PDF",
  docx: "Word",
  pptx: "PowerPoint",
  xlsx: "Excel",
  image: "Image",
  text: "Text",
  markdown: "Markdown",
  csv: "CSV",
  json: "JSON",
  html: "HTML",
  unknown: "Document",
};

export function kindLabel(doc: DocumentView): string {
  if (doc.kind) return KIND_LABEL[doc.kind];
  const dot = doc.name.lastIndexOf(".");
  if (dot >= 0) return doc.name.slice(dot + 1).toUpperCase();
  return "Document";
}

export function isPreviewSupported(doc: DocumentView): boolean {
  if (!doc.storagePath) return false;
  const kind = doc.kind ?? inferKindFromName(doc.name);
  return kind !== "unknown";
}

function inferKindFromName(name: string): DocumentKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (/\.(png|jpe?g|webp|gif)$/.test(lower)) return "image";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (lower.endsWith(".txt")) return "text";
  return "unknown";
}
