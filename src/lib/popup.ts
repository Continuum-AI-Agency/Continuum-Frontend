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
};

export function waitForPopupMessage<T = unknown>(
  expectedType: string,
  options?: PopupMessageOptions<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutMs = options?.timeoutMs ?? 120000;
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Popup timed out"));
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      try {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { type?: string } | undefined;
        if (!data || data.type !== expectedType) return;
        const payload = event.data as T;
        if (options?.predicate && !options.predicate(payload)) {
          return;
        }
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(payload);
      } catch {
        // ignore and continue listening
      }
    }

    window.addEventListener("message", onMessage);
  });
}
