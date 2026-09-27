// Resumable Storage transfer — the one TUS client and the one ranged downloader.
//
// Lifted from Continuum-Frontend/src/lib/library/resumableStorageUpload.ts (same export
// names, same behaviour) so the browser, the Backend's WebDAV PUT and the `continuum` CLI
// share a single implementation. Two widenings, both backwards compatible:
//   * `file` is any Blob (a browser File, a Bun file, a Buffer-backed Blob);
//   * `signature` uploads against a signed upload token (createSignedUploadUrl) through
//     `/upload/resumable/sign` + `x-signature`, so a desktop client never holds a user JWT.
// Dependency-free: fetch, Blob, TextEncoder and btoa exist in browsers, Bun and Node 22.

const TUS_VERSION = '1.0.0';
export const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
const RETRY_DELAYS_MS = [250, 1_000, 3_000] as const;

export type ResumableUploadProgress = {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
};

export type ResumableStorageUploadParams = {
  file: Blob;
  /** Overrides `file.type` — for a file spooled to disk whose type is known only later. */
  contentType?: string;
  bucket: string;
  objectPath: string;
  /** User JWT or service-role key. Ignored when `signature` is set. */
  accessToken: string;
  supabaseUrl: string;
  anonKey?: string;
  /** A signed upload token from createSignedUploadUrl; replaces bearer auth. */
  signature?: string;
  upsert?: boolean;
  uploadUrl?: string | null;
  signal?: AbortSignal;
  onUploadUrl?: (url: string) => void;
  onProgress?: (progress: ResumableUploadProgress) => void;
  fetchImpl?: typeof fetch;
};

function encodeMetadataValue(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildTusUploadMetadata(params: {
  bucket: string;
  objectPath: string;
  contentType: string;
}): string {
  return [
    ['bucketName', params.bucket],
    ['objectName', params.objectPath],
    ['contentType', params.contentType],
    ['cacheControl', '3600'],
  ]
    .map(([key, value]) => `${key} ${encodeMetadataValue(value)}`)
    .join(',');
}

export function resolveTusUploadLocation(endpoint: string, location: string): string {
  return new URL(location, endpoint).toString();
}

function authHeaders(params: ResumableStorageUploadParams): Record<string, string> {
  const headers: Record<string, string> = params.signature
    ? { 'x-signature': params.signature }
    : { Authorization: `Bearer ${params.accessToken}` };
  if (params.anonKey) headers.apikey = params.anonKey;
  return headers;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Upload paused', 'AbortError');
}

async function createUpload(
  endpoint: string,
  params: ResumableStorageUploadParams,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      ...authHeaders(params),
      'Tus-Resumable': TUS_VERSION,
      'Upload-Length': String(params.file.size),
      'Upload-Metadata': buildTusUploadMetadata({
        bucket: params.bucket,
        objectPath: params.objectPath,
        contentType: params.contentType || params.file.type || 'application/octet-stream',
      }),
      'x-upsert': params.upsert ? 'true' : 'false',
    },
    signal: params.signal,
  });
  if (!response.ok) throw new Error(`resumable upload creation failed (${response.status})`);
  const location = response.headers.get('location');
  if (!location) throw new Error('resumable upload did not return a location');
  return resolveTusUploadLocation(endpoint, location);
}

async function readOffset(
  uploadUrl: string,
  params: ResumableStorageUploadParams,
  fetchImpl: typeof fetch,
): Promise<number> {
  const response = await fetchImpl(uploadUrl, {
    method: 'HEAD',
    headers: { ...authHeaders(params), 'Tus-Resumable': TUS_VERSION },
    signal: params.signal,
  });
  if (!response.ok) throw new Error(`resumable upload resume failed (${response.status})`);
  const raw = response.headers.get('upload-offset');
  const offset = raw === null ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > params.file.size) {
    throw new Error('resumable upload returned an invalid offset');
  }
  return offset;
}

async function patchChunk(
  uploadUrl: string,
  offset: number,
  params: ResumableStorageUploadParams,
  fetchImpl: typeof fetch,
): Promise<number> {
  const end = Math.min(offset + TUS_CHUNK_SIZE_BYTES, params.file.size);
  const response = await fetchImpl(uploadUrl, {
    method: 'PATCH',
    headers: {
      ...authHeaders(params),
      'Tus-Resumable': TUS_VERSION,
      'Upload-Offset': String(offset),
      'Content-Type': 'application/offset+octet-stream',
    },
    body: params.file.slice(offset, end),
    signal: params.signal,
  });
  if (!response.ok) throw new Error(`resumable upload chunk failed (${response.status})`);
  const nextRaw = response.headers.get('upload-offset');
  const nextOffset = nextRaw === null ? end : Number(nextRaw);
  if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > params.file.size) {
    throw new Error('resumable upload returned an invalid chunk offset');
  }
  return nextOffset;
}

function reportProgress(params: ResumableStorageUploadParams, uploadedBytes: number): void {
  params.onProgress?.({
    uploadedBytes,
    totalBytes: params.file.size,
    percentage: params.file.size === 0 ? 100 : Math.round((uploadedBytes / params.file.size) * 100),
  });
}

async function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Upload paused', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Upload a Blob directly to Supabase Storage's TUS endpoint in bounded chunks. */
export async function resumableStorageUpload(
  params: ResumableStorageUploadParams,
): Promise<{ uploadUrl: string }> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const base = `${params.supabaseUrl.replace(/\/+$/, '')}/storage/v1/upload/resumable`;
  const endpoint = params.signature ? `${base}/sign` : base;
  throwIfAborted(params.signal);

  let uploadUrl = params.uploadUrl ?? null;
  let offset = 0;
  if (uploadUrl) {
    offset = await readOffset(uploadUrl, params, fetchImpl);
  } else {
    uploadUrl = await createUpload(endpoint, params, fetchImpl);
    params.onUploadUrl?.(uploadUrl);
  }
  reportProgress(params, offset);

  while (offset < params.file.size) {
    throwIfAborted(params.signal);
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        offset = await patchChunk(uploadUrl, offset, params, fetchImpl);
        reportProgress(params, offset);
        lastError = null;
        break;
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') throw error;
        lastError = error;
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        await wait(delay, params.signal);
        offset = await readOffset(uploadUrl, params, fetchImpl);
        reportProgress(params, offset);
      }
    }
    if (lastError) throw lastError;
  }

  return { uploadUrl };
}

// ─── Adaptive ranged download ──────────────────────────────────────────────────

export type ByteRange = { start: number; end: number };

export type ParallelRangedDownloadParams = {
  url: string;
  sizeBytes: number;
  /** Positional write of one coalesced block; ranges complete out of order. */
  write: (offset: number, bytes: Uint8Array) => Promise<void> | void;
  /** Inclusive ranges still missing — from a checkpoint, to resume. Default: the whole file. */
  ranges?: ByteRange[];
  /** Called after every block reaches `write`, with every range still missing on disk. */
  onCheckpoint?: (missing: ByteRange[]) => void;
  /** The most concurrent ranges it may grow to. */
  parts?: number;
  /** A range is only split while at least twice this many bytes remain in it. */
  minPartBytes?: number;
  /** How long each throughput measurement runs before deciding whether to add a range. */
  probeMs?: number;
  signal?: AbortSignal;
  onProgress?: (downloadedBytes: number) => void;
  fetchImpl?: typeof fetch;
};

/** The trial second range must beat one stream by this much before any more are added. */
const TRIAL_GAIN = 1.4;
/** Every later split must raise measured throughput by this much, or growth stops. */
const SCALING_GAIN = 1.2;
/**
 * Network chunks (~32–40 KiB each) are coalesced into blocks this size before they are
 * written: measured on the compiled CLI, one write per chunk cost 10–40% of throughput,
 * one per 8 MiB block matched a single curl stream. Awaiting a block write is cheap, and
 * it is what lets a checkpoint claim a byte is on disk.
 */
const WRITE_BLOCK_BYTES = 8 * 1024 * 1024;

/** `written` is on disk; `cursor` is received; `end` shrinks when a split takes the tail. */
type Segment = { written: number; cursor: number; end: number };

/**
 * Download `url` with HTTP Range requests, starting from ONE stream. It measures single-
 * stream throughput, then tries one small extra range and keeps adding ranges only while
 * they measurably raise throughput — so on a link where the server caps the client's total
 * it stays at one or two streams and is never slower than a plain download, and on a link
 * where each connection is the bottleneck it grows up to `parts`.
 *
 * A range whose connection drops resumes from its last byte; with `ranges` and
 * `onCheckpoint` a killed download resumes from what reached the disk.
 */
export async function parallelRangedDownload(
  params: ParallelRangedDownloadParams,
): Promise<{ streams: number; scaled: boolean | null }> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const maxStreams = Math.max(1, params.parts ?? 8);
  const minSplitBytes = params.minPartBytes ?? 8 << 20;
  const probeMs = params.probeMs ?? 500;
  const initial = (params.ranges ?? [{ start: 0, end: params.sizeBytes - 1 }]).filter(
    (range) => range.end >= range.start,
  );
  if (initial.length === 0) return { streams: 0, scaled: null };
  // Whether a second range added throughput: null when no trial ran (too small, or parts=1).
  let scaled: boolean | null = null;
  let downloaded = 0;

  const segments: Segment[] = initial.map((range) => ({
    written: range.start,
    cursor: range.start,
    end: range.end,
  }));
  /** Ranges from a checkpoint that no stream has picked up yet. */
  const queue = segments.slice(1);
  const checkpoint = () =>
    params.onCheckpoint?.(
      segments
        .filter((segment) => segment.written <= segment.end)
        .map((segment) => ({ start: segment.written, end: segment.end })),
    );

  const runSegment = async (segment: Segment, onFirstByte: () => void): Promise<void> => {
    let block = new Uint8Array(Math.min(WRITE_BLOCK_BYTES, segment.end - segment.cursor + 1));
    let fill = 0;
    let blockOffset = segment.cursor;
    // Double-buffered: a block is written while the next one downloads. `written` — and the
    // checkpoint — only advance when a write resolves, in order, so a checkpoint never
    // claims a byte the disk does not have. The reader waits only if the disk falls a
    // whole block behind.
    let writing: Promise<void> = Promise.resolve();
    const flush = async () => {
      if (fill === 0) return;
      const bytes = block.subarray(0, fill);
      const at = blockOffset;
      blockOffset += fill;
      fill = 0;
      block = new Uint8Array(block.length);
      const previous = writing;
      writing = (async () => {
        await previous;
        await params.write(at, bytes);
        segment.written = at + bytes.length;
        checkpoint();
      })();
      await previous;
    };

    for (let attempt = 0; segment.cursor <= segment.end; attempt += 1) {
      throwIfAborted(params.signal);
      try {
        const response = await fetchImpl(params.url, {
          headers: { Range: `bytes=${segment.cursor}-${segment.end}` },
          signal: params.signal,
        });
        if (response.status !== 206 || !response.body) {
          throw new Error(`ranged download expected 206, got ${response.status}`);
        }
        const reader = response.body.getReader();
        while (segment.cursor <= segment.end) {
          throwIfAborted(params.signal);
          const { done, value } = await reader.read();
          if (done) break;
          onFirstByte();
          let bytes = value.subarray(0, Math.min(value.length, segment.end - segment.cursor + 1));
          segment.cursor += bytes.length;
          downloaded += bytes.length;
          params.onProgress?.(downloaded);
          while (bytes.length > 0) {
            const room = block.length - fill;
            block.set(bytes.subarray(0, room), fill);
            fill += Math.min(room, bytes.length);
            bytes = bytes.subarray(room);
            if (fill === block.length) await flush();
          }
        }
        await reader.cancel().catch(() => undefined);
        if (segment.cursor <= segment.end) throw new Error('ranged download ended early');
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') throw error;
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) throw error;
        await flush();
        await wait(delay, params.signal);
      }
    }
    await flush();
    await writing;
  };

  const running: Promise<void>[] = [];
  /** One stream: its segment, then whatever checkpointed ranges are still queued. */
  const startStream = (first: Segment) => {
    let firstByte = () => {};
    const arrived = new Promise<void>((resolve) => {
      firstByte = resolve;
    });
    const finished = (async () => {
      for (let segment: Segment | undefined = first; segment; segment = queue.shift()) {
        await runSegment(segment, firstByte);
      }
    })();
    running.push(finished);
    return { arrived, finished };
  };
  startStream(segments[0]);

  let settled = false;
  const all = (async () => {
    // New streams can start while earlier ones run; wait until the list stops growing.
    for (let count = 0; count !== running.length; ) {
      count = running.length;
      await Promise.all(running.slice(0, count));
    }
    settled = true;
  })();

  let lastBytes = 0;
  let lastAt = performance.now();
  /** Throughput over the next window, or null once the download has finished. */
  const measure = async (): Promise<number | null> => {
    await Promise.race([all, new Promise((resolve) => setTimeout(resolve, probeMs))]);
    if (settled) return null;
    const now = performance.now();
    const rate = (downloaded - lastBytes) / Math.max(1, now - lastAt);
    lastBytes = downloaded;
    lastAt = now;
    return rate;
  };
  /** A new stream: a queued checkpoint range if any, else the tail of the widest active one. */
  const split = (bytes?: number) => {
    if (running.length >= maxStreams) return null;
    const queued = queue.shift();
    if (queued) return startStream(queued);
    const widest = segments
      .filter((segment) => segment.cursor <= segment.end)
      .reduce<Segment | null>((a, b) => (!a || b.end - b.cursor > a.end - a.cursor ? b : a), null);
    if (!widest) return null;
    const remaining = widest.end - widest.cursor + 1;
    if (remaining < 2 * minSplitBytes) return null;
    // The new range takes the tail: `bytes` of it, or half — never more than half.
    const take = Math.min(bytes ?? remaining, Math.floor(remaining / 2));
    const cut = widest.end + 1 - take;
    const tail: Segment = { written: cut, cursor: cut, end: widest.end };
    segments.push(tail);
    widest.end = cut - 1;
    return startStream(tail);
  };

  // One stream first. Throughput keeps climbing for a while (TCP and the CDN ramp up), so
  // the baseline is the single-stream window immediately before the trial — an earlier one
  // would make plain ramp-up look like scaling.
  if ((await measure()) !== null && (await measure()) !== null) {
    const baseline = (await measure()) ?? 0;
    // Trial: a second range takes one small block of the tail. It is judged only over the
    // time both streams are actually receiving, so it can stay small — on a link where the
    // server caps the client's total, the experiment costs one short overlap and no more.
    const trial = baseline > 0 ? split(minSplitBytes) : null;
    if (trial) {
      await Promise.race([trial.arrived, trial.finished, all]);
      const overlapStart = performance.now();
      const bytesAtStart = downloaded;
      await Promise.race([
        trial.finished,
        all,
        new Promise((resolve) => setTimeout(resolve, probeMs)),
      ]);
      const overlapMs = performance.now() - overlapStart;
      const overlapRate = (downloaded - bytesAtStart) / Math.max(1, overlapMs);
      if (!settled && overlapMs >= probeMs / 2) scaled = overlapRate >= baseline * TRIAL_GAIN;
      if (scaled) {
        let best = overlapRate;
        lastBytes = downloaded;
        lastAt = performance.now();
        // Scaling: keep splitting while each split still adds throughput.
        while (split()) {
          // Skip the window the new range spends connecting, then judge.
          const rate = (await measure()) === null ? null : await measure();
          if (rate === null || rate < best * SCALING_GAIN) break;
          best = rate;
        }
      }
    }
  }

  await all;
  return { streams: running.length, scaled };
}
