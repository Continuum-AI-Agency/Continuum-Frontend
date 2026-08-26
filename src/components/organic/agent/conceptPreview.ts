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
 * Normalize one preview entry. The backend may deliver a signed storage URL, a base64
 * data URL, or (defensively) a bare base64 payload — all three must end up renderable.
 */
function normalizePreviewUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length === 0) return null;
  if (isRenderableUrl(value)) return value;
  return `data:image/png;base64,${value}`;
}

/**
 * EVERY frame a pipeline preview carries, not just the first. A carousel arrives as N
 * storyboard frames and a reel as its scene frames; returning one of them is what made a
 * carousel and a post look identical in the transcript. `imageUrl` leads because it is the
 * cover when both are present, and it is de-duplicated against `images`.
 */
export function resolveConceptPreviewUrls(preview: ConceptPreviewLike): string[] {
  if (!preview) return [];
  const candidates = [preview.imageUrl, ...(Array.isArray(preview.images) ? preview.images : [])];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const candidate of candidates) {
    const url = normalizePreviewUrl(candidate);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}
