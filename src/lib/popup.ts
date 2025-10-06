export function openCenteredPopup(url: string, title: string, width = 480, height = 640): Window | null {
  const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : (window as any).screenX;
  const dualScreenTop = window.screenTop !== undefined ? window.screenTop : (window as any).screenY;

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

export function waitForPopupMessage<T = unknown>(expectedType: string, timeoutMs = 120000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Popup timed out"));
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      try {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { type?: string } | undefined;
        if (!data || data.type !== expectedType) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(event.data as T);
      } catch (e) {
        // ignore and continue listening
      }
    }

    window.addEventListener("message", onMessage);
  });
}


