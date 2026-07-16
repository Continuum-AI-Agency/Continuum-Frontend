import { describe, expect, it } from 'bun:test';
import {
  buildTusUploadMetadata,
  resolveTusUploadLocation,
  resumableStorageUpload,
  TUS_CHUNK_SIZE_BYTES,
} from './resumableStorageUpload';

function decodeMetadata(value: string): Record<string, string> {
  return Object.fromEntries(
    value.split(',').map((entry) => {
      const [key, encoded] = entry.split(' ');
      return [key, atob(encoded)];
    }),
  );
}

describe('resumableStorageUpload', () => {
  it('builds the Supabase TUS metadata without putting bytes in a request body', () => {
    expect(
      decodeMetadata(
        buildTusUploadMetadata({
          bucket: 'media-source',
          objectPath: 'brand/asset/project.aep',
          contentType: 'application/octet-stream',
        }),
      ),
    ).toEqual({
      bucketName: 'media-source',
      objectName: 'brand/asset/project.aep',
      contentType: 'application/octet-stream',
      cacheControl: '3600',
    });
  });

  it('resolves a relative Location header against the resumable endpoint', () => {
    expect(
      resolveTusUploadLocation('https://db.test/storage/v1/upload/resumable', '/upload/id'),
    ).toBe('https://db.test/upload/id');
  });

  it('uploads a project file in 6 MiB chunks and reports monotonic progress', async () => {
    const file = new File([new Uint8Array(TUS_CHUNK_SIZE_BYTES + 2)], 'project.aep');
    const calls: { method: string; bodySize: number }[] = [];
    const progress: number[] = [];
    let offset = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        calls.push({ method, bodySize: 0 });
        return new Response(null, { status: 201, headers: { location: '/upload/id' } });
      }
      if (method === 'PATCH') {
        const bodySize = (init?.body as Blob).size;
        calls.push({ method, bodySize });
        offset += bodySize;
        return new Response(null, { status: 204, headers: { 'upload-offset': String(offset) } });
      }
      throw new Error(`unexpected ${method}`);
    };

    await resumableStorageUpload({
      file,
      bucket: 'media-source',
      objectPath: 'brand/asset/project.aep',
      accessToken: 'jwt',
      supabaseUrl: 'https://db.test',
      fetchImpl,
      onProgress: ({ percentage }) => progress.push(percentage),
    });

    expect(calls).toEqual([
      { method: 'POST', bodySize: 0 },
      { method: 'PATCH', bodySize: TUS_CHUNK_SIZE_BYTES },
      { method: 'PATCH', bodySize: 2 },
    ]);
    expect(progress).toEqual([0, 100, 100]);
  });

  it('resumes from the server offset without creating a second upload', async () => {
    const file = new File([new Uint8Array(12)], 'project.aep');
    const methods: string[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const method = init?.method ?? 'GET';
      methods.push(method);
      if (method === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'upload-offset': '6' } });
      }
      if (method === 'PATCH') {
        return new Response(null, { status: 204, headers: { 'upload-offset': '12' } });
      }
      throw new Error(`unexpected ${method}`);
    };

    await resumableStorageUpload({
      file,
      bucket: 'media-source',
      objectPath: 'brand/asset/project.aep',
      accessToken: 'jwt',
      supabaseUrl: 'https://db.test',
      uploadUrl: 'https://db.test/upload/id',
      fetchImpl,
    });

    expect(methods).toEqual(['HEAD', 'PATCH']);
  });
});
