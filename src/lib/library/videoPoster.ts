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
  /** Dimensions of the POSTER image (downscaled to POSTER_MAX_WIDTH), not the source. */
  width: number;
  height: number;
  /** The timestamp (seconds) the frame was actually decoded at. */
  timestampSec: number;
  /**
   * Source metadata read straight from the container header — the true display
   * dimensions (rotation-aware) and duration of the uploaded file, NOT the poster.
   * These populate media.assets.width/height/duration_ms, which the library browse
   * read model sorts on; without them `duration_desc` is a no-op. Null when the
   * header could not be read — a poster is still returned, metadata is best-effort.
   */
  sourceWidth: number | null;
  sourceHeight: number | null;
  durationMs: number | null;
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

// Pure: which timestamp to decode when the caller (the frame picker) asks for a
// specific moment. A requested time is clamped into the clip, so a scrubber that
// overshoots the real duration still lands on the last decodable frame; absent a
// request, the automatic offset stands.
export function resolvePosterTimestamp(
  durationSec: number | null | undefined,
  requestedSec?: number | null,
): number {
  if (typeof requestedSec !== 'number' || !Number.isFinite(requestedSec)) {
    return posterTimestampSec(durationSec);
  }
  // An unknown duration leaves the upper bound open (the decoder clamps a seek
  // past the last frame); the lower bound of 0 always applies.
  const upper =
    typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0
      ? durationSec
      : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(requestedSec, 0), upper);
}

// Explicit fallback for legacy/AI videos that predate persisted posters. A
// metadata-only <video> often paints its blank first frame; seeking asks the
// browser for one representative frame without pretending a poster exists.
export function seekVideoPreviewFrame(video: { duration: number; currentTime: number }): boolean {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return false;
  try {
    video.currentTime = posterTimestampSec(video.duration);
    return true;
  } catch {
    return false;
  }
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
async function encodePoster(
  canvas: CanvasLike,
  quality = POSTER_WEBP_QUALITY,
): Promise<{ blob: Blob; mimeType: string }> {
  const webp = await canvasToBlob(canvas, POSTER_WEBP_MIME, quality);
  if (webp.type === POSTER_WEBP_MIME) return { blob: webp, mimeType: POSTER_WEBP_MIME };
  const jpeg = await canvasToBlob(canvas, POSTER_JPEG_MIME, quality);
  return { blob: jpeg, mimeType: POSTER_JPEG_MIME };
}

export type VideoFrameSelector = 'first' | 'last' | 'timestamp';

export function resolveVideoFrameTimestamp(
  durationSec: number | null | undefined,
  selector: VideoFrameSelector,
  requestedSec?: number | null,
): number {
  if (selector === 'first') return 0;
  if (selector === 'timestamp') return resolvePosterTimestamp(durationSec, requestedSec);
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }
  // Seeking to duration itself is outside the media interval. One 30fps frame
  // inside the boundary reliably resolves the visible last frame.
  return Math.max(0, durationSec - 1 / 30);
}

export function evidenceFrameTimestamps(
  durationSec: number | null | undefined,
  maxFrames = 3,
): number[] {
  const limit = Math.max(1, Math.min(3, Math.floor(maxFrames)));
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0) {
    return [0];
  }
  const last = resolveVideoFrameTimestamp(durationSec, 'last');
  const candidates = limit === 1 ? [0] : limit === 2 ? [0, last] : [0, durationSec / 2, last];
  return [...new Set(candidates.map((value) => Math.max(0, Number(value.toFixed(3)))))];
}

export type VideoEvidenceFrame = Pick<
  VideoPoster,
  'blob' | 'mimeType' | 'width' | 'height' | 'timestampSec'
>;

/**
 * Decode first/middle/last visual evidence in one Mediabunny input session.
 * This is the bounded browser perception path for Canvas editor commands; it
 * never runs on the Backend and never uploads the source video.
 */
export async function generateVideoEvidenceFrames(
  file: Blob,
  options?: { maxFrames?: number; maxWidth?: number; quality?: number },
): Promise<VideoEvidenceFrame[]> {
  try {
    const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) return [];
      const durationSec = await track.computeDuration().catch(() => null);
      const timestamps = evidenceFrameTimestamps(durationSec, options?.maxFrames ?? 3);
      const sink = new CanvasSink(track, {
        width: Math.max(64, Math.min(640, Math.round(options?.maxWidth ?? 320))),
        fit: 'contain',
        poolSize: 1,
      });
      const frames: VideoEvidenceFrame[] = [];
      for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
        if (!wrapped) continue;
        const { blob, mimeType } = await encodePoster(
          wrapped.canvas,
          Math.max(0.1, Math.min(1, options?.quality ?? 0.68)),
        );
        frames.push({
          blob,
          mimeType,
          width: wrapped.canvas.width,
          height: wrapped.canvas.height,
          timestampSec: wrapped.timestamp,
        });
      }
      return frames;
    } finally {
      input.dispose();
    }
  } catch (error) {
    console.warn('[library/videoPoster] evidence extraction failed', error);
    return [];
  }
}

// Decodes one frame of `file` and returns it as an encoded still. Null on any
// failure (no video track, unsupported codec, no WebCodecs) — the caller MUST
// treat a poster as optional. `timestampSec` picks a specific moment (the frame
// picker's chosen frame); omitted, the automatic offset is used.
export async function generateVideoPoster(
  file: Blob,
  options?: {
    timestampSec?: number;
    selector?: VideoFrameSelector;
    maxWidth?: number;
    quality?: number;
  },
): Promise<VideoPoster | null> {
  try {
    const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import('mediabunny');

    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) return null;

      const durationSec = await track.computeDuration().catch(() => null);
      const wanted = options?.selector
        ? resolveVideoFrameTimestamp(durationSec, options.selector, options.timestampSec)
        : resolvePosterTimestamp(durationSec, options?.timestampSec);

      // Source metadata off the already-open track. getDisplayWidth/Height are
      // rotation- and aspect-corrected, so a 1920x1080 file shot vertical reports
      // 1080x1920 — the shape the aspect facet must bucket on. Each is independently
      // fail-soft: a header that yields a poster but no clean dimension still ships
      // the poster.
      const [sourceWidth, sourceHeight] = await Promise.all([
        track.getDisplayWidth().catch(() => null),
        track.getDisplayHeight().catch(() => null),
      ]);
      const durationMs =
        typeof durationSec === 'number' && Number.isFinite(durationSec)
          ? Math.round(durationSec * 1000)
          : null;

      const sink = new CanvasSink(track, {
        width: Math.max(64, Math.min(4096, Math.round(options?.maxWidth ?? POSTER_MAX_WIDTH))),
        fit: 'contain',
      });
      // A seek past the last keyframe-decodable moment yields null; frame 0
      // always exists, so it is the floor rather than a failure.
      const wrapped = (await sink.getCanvas(wanted)) ?? (await sink.getCanvas(0));
      if (!wrapped) return null;

      const { blob, mimeType } = await encodePoster(
        wrapped.canvas,
        Math.max(0.1, Math.min(1, options?.quality ?? POSTER_WEBP_QUALITY)),
      );
      return {
        blob,
        mimeType,
        width: wrapped.canvas.width,
        height: wrapped.canvas.height,
        timestampSec: wrapped.timestamp,
        sourceWidth,
        sourceHeight,
        durationMs,
      };
    } finally {
      input.dispose();
    }
  } catch (error) {
    console.warn('[library/videoPoster] poster generation failed', error);
    return null;
  }
}

/**
 * Source duration in seconds, read off the container without decoding a frame.
 *
 * Sent with `register` so analyze_media can skip long-form video: that function
 * receives bytes and cannot cheaply learn a duration from them, whereas the browser
 * already has the decoded file in hand.
 *
 * Fail-soft, like everything else on the upload path — null on an unsupported
 * container, a missing video track, or a header carrying no duration. A null only
 * means the long-form skip cannot be applied; it never fails the upload.
 */
export async function probeVideoDurationSec(file: Blob): Promise<number | null> {
  try {
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) return null;
      const durationSec = await track.computeDuration().catch(() => null);
      return typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0
        ? durationSec
        : null;
    } finally {
      input.dispose();
    }
  } catch (error) {
    console.warn('[library/videoPoster] duration probe failed', error);
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
    // Source metadata rides along with the poster so the route can backfill
    // media.assets.width/height/duration_ms in the same brand-guarded write.
    if (poster.sourceWidth !== null) form.append('sourceWidth', String(poster.sourceWidth));
    if (poster.sourceHeight !== null) form.append('sourceHeight', String(poster.sourceHeight));
    if (poster.durationMs !== null) form.append('durationMs', String(poster.durationMs));

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
