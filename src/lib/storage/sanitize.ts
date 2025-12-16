const DEFAULT_FALLBACK = "file";

function stripCombiningMarks(value: string): string {
  return value.replace(/[\u0300-\u036f]/g, "");
}

function normalizeName(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const normalized = stripCombiningMarks(trimmed.normalize("NFKD"));
  const replacedSeparators = normalized.replace(/[\\\/]+/g, "-");
  const whitespaceCollapsed = replacedSeparators.replace(/\s+/g, "-");
  const cleaned = whitespaceCollapsed.replace(/[^0-9A-Za-z._-]/g, "-");
  const hyphenCollapsed = cleaned.replace(/-+/g, "-");
  const dotCollapsed = hyphenCollapsed.replace(/[.]{2,}/g, ".");
  const underscoresCollapsed = dotCollapsed.replace(/_{2,}/g, "_");
  const punctuationBalanced = underscoresCollapsed.replace(/(?:-\.|\.-)+/g, "-");
  const collapsed = punctuationBalanced.replace(/-+/g, "-");
  const trimmedPunctuation = collapsed.replace(/^[.\-_]+/, "").replace(/[.\-_]+$/, "");
  return trimmedPunctuation || fallback;
}

function normalizeExtension(value: string): string {
  const normalized = stripCombiningMarks(value.normalize("NFKD"));
  const cleaned = normalized.replace(/[^0-9A-Za-z]/g, "");
  return cleaned.toLowerCase();
}

export function sanitizeStorageFileName(raw: string, fallback: string = DEFAULT_FALLBACK): string {
  const safeFallback = normalizeName(fallback, DEFAULT_FALLBACK).toLowerCase() || DEFAULT_FALLBACK;
  const safeInput = typeof raw === "string" ? raw : "";
  const trimmed = safeInput.trim().replace(/[\\\/]+/g, "-");

  const lastDot = trimmed.lastIndexOf(".");
  const isExtensionOnlyDotFile = trimmed.startsWith(".") && trimmed.indexOf(".", 1) === -1 && trimmed.length > 1;
  const hasExtension =
    (lastDot > 0 && lastDot < trimmed.length - 1) || (isExtensionOnlyDotFile && trimmed.length > 1);

  const basePart = isExtensionOnlyDotFile ? "" : hasExtension ? trimmed.slice(0, lastDot) : trimmed;
  const extensionPart = isExtensionOnlyDotFile ? trimmed.slice(1) : hasExtension ? trimmed.slice(lastDot + 1) : "";

  const sanitizedName = normalizeName(basePart, safeFallback).toLowerCase();
  const sanitizedExt = normalizeExtension(extensionPart);

  if (sanitizedExt.length === 0) {
    return sanitizedName;
  }

  return `${sanitizedName}.${sanitizedExt}`;
}

