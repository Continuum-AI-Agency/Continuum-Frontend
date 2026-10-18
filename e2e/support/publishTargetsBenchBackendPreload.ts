// Loaded INTO the bench Backend (`bun --preload`, see publishTargetsBench.ts), before App/Index.ts.
//
// - Provider sockets: every publisher's default transport calls the global `fetch` at call time
//   (`transport.ts` → `defaultTransport`), so swapping `globalThis.fetch` here routes Instagram,
//   Facebook, LinkedIn, TikTok and YouTube to the Backend's own `recordingTransport` (the fake that
//   speaks their protocols). Loopback (local Supabase, local storage) passes through.
// - EVERY other host is refused with a 503 and counted: models, Upstash, X, analytics. The bench is
//   $0, makes no real provider call and never writes the production app cache, whatever path a
//   request takes. (Only `fetch` is covered: a client on raw node:https would go around it.)
// - adapt-caption's model (PostGenerator.adaptPlacementCopyToPlatform) is faked with mock.module.
// - Publish media URLs: local storage signs http://127.0.0.1 URLs and the publisher (rightly) hands
//   providers https only. The faked providers never fetch them, so the publish path's signatures
//   (the 24h TTL, used by stagingBucket alone) are presented as https, and the Backend's own
//   fetches of those URLs (LinkedIn reads the bytes back to upload them) go out as http again.
// - A loopback tap (PTB_TAP_PORT) lets the spec read the recorded provider calls and the NAMES of
//   any cache key (by name or by Redis/Upstash URL value) THIS process's live env still holds, and
//   serves the seeded account avatars.

import { mock } from 'bun:test';
import path from 'node:path';
import { liveCacheEnvKeys } from './publishTargetsBenchEnv';

type RecordedCall = { method: string; url: string; headers: Record<string, string>; body: unknown };
type Transport = { fetchImpl: typeof fetch; calls: RecordedCall[]; reset: () => void };

const backendDir = process.env.PTB_BACKEND_DIR ?? process.cwd();
const tapPort = Number(process.env.PTB_TAP_PORT);
const transportModule = path.join(backendDir, 'App/organic/publishing/recordingTransport.ts');
const { createRecordingTransport } = (await import(transportModule)) as {
  createRecordingTransport: () => Transport;
};

const transport = createRecordingTransport();
const refused: { url: string; at: string }[] = [];

// adapt-caption's model, faked at the seam CONTRACT.md names: the real module spread (a partial
// mock starves its other importers), only the copy rewrite replaced. Deterministic, $0, recorded.
type AdaptArgs = {
  placement: { copy?: Record<string, unknown> } & Record<string, unknown>;
  targetPlatform: string;
  placementId: string;
};
const adaptCalls: { targetPlatform: string; placementId: string; at: string }[] = [];
const postGeneratorModule = path.join(backendDir, 'App/organic/creation/postGenerator.ts');
const realPostGenerator = (await import(postGeneratorModule)) as {
  PostGenerator: new () => object;
};
class FakePostGenerator extends realPostGenerator.PostGenerator {
  async adaptPlacementCopyToPlatform({ placement, targetPlatform, placementId }: AdaptArgs) {
    adaptCalls.push({ targetPlatform, placementId, at: new Date().toISOString() });
    return {
      ...placement,
      copy: { ...placement.copy, caption: `[${targetPlatform}] adapted caption` },
    };
  }
}
mock.module(postGeneratorModule, () => ({
  ...realPostGenerator,
  PostGenerator: FakePostGenerator,
}));

// graph.instagram.com is listed although recordingTransport does not speak it: a call there then
// fails inside the fake instead of reaching Instagram.
const PROVIDER_HOST =
  /^(graph\.facebook\.com|graph\.instagram\.com|rupload\.facebook\.com|api\.linkedin\.com|li-upload\.example|business-api\.tiktok\.com|open\.tiktokapis\.com|www\.googleapis\.com|oauth2\.googleapis\.com)$/i;
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\]|::1)$/i;

const SUPABASE_ORIGIN = new URL(process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321').origin;
const SUPABASE_AS_HTTPS = SUPABASE_ORIGIN.replace(/^http:/, 'https:');
const PUBLISH_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;
type MintSignedUrl = (
  service: unknown,
  bucket: string,
  storagePath: string,
  ttlSeconds?: number,
) => Promise<string | null>;
const metadataSearchModule = path.join(backendDir, 'App/media/metadataSearch.ts');
const realMetadataSearch = (await import(metadataSearchModule)) as {
  mintMediaSignedUrl: MintSignedUrl;
};
// Captured BEFORE mock.module: Bun rewrites the namespace's live binding to the mock.
const realMint = realMetadataSearch.mintMediaSignedUrl;
const publishSignatures: string[] = [];
mock.module(metadataSearchModule, () => ({
  ...realMetadataSearch,
  async mintMediaSignedUrl(...args: Parameters<MintSignedUrl>) {
    const url = await realMint(...args);
    if (!url || args[3] !== PUBLISH_SIGNED_URL_TTL_SECONDS) return url;
    publishSignatures.push(`${args[1]}/${args[2]}`);
    return url.replace(SUPABASE_ORIGIN, SUPABASE_AS_HTTPS);
  },
}));

// TikTok re-serves the signed URL through our own media proxy, which checks it against the real
// Supabase origin: hand the proxy the URL as storage signed it.
const mediaProxyModule = path.join(backendDir, 'App/organic/publishing/mediaProxy.ts');
const realMediaProxy = (await import(mediaProxyModule)) as {
  buildProxiedMediaUrl: (stagedUrl: string) => string;
};
const realBuildProxiedMediaUrl = realMediaProxy.buildProxiedMediaUrl;
mock.module(mediaProxyModule, () => ({
  ...realMediaProxy,
  buildProxiedMediaUrl: (stagedUrl: string) =>
    realBuildProxiedMediaUrl(stagedUrl.replace(SUPABASE_AS_HTTPS, SUPABASE_ORIGIN)),
}));

const realFetch = globalThis.fetch.bind(globalThis);
let cacheAttemptsTotal = 0;
const urlOf = (input: Parameters<typeof fetch>[0]) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = urlOf(input);
  const host = new URL(url).hostname;
  if (url.startsWith(SUPABASE_AS_HTTPS)) {
    const local = SUPABASE_ORIGIN + url.slice(SUPABASE_AS_HTTPS.length);
    return realFetch(
      typeof input === 'object' && 'method' in input ? new Request(local, input) : local,
      init,
    );
  }
  if (LOOPBACK_HOST.test(host)) return realFetch(input, init);
  if (!PROVIDER_HOST.test(host)) {
    // Counted for the whole run (never reset, never capped): cell 0 at the end grades every
    // cache attempt made during cells 1-10, not only those since the last /reset.
    if (/upstash|redis/i.test(host)) cacheAttemptsTotal += 1;
    refused.push({
      url: `${new URL(url).origin}${new URL(url).pathname}`,
      at: new Date().toISOString(),
    });
    if (refused.length > 500) refused.shift();
    return new Response(JSON.stringify({ error: 'refused by organic:publish-targets bench' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
  const requestInit =
    typeof input === 'object' && 'method' in input && !init
      ? { method: input.method, headers: input.headers }
      : init;
  return transport.fetchImpl(url, requestInit);
}) as typeof fetch;

// A 1×1 PNG: enough for an <img> to decode; the bench checks which URL is shown, not pixels.
const AVATAR = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

if (Number.isInteger(tapPort) && tapPort > 0) {
  Bun.serve({
    hostname: '127.0.0.1',
    port: tapPort,
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === '/calls') {
        return Response.json({ calls: transport.calls, refused, adaptCalls, publishSignatures });
      }
      if (pathname === '/reset' && request.method === 'POST') {
        transport.reset();
        refused.length = 0;
        adaptCalls.length = 0;
        publishSignatures.length = 0;
        return Response.json({ ok: true });
      }
      if (pathname === '/env') {
        return Response.json({
          pid: process.pid,
          redisKeysSet: liveCacheEnvKeys(process.env),
          refused,
          cacheAttemptsTotal,
        });
      }
      if (pathname.startsWith('/avatar/')) {
        return new Response(AVATAR, {
          headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' },
        });
      }
      return new Response('not found', { status: 404 });
    },
  });
}
