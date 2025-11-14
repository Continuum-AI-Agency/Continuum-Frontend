export function openCenteredPopup(url: string, title: string, width = 480, height = 640): Window | null {
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
  ].join(",");

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
  options?: PopupMessageOptions<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutMs = options?.timeoutMs ?? 120000;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Popup timed out"));
    }, timeoutMs);

    const onAbort = () => {
      cleanup();
      reject(new Error("Popup wait aborted"));
    };
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        return reject(new Error("Popup wait aborted"));
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
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
      window.removeEventListener("message", onMessage);
      if (options?.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    }

    window.addEventListener("message", onMessage);
  });
}

export function waitForPopupClosed(
  popup: Window | null,
  options?: { intervalMs?: number; signal?: AbortSignal }
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const intervalMs = options?.intervalMs ?? 500;
    const check = setInterval(() => {
      if (!popup || popup.closed) {
        cleanup();
        resolve();
      }
    }, intervalMs);

    const onAbort = () => {
      cleanup();
      reject(new Error("Popup close wait aborted"));
    };
    if (options?.signal) {
      if (options.signal.aborted) {
        clearInterval(check);
        return reject(new Error("Popup close wait aborted"));
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    function cleanup() {
      clearInterval(check);
      if (options?.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    }
  });
}
