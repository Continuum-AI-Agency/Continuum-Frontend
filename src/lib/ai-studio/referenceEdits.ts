import type { RefImage } from "@/lib/types/chatImage";

type MarkupResult = {
  base64: string;
  mime: string;
};

export function applyMarkupToRef(ref: RefImage, result: MarkupResult): RefImage {
  return {
    ...ref,
    base64: result.base64,
    mime: result.mime,
    originalBase64: ref.originalBase64 ?? ref.base64,
    originalMime: ref.originalMime ?? ref.mime,
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
