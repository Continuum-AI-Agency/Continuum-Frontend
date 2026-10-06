// Browser entry for the combination bench. Frames and worker exports come from the existing
// recorded-export entry (the same plan, fonts, compositor and splicer worker as browser export).
// The stationary control encodes one already-composed PNG with the compositor's encoder settings
// (mediabunny CanvasSource, AVC, the project's bitrate and rate), so encoder colour can be told
// apart from a composition defect.

import { runRecordedExport } from '../support/videoEditorMotionRenderEntry';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

async function stationaryControl(input: {
  pngBase64: string;
  frameRate: number;
  videoBitrate: number;
  seconds: number;
}): Promise<{ base64: string; width: number; height: number }> {
  const { Output, BufferTarget, Mp4OutputFormat, CanvasSource } = await import('mediabunny');
  const png = Uint8Array.from(atob(input.pngBase64), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(
    bitmap.width - (bitmap.width % 2),
    bitmap.height - (bitmap.height % 2),
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas for the stationary control.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: input.videoBitrate });
  output.addVideoTrack(source, { frameRate: input.frameRate });
  await output.start();
  const frames = Math.round(input.seconds * input.frameRate);
  for (let frame = 0; frame < frames; frame += 1)
    await source.add(frame / input.frameRate, 1 / input.frameRate);
  await output.finalize();
  if (!output.target.buffer) throw new Error('Stationary control produced no bytes.');
  return {
    base64: toBase64(new Uint8Array(output.target.buffer)),
    width: canvas.width,
    height: canvas.height,
  };
}

declare global {
  interface Window {
    __combos: {
      recordedExport: typeof runRecordedExport;
      stationaryControl: typeof stationaryControl;
    };
  }
}

window.__combos = { recordedExport: runRecordedExport, stationaryControl };
