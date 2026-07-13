// Browser-side poster generation for library videos.
//
// The library grid used to paint a video card by mounting a live <video> with
// preload="metadata" — fetching video bytes just to show a still. A poster image
// removes that: we decode ONE representative frame at upload time (Mediabunny +
// WebCodecs, the same decode path the clip cutter uses), encode it as WebP, and
// persist it next to the asset. Cards then render an <img> and touch no video
// bytes until the viewer hovers to play.
//
// Everything here is fail-soft by contract: `generateVideoPoster` returns null
// instead of throwing, because a missing poster degrades a card, while a thrown
// error would lose the user's upload.

const POSTER_MAX_WIDTH = 640;
const POSTER_WEBP_QUALITY = 0.82;
// A frame from the very first moment of a clip is usually a fade-in, a black
// leader, or a title card mid-wipe. One second in is past that and still cheap
// to seek to. Short clips fall back to their midpoint.
const PREFERRED_POSTER_TIME_SEC = 1;

export const POSTER_WEBP_MIME = 'image/webp';
export const POSTER_JPEG_MIME = 'image/jpeg';

export type VideoPoster = {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  /** The timestamp (seconds) the frame was actually decoded at. */
  timestampSec: number;
};

// Pure: which timestamp to grab for a clip of `durationSec`. Non-finite or
// non-positive durations (a stream, a container without a duration) fall back to
// the preferred offset and let the decoder clamp.
export function posterTimestampSec(durationSec: number | null | undefined): number {
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) {
    return PREFERRED_POSTER_TIME_SEC;
  }
  if (durationSec <= PREFERRED_POSTER_TIME_SEC) return durationSec / 2;
  return PREFERRED_POSTER_TIME_SEC;
}

export function isVideoMimeType(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.startsWith('video/');
}

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

// CanvasSink yields an OffscreenCanvas off-DOM and an HTMLCanvasElement in it;
// they encode through different APIs, so normalize to one Blob here.
async function canvasToBlob(canvas: CanvasLike, mimeType: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: mimeType, quality });
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  );
  if (!blob) throw new Error(`canvas encode to ${mimeType} produced no blob`);
  return blob;
}

// WebP is universally encodable in the browsers we support, but a runtime that
// silently ignores the requested type hands back a PNG — which is 4-6x heavier.
// Detect that by the produced blob's own type and fall back to JPEG explicitly.
async function encodePoster(canvas: CanvasLike): Promise<{ blob: Blob; mimeType: string }> {
  const webp = await canvasToBlob(canvas, POSTER_WEBP_MIME, POSTER_WEBP_QUALITY);
  if (webp.type === POSTER_WEBP_MIME) return { blob: webp, mimeType: POSTER_WEBP_MIME };
  const jpeg = await canvasToBlob(canvas, POSTER_JPEG_MIME, POSTER_WEBP_QUALITY);
  return { blob: jpeg, mimeType: POSTER_JPEG_MIME };
}

// Decodes one frame of `file` and returns it as an encoded still. Null on any
// failure (no video track, unsupported codec, no WebCodecs) — the caller MUST
// treat a poster as optional.
export async function generateVideoPoster(file: Blob): Promise<VideoPoster | null> {
  try {
    const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import('mediabunny');

    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) return null;

      const durationSec = await track.computeDuration().catch(() => null);
      const wanted = posterTimestampSec(durationSec);

      const sink = new CanvasSink(track, { width: POSTER_MAX_WIDTH, fit: 'contain' });
      // A seek past the last keyframe-decodable moment yields null; frame 0
      // always exists, so it is the floor rather than a failure.
      const wrapped = (await sink.getCanvas(wanted)) ?? (await sink.getCanvas(0));
      if (!wrapped) return null;

      const { blob, mimeType } = await encodePoster(wrapped.canvas);
      return {
        blob,
        mimeType,
        width: wrapped.canvas.width,
        height: wrapped.canvas.height,
        timestampSec: wrapped.timestamp,
      };
    } finally {
      input.dispose();
    }
  } catch (error) {
    console.warn('[library/videoPoster] poster generation failed', error);
    return null;
  }
}

export const POSTER_FILE_NAME = 'thumb';

// Uploads the poster through the brand-guarded thumbnail route, which derives the
// storage path server-side and persists media.assets.thumbnail_path. Returns the
// persisted path, or null when the poster could not be stored — never throws, for
// the same reason as above.
export async function persistVideoPoster(params: {
  brandId: string;
  assetId: string;
  poster: VideoPoster;
}): Promise<string | null> {
  const { brandId, assetId, poster } = params;
  try {
    const extension = poster.mimeType === POSTER_JPEG_MIME ? 'jpg' : 'webp';
    const form = new FormData();
    form.append('brandId', brandId);
    form.append('assetId', assetId);
    form.append('poster', poster.blob, `${POSTER_FILE_NAME}.${extension}`);

    const response = await fetch('/api/library/thumbnail', { method: 'POST', body: form });
    if (!response.ok) {
      console.warn('[library/videoPoster] poster upload rejected', response.status);
      return null;
    }
    const body = (await response.json()) as { thumbnailPath?: unknown };
    return typeof body.thumbnailPath === 'string' ? body.thumbnailPath : null;
  } catch (error) {
    console.warn('[library/videoPoster] poster upload failed', error);
    return null;
  }
}

// The whole poster hop for one freshly-registered video asset. Fail-soft end to
// end: a poster that cannot be decoded, encoded, or stored leaves the asset
// exactly as it was.
export async function attachVideoPoster(params: {
  file: Blob;
  mimeType: string;
  brandId: string;
  assetId: string;
}): Promise<string | null> {
  if (!isVideoMimeType(params.mimeType)) return null;
  const poster = await generateVideoPoster(params.file);
  if (!poster) return null;
  return persistVideoPoster({ brandId: params.brandId, assetId: params.assetId, poster });
}
