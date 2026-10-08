import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { request } from 'node:https';

// The deployed Render revision the local Backend exports on. Continuum Render is private
// and a laptop's ADC cannot mint a Cloud Run ID token, so a 127.0.0.1 proxy carries the
// operator's gcloud identity; the Backend's Render client sends no identity of its own to
// a loopback URL, so production code runs unmodified. The Node twin of the Backend's
// `_bench/renderHop.ts` (that one is Bun.serve, which Playwright's runner does not have),
// streaming both ways with no timeout: a 1080×1920 timeline render outlasts undici's 300 s.

const TOKEN_TTL_MS = 45 * 60_000;

export type RenderProxy = { url: string; target: string; stop: () => void };

export async function openRenderProxy(target: string): Promise<RenderProxy> {
  const base = new URL(target.replace(/\/+$/, ''));
  let token = '';
  let mintedAt = 0;
  const freshToken = () => {
    if (Date.now() - mintedAt > TOKEN_TTL_MS) {
      token = execFileSync('gcloud', ['auth', 'print-identity-token'], {
        encoding: 'utf8',
      }).trim();
      mintedAt = Date.now();
    }
    return token;
  };
  freshToken();
  const server: Server = createServer((incoming, outgoing) => {
    const headers = { ...incoming.headers, authorization: `Bearer ${freshToken()}` };
    delete headers.host;
    const upstream = request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port || 443,
        path: `${base.pathname.replace(/\/$/, '')}${incoming.url ?? '/'}`,
        method: incoming.method,
        headers,
      },
      (answer) => {
        outgoing.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(outgoing);
      },
    );
    upstream.on('error', (error) => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end(`render proxy: ${error.message}`);
    });
    incoming.pipe(upstream);
  });
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    target: base.origin,
    stop: () => server.close(),
  };
}
