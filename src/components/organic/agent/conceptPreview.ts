export type ConceptPreviewLike =
  | {
      imageUrl?: string | null;
      images?: string[] | null;
    }
  | null
  | undefined;

const isRenderableUrl = (value: string): boolean =>
  value.startsWith('data:') ||
  value.startsWith('https://') ||
  value.startsWith('http://') ||
  value.startsWith('blob:');

/**
 * Resolve a renderable <img> src from a pipeline-card preview. The backend may
 * deliver a signed storage URL, a base64 data URL, or (defensively) a bare
 * base64 payload — normalize all three so the concept preview never renders
 * blank once media is available.
 */
export function resolveConceptPreviewUrl(preview: ConceptPreviewLike): string | null {
  if (!preview) return null;
  const raw =
    preview.imageUrl ??
    (Array.isArray(preview.images) && preview.images.length > 0 ? preview.images[0] : null);
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  if (isRenderableUrl(value)) return value;
  // Bare base64 (no data: prefix) — wrap it so the browser can decode it.
  return `data:image/png;base64,${value}`;
}
