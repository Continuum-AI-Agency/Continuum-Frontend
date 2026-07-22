// Lightweight metadata probe for the Video Editor media bin. A detached <video>
// element reports a source's natural duration via `loadedmetadata` without
// decoding frames — enough to size clips on the timeline and default trim ends.
// Heavier mediabunny decoding is reserved for the actual render.

export function probeVideoDuration(url: string, timeoutMs = 8000): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    let settled = false;
    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
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

    video.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      finish(() => resolve(duration));
    });
    video.addEventListener('error', () =>
      finish(() => reject(new Error('Failed to load media for probing'))),
    );

    video.src = url;
  });
}
