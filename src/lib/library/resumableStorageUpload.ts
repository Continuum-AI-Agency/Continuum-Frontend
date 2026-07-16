const TUS_VERSION = '1.0.0';
export const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
const RETRY_DELAYS_MS = [250, 1_000, 3_000] as const;

export type ResumableUploadProgress = {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
};

export type ResumableStorageUploadParams = {
  file: File;
  bucket: string;
  objectPath: string;
  accessToken: string;
  supabaseUrl: string;
  anonKey?: string;
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

function authHeaders(accessToken: string, anonKey?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(anonKey ? { apikey: anonKey } : {}),
  };
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
      ...authHeaders(params.accessToken, params.anonKey),
      'Tus-Resumable': TUS_VERSION,
      'Upload-Length': String(params.file.size),
      'Upload-Metadata': buildTusUploadMetadata({
        bucket: params.bucket,
        objectPath: params.objectPath,
        contentType: params.file.type || 'application/octet-stream',
      }),
      'x-upsert': 'false',
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
    headers: {
      ...authHeaders(params.accessToken, params.anonKey),
      'Tus-Resumable': TUS_VERSION,
    },
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
      ...authHeaders(params.accessToken, params.anonKey),
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

/** Upload a File directly to Supabase Storage's TUS endpoint in bounded chunks. */
export async function resumableStorageUpload(
  params: ResumableStorageUploadParams,
): Promise<{ uploadUrl: string }> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const endpoint = `${params.supabaseUrl.replace(/\/+$/, '')}/storage/v1/upload/resumable`;
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
