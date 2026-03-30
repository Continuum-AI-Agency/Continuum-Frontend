import type { RefImage } from "@/lib/types/chatImage";
import type { ImageMarkupSaveResult } from "@/components/ai-studio/markup/ImageMarkupDialog";

type LegacyMarkupResult = {
  base64: string;
  mime: string;
};

type MarkupResult = ImageMarkupSaveResult | LegacyMarkupResult;

function isNewMarkupResult(result: MarkupResult): result is ImageMarkupSaveResult {
  return "composited" in result && "markupLayer" in result;
}

export function applyMarkupToRef(ref: RefImage, result: MarkupResult): RefImage {
  const base64 = isNewMarkupResult(result) ? result.composited.base64 : result.base64;
  const mime = isNewMarkupResult(result) ? result.composited.mime : result.mime;
  const markupLayer = isNewMarkupResult(result) ? result.markupLayer.base64 : undefined;

  return {
    ...ref,
    base64,
    mime,
    originalBase64: ref.originalBase64 ?? ref.base64,
    originalMime: ref.originalMime ?? ref.mime,
    markupLayer,
  };
}

export function revertRefToOriginal(ref: RefImage): RefImage {
  if (!ref.originalBase64 && !ref.originalMime) return ref;
  return {
    ...ref,
    base64: ref.originalBase64 ?? ref.base64,
    mime: ref.originalMime ?? ref.mime,
    originalBase64: undefined,
    originalMime: undefined,
  };
}
