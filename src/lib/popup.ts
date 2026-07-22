export function openCenteredPopup(
  url: string,
  title: string,
  width = 480,
  height = 640,
): Window | null {
  const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
  const dualScreenTop = window.screenTop !== undefined ? window.screenTop : window.screenY;

  const w = window.innerWidth || document.documentElement.clientWidth || screen.width;
  const h = window.innerHeight || document.documentElement.clientHeight || screen.height;

  const systemZoom = w / window.screen.availWidth;
  const left = (w - width) / 2 / systemZoom + dualScreenLeft;
  const top = (h - height) / 2 / systemZoom + dualScreenTop;

  const features = [
    `scrollbars=yes`,
    `resizable=yes`,
    `width=${width}`,
    `height=${height}`,
    `top=${top}`,
    `left=${left}`,
  ].join(',');

  const win = window.open(url, title, features);
  if (win && win.focus) win.focus();
  return win;
}

type PopupMessageOptions<T> = {
  timeoutMs?: number;
  predicate?: (message: T) => boolean;
  signal?: AbortSignal;
};

export function waitForPopupMessage<T = unknown>(
  expectedType: string,
  options?: PopupMessageOptions<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutMs = options?.timeoutMs ?? 120000;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Popup timed out'));
    }, timeoutMs);

    const onAbort = () => {
      cleanup();
      reject(new Error('Popup wait aborted'));
    };
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        return reject(new Error('Popup wait aborted'));
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    function onMessage(event: MessageEvent) {
      try {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { type?: string } | undefined;
        if (!data || data.type !== expectedType) return;
        const payload = event.data as T;
        if (options?.predicate && !options.predicate(payload)) {
          return;
        }
        cleanup();
        resolve(payload);
      } catch {
        // ignore and continue listening
      }
    }

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
    }

    window.addEventListener('message', onMessage);
  });
}

// Shared with the callback pages (integrations/callback + oauth/callback) that
// broadcast completion on this channel. BroadcastChannel delivery does not
// depend on `window.opener`, so it survives Google's own
// `Cross-Origin-Opener-Policy: same-origin` header severing the opener link.
export const OAUTH_BROADCAST_CHANNEL_NAME = 'continuum-oauth';

function supportsBroadcastChannel(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

export function waitForBroadcastMessage<T = unknown>(
  expectedType: string,
  options?: PopupMessageOptions<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!supportsBroadcastChannel()) {
      // No BroadcastChannel support in this environment: never settle here so
      // Promise.race falls back to waitForPopupMessage / popup-closed instead
      // of prematurely resolving/rejecting on behalf of a channel that can't
      // deliver anything.
      if (options?.signal) {
        options.signal.addEventListener('abort', () => reject(new Error('Popup wait aborted')), {
          once: true,
        });
      }
      return;
    }

    const channel = new BroadcastChannel(OAUTH_BROADCAST_CHANNEL_NAME);
    const timeoutMs = options?.timeoutMs ?? 120000;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Popup timed out'));
    }, timeoutMs);

    const onAbort = () => {
      cleanup();
      reject(new Error('Popup wait aborted'));
    };
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        channel.close();
        return reject(new Error('Popup wait aborted'));
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string } | undefined;
      if (!data || data.type !== expectedType) return;
      const payload = event.data as T;
      if (options?.predicate && !options.predicate(payload)) {
        return;
      }
      cleanup();
      resolve(payload);
    }

    function cleanup() {
      clearTimeout(timer);
      channel.removeEventListener('message', onMessage);
      channel.close();
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
    }

    channel.addEventListener('message', onMessage);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type OAuthCompletionMessage = {
  type: string;
  message?: string;
  [key: string]: unknown;
};

type WaitForOAuthCompletionOptions<T> = {
  popup: Window | null;
  predicate: (message: T) => boolean;
  signal: AbortSignal;
  timeoutMs?: number;
  /**
   * Grace period, after the popup is detected as closed, to let an
   * already-in-flight completion signal (postMessage or BroadcastChannel)
   * finish delivering before declaring the flow cancelled. Google's popup
   * posts its BroadcastChannel message and then calls `window.close()` in the
   * same tick, so this only needs to cover scheduling jitter — not real user
   * think time.
   */
  closedGraceMs?: number;
  /** Popup-closed poll interval, forwarded to `waitForPopupClosed`. Exposed mainly for tests. */
  closedPollIntervalMs?: number;
};

// Races the popup's completion signals (window "message" + BroadcastChannel,
// either of which may be the only one that arrives depending on whether
// `window.opener` survived) against the popup being closed. A bare "popup
// closed" is only treated as a user cancellation if no success/error signal
// ever arrived — otherwise we'd misreport a completed OAuth flow as
// cancelled, which is exactly the bug this function fixes.
export async function waitForOAuthCompletion<T extends OAuthCompletionMessage>(
  options: WaitForOAuthCompletionOptions<T>,
): Promise<T> {
  const {
    popup,
    predicate,
    signal,
    timeoutMs,
    closedGraceMs = 800,
    closedPollIntervalMs,
  } = options;
  let completionReceived = false;

  const successPromise = Promise.race([
    waitForPopupMessage<T>('oauth:success', { predicate, signal, timeoutMs }),
    waitForBroadcastMessage<T>('oauth:success', { predicate, signal, timeoutMs }),
  ]).then((payload) => {
    completionReceived = true;
    return payload;
  });

  const errorPromise = Promise.race([
    waitForPopupMessage<T>('oauth:error', { predicate, signal, timeoutMs }),
    waitForBroadcastMessage<T>('oauth:error', { predicate, signal, timeoutMs }),
  ]).then((payload) => {
    completionReceived = true;
    throw new Error(payload.message ?? 'Connection cancelled.');
  });

  const cancelledPromise = waitForPopupClosed(popup, {
    signal,
    intervalMs: closedPollIntervalMs,
  }).then(async () => {
    await delay(closedGraceMs);
    if (completionReceived) {
      // A completion signal already arrived (or is about to win the race via
      // successPromise/errorPromise, which settled first): never settle this
      // branch so Promise.race resolves from that signal instead.
      return new Promise<T>(() => {});
    }
    throw new Error('Connection cancelled.');
  });

  return Promise.race([successPromise, errorPromise, cancelledPromise]);
}

export function waitForPopupClosed(
  popup: Window | null,
  options?: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal },
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const intervalMs = options?.intervalMs ?? 500;
    const timeoutMs = options?.timeoutMs;
    const check = setInterval(() => {
      if (!popup || popup.closed) {
        cleanup();
        resolve();
      }
    }, intervalMs);

    const timer = timeoutMs
      ? setTimeout(() => {
          cleanup();
          try {
            popup?.close();
          } catch {
            // ignore — popup may already be closed by the user or browser
          }
          reject(new Error('Popup timed out'));
        }, timeoutMs)
      : null;

    const onAbort = () => {
      cleanup();
      reject(new Error('Popup close wait aborted'));
    };
    if (options?.signal) {
      if (options.signal.aborted) {
        clearInterval(check);
        if (timer) clearTimeout(timer);
        return reject(new Error('Popup close wait aborted'));
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    function cleanup() {
      clearInterval(check);
      if (timer) clearTimeout(timer);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
    }
  });
}
