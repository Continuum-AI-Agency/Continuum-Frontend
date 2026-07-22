import type { RegisterCanvasAssetRequest } from '@continuum/contracts';
import { attachVideoPoster } from '@/lib/library/videoPoster';

type RegisterCanvasOutputOptions = {
  videoSource?: string | Blob;
  fetchImpl?: typeof fetch;
  attachPoster?: typeof attachVideoPoster;
};

// Fire-and-forget registration of a canvas creation into the media library.
// Swallows errors: a failed registration must never disrupt the generation
// flow. Returns the new (or existing) media.assets id, or null.
export async function registerCanvasOutput(
  input: RegisterCanvasAssetRequest,
  options: RegisterCanvasOutputOptions = {},
): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let assetId: string | null;
  try {
    const resp = await fetchImpl('/api/library/register-canvas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { assetId?: string | null };
    assetId = data.assetId ?? null;
  } catch (err) {
    console.warn('[registerCanvasOutput] failed', err);
    return null;
  }

  if (!assetId || input.kind !== 'video' || !options.videoSource) return assetId;

  try {
    const file =
      options.videoSource instanceof Blob
        ? options.videoSource
        : await fetchImpl(options.videoSource).then((response) => {
            if (!response.ok) throw new Error(`video download failed (${response.status})`);
            return response.blob();
          });
    await (options.attachPoster ?? attachVideoPoster)({
      file,
      mimeType: input.mimeType,
      brandId: input.brandProfileId,
      assetId,
    });
  } catch (err) {
    // Registration already succeeded. Poster extraction is a browser-only,
    // fail-soft enhancement and must never turn a generated asset into a failure.
    console.warn('[registerCanvasOutput] poster backfill failed', err);
  }

  return assetId;
}
