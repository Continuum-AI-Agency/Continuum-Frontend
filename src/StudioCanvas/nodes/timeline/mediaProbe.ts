// Lightweight metadata probe for the Video Editor media bin. A detached <video>
// element reports a source's natural duration via `loadedmetadata` without
// decoding frames — enough to size clips on the timeline and default trim ends.
// Heavier mediabunny decoding is reserved for the actual render.

function probeElementDuration(
  element: HTMLVideoElement | HTMLAudioElement,
  url: string,
  timeoutMs: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    element.preload = 'metadata';
    element.muted = true;

    let settled = false;
    const cleanup = () => {
      element.removeAttribute('src');
      element.load();
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      fn();
    };

    const timer = window.setTimeout(
      () => finish(() => reject(new Error('Timed out probing media duration'))),
      timeoutMs,
    );

    element.addEventListener('loadedmetadata', () => {
      const duration =
        Number.isFinite(element.duration) && element.duration > 0 ? element.duration : 0;
      finish(() => resolve(duration));
    });
    element.addEventListener('error', () =>
      finish(() => reject(new Error('Failed to load media for probing'))),
    );

    element.src = url;
  });
}

export function probeVideoDuration(url: string, timeoutMs = 8000): Promise<number> {
  return probeElementDuration(document.createElement('video'), url, timeoutMs);
}

export function probeAudioDuration(url: string, timeoutMs = 8000): Promise<number> {
  return probeElementDuration(document.createElement('audio'), url, timeoutMs);
}
