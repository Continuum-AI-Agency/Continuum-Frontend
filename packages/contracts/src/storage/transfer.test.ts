import { describe, expect, it } from 'bun:test';
import { parallelRangedDownload, resumableStorageUpload, TUS_CHUNK_SIZE_BYTES } from './transfer';

describe('resumableStorageUpload with a signed upload token', () => {
  it('uses the /sign endpoint and x-signature instead of a bearer', async () => {
    const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      calls.push({ url: String(input), method: init?.method ?? 'GET', headers });
      if (init?.method === 'POST') {
        return new Response(null, { status: 201, headers: { location: '/upload/abc' } });
      }
      return new Response(null, { status: 204, headers: { 'upload-offset': '3' } });
    }) as typeof fetch;

    await resumableStorageUpload({
      file: new Blob([new Uint8Array([1, 2, 3])]),
      bucket: 'media-library',
      objectPath: 'b/a/x.bin',
      accessToken: '',
      signature: 'signed-token',
      anonKey: 'anon',
      supabaseUrl: 'https://project.supabase.co',
      fetchImpl,
    });

    expect(calls[0].url).toBe('https://project.supabase.co/storage/v1/upload/resumable/sign');
    for (const call of calls) {
      expect(call.headers['x-signature']).toBe('signed-token');
      expect(call.headers.Authorization).toBeUndefined();
    }
  });
});

const source = new Uint8Array(8 * 1024 * 1024).map((_, i) => i % 251);
const CHUNK = 64 * 1024;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A fake Storage that streams `Range` slices in 64 KiB chunks, paced by `pace`. Coarse on
 * purpose: timer jitter on a loaded machine must stay a small fraction of every sample.
 */
function pacedStorage(pace: () => Promise<void>) {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const range = (init?.headers as Record<string, string>).Range;
    const [start, end] = range.replace('bytes=', '').split('-').map(Number);
    let offset = start;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (offset > end) return controller.close();
        await pace();
        controller.enqueue(source.slice(offset, Math.min(offset + CHUNK, end + 1)));
        offset += CHUNK;
      },
    });
    return new Response(body, { status: 206 });
  }) as typeof fetch;
}

async function download(fetchImpl: typeof fetch, onResume?: (offset: number) => void) {
  const target = new Uint8Array(source.length);
  const result = await parallelRangedDownload({
    url: 'https://storage/x',
    sizeBytes: source.length,
    parts: 4,
    minPartBytes: 768 * 1024,
    probeMs: 250,
    write: async (offset, bytes) => target.set(bytes, offset),
    onResume,
    fetchImpl,
  });
  return { target, streams: result.streams };
}

describe('parallelRangedDownload', () => {
  it('resumes a stream whose connection dropped, from its last byte', async () => {
    let dropped = false;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string>).Range;
      const [start, end] = range.replace('bytes=', '').split('-').map(Number);
      let body = source.slice(start, end + 1);
      if (!dropped) {
        dropped = true;
        body = body.slice(0, 1000);
      }
      return new Response(body, { status: 206 });
    }) as typeof fetch;
    const resumedAt: number[] = [];
    const { target } = await download(fetchImpl, (offset) => resumedAt.push(offset));
    expect(resumedAt).toEqual([1000]);
    expect(target).toEqual(source);
  });

  it('adds ranges when each connection is the bottleneck', async () => {
    const { target, streams } = await download(pacedStorage(() => sleep(20)));
    expect(target).toEqual(source);
    expect(streams).toBeGreaterThan(2);
  });

  it('stops adding ranges when the server caps the total', async () => {
    let gate = Promise.resolve();
    const shared = () => {
      gate = gate.then(() => sleep(20));
      return gate;
    };
    const { target, streams } = await download(pacedStorage(shared));
    expect(target).toEqual(source);
    expect(streams).toBeLessThanOrEqual(2);
  });

  it('resumes a killed download from its last checkpoint, fetching only what is missing', async () => {
    const big = new Uint8Array(20 * 1024 * 1024).map((_, i) => (i * 7) % 253);
    let served = 0;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string>).Range;
      const [start, end] = range.replace('bytes=', '').split('-').map(Number);
      const body = big.slice(start, end + 1);
      served += body.length;
      return new Response(body, { status: 206 });
    }) as typeof fetch;
    const disk = new Uint8Array(big.length);
    const killed = new AbortController();
    let saved: Array<{ start: number; end: number }> = [];
    await parallelRangedDownload({
      url: 'u',
      sizeBytes: big.length,
      parts: 1,
      write: (offset, bytes) => disk.set(bytes, offset),
      onCheckpoint: (missing) => {
        if (saved.length === 0) saved = missing;
        killed.abort();
      },
      signal: killed.signal,
      fetchImpl,
    }).catch(() => undefined);
    expect(saved).toEqual([{ start: 8 * 1024 * 1024, end: big.length - 1 }]);

    served = 0;
    await parallelRangedDownload({
      url: 'u',
      sizeBytes: big.length,
      ranges: saved,
      parts: 1,
      write: (offset, bytes) => disk.set(bytes, offset),
      fetchImpl,
    });
    expect(served).toBe(big.length - 8 * 1024 * 1024);
    expect(disk).toEqual(big);
  });

  it('refuses a server that ignores Range', async () => {
    const fetchImpl = (async () => new Response('x', { status: 200 })) as unknown as typeof fetch;
    await expect(
      parallelRangedDownload({ url: 'u', sizeBytes: 1, write: () => {}, fetchImpl }),
    ).rejects.toThrow('expected 206');
  });
});

describe('resumableStorageUpload through an outage', () => {
  /** A fake TUS server whose PATCHes fail `failures` times, then work. */
  function flakyTus(failures: number, failStatus = 0, goodPatchesFirst = 0) {
    let offset = 0;
    let good = 0;
    let failed = 0;
    const calls: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push(method);
      if (method === 'POST')
        return new Response(null, { status: 201, headers: { location: '/u/1' } });
      if (method === 'HEAD')
        return new Response(null, { status: 200, headers: { 'upload-offset': String(offset) } });
      if (good >= goodPatchesFirst && failed < failures) {
        failed += 1;
        if (failStatus) return new Response('no', { status: failStatus });
        throw new TypeError('socket connection was closed unexpectedly');
      }
      good += 1;
      offset += (init?.body as Blob).size;
      return new Response(null, { status: 204, headers: { 'upload-offset': String(offset) } });
    }) as typeof fetch;
    return { fetchImpl, calls };
  }
  const upload = (fetchImpl: typeof fetch, retryBudgetMs?: number) =>
    resumableStorageUpload({
      file: new Blob([new Uint8Array(1000)]),
      bucket: 'b',
      objectPath: 'p',
      accessToken: 't',
      supabaseUrl: 'https://project.supabase.co',
      fetchImpl,
      retryBudgetMs,
    });

  it('rides out five failed chunks in a row, re-reading the offset each time', async () => {
    const { fetchImpl, calls } = flakyTus(5);
    await upload(fetchImpl);
    expect(calls.filter((method) => method === 'HEAD')).toHaveLength(5);
  }, 20_000);

  it('resumes a dropped upload from the offset Storage reports, not from zero', async () => {
    const { fetchImpl } = flakyTus(1, 0, 1);
    const resumedAt: number[] = [];
    await resumableStorageUpload({
      file: new Blob([new Uint8Array(TUS_CHUNK_SIZE_BYTES + 10)]),
      bucket: 'b',
      objectPath: 'p',
      accessToken: 't',
      supabaseUrl: 'https://project.supabase.co',
      fetchImpl,
      onResume: (offset) => resumedAt.push(offset),
    });
    expect(resumedAt).toEqual([TUS_CHUNK_SIZE_BYTES]);
  });

  it('gives up once the outage outlasts the retry budget', async () => {
    const { fetchImpl } = flakyTus(100);
    await expect(upload(fetchImpl, 1_000)).rejects.toThrow('socket connection');
  });

  it('fails at once on a refusal no retry can fix', async () => {
    const { fetchImpl, calls } = flakyTus(1, 403);
    await expect(upload(fetchImpl)).rejects.toThrow('(403)');
    expect(calls.filter((method) => method === 'HEAD')).toHaveLength(0);
  });
});
