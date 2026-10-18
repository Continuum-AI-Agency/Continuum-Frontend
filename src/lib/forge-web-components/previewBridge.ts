import {
  type WebComponentNode,
  type WebComponentOverride,
  webComponentNodeSchema,
} from '@continuum/contracts';

const CHANNEL = 'forge-web-component';
const RESPONSE_TIMEOUT_MS = 12_000;
const READY_TIMEOUT_MS = 20_000;

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number };

function withNonce(html: string, nonce: string): string {
  const escapedNonce = JSON.stringify(nonce).replaceAll('<', '\\u003c');
  const injection = `<script>window.__FORGE_NONCE__=${escapedNonce};</script>`;
  const head = /<head(?:\s[^>]*)?>/i;
  if (head.test(html)) return html.replace(head, (match) => `${match}${injection}`);
  return `${injection}${html}`;
}

export class ForgePreviewBridge {
  readonly nonce = crypto.randomUUID();
  private readonly pending = new Map<string, Pending>();
  private readonly listener: (event: MessageEvent) => void;
  private readySettled = false;
  private readyTimer: number | null = null;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;
  private readyResolve!: (nodes: WebComponentNode[]) => void;
  private readyReject!: (error: Error) => void;
  readonly ready: Promise<WebComponentNode[]>;

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly onNodes?: (nodes: WebComponentNode[]) => void,
    private readonly onError?: (error: Error) => void,
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.listener = (event) => this.receive(event);
    window.addEventListener('message', this.listener);
    this.readyTimer = window.setTimeout(() => {
      if (this.readySettled) return;
      this.readySettled = true;
      const error = new Error(
        'Preview did not become ready. Check component initialization and required assets.',
      );
      this.readyReject(error);
      this.onError?.(error);
    }, READY_TIMEOUT_MS);
  }

  load(html: string) {
    if (this.disposed) throw new Error('Preview frame has been closed');
    this.frame.setAttribute('sandbox', 'allow-scripts');
    this.frame.srcdoc = withNonce(html, this.nonce);
  }

  request<T>(method: string, params?: unknown): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('Preview frame has been closed'));
    const target = this.frame.contentWindow;
    if (!target) return Promise.reject(new Error('Preview frame is not available'));
    const id = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Preview did not respond to ${method}`));
      }, RESPONSE_TIMEOUT_MS);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      target.postMessage({ channel: CHANNEL, nonce: this.nonce, id, method, params }, '*');
    });
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposePromise = (async () => {
      const graceful = this.request('dispose').catch(() => undefined);
      await Promise.race([graceful, new Promise((resolve) => window.setTimeout(resolve, 500))]);
      this.disposed = true;
      window.removeEventListener('message', this.listener);
      if (!this.readySettled) {
        this.readySettled = true;
        if (this.readyTimer !== null) window.clearTimeout(this.readyTimer);
        this.readyReject(new Error('Preview was closed'));
      }
      for (const pending of this.pending.values()) {
        window.clearTimeout(pending.timer);
        pending.reject(new Error('Preview was closed'));
      }
      this.pending.clear();
      this.frame.srcdoc = '';
    })();
    return this.disposePromise;
  }

  private receive(event: MessageEvent) {
    if (event.source !== this.frame.contentWindow) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.channel !== CHANNEL || data.nonce !== this.nonce) return;
    if (data.event === 'ready') {
      if (this.readySettled) return;
      this.readySettled = true;
      if (this.readyTimer !== null) window.clearTimeout(this.readyTimer);
      const parsedNodes = webComponentNodeSchema.array().max(2000).safeParse(data.nodes);
      if (!parsedNodes.success) {
        const error = new Error('Preview returned an invalid scene description.');
        this.onError?.(error);
        this.readyReject(error);
        return;
      }
      const nodes = parsedNodes.data;
      this.onNodes?.(nodes);
      this.readyResolve(nodes);
      return;
    }
    if (data.event === 'error') {
      if (this.readySettled) {
        this.onError?.(new Error(typeof data.error === 'string' ? data.error : 'Preview failed'));
        return;
      }
      this.readySettled = true;
      if (this.readyTimer !== null) window.clearTimeout(this.readyTimer);
      const error = new Error(
        typeof data.error === 'string' ? data.error : 'Preview failed to initialize',
      );
      this.readyReject(error);
      this.onError?.(error);
      return;
    }
    if (typeof data.id !== 'string' || typeof data.ok !== 'boolean') return;
    const pending = this.pending.get(data.id);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    this.pending.delete(data.id);
    if (data.ok === true) pending.resolve(data.result);
    else
      pending.reject(
        new Error(typeof data.error === 'string' ? data.error : 'Preview command failed'),
      );
  }
}

export function applyPreviewOverrides(
  bridge: ForgePreviewBridge,
  overrides: WebComponentOverride[],
) {
  return bridge.request<WebComponentOverride[]>('applyOverrides', { overrides });
}
