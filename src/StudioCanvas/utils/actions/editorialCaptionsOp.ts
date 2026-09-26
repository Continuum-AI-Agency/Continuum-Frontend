import { loadCaptionFonts } from '@/lib/clips/captionFonts';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { NodeOutput } from '../../types/execution';
import { runTimelineInWorker } from '../../workers/spliceWorkerClient';
import type {
  TimelineAudioWorkerItem,
  TimelineOverlayWorkerItem,
} from '../../workers/spliceWorkerProtocol';
import { type CaptionCue, type CaptionWord, groupWordsIntoCues } from '../splice/captionCues';
import { ensureBaseDuration, measureVideo } from './overlayOp';
import type { RunActionArgs } from './runAction';
import { transcribeCaptionWords } from './subtitlesOp';

type EditorialStyle = 'focus_blur' | 'paper_notes' | 'neon_frame' | 'editorial_split';

const STYLES: Record<EditorialStyle, CaptionStyle> = {
  focus_blur: {
    textColor: '#ffffff',
    highlightColor: '#ffe04f',
    outlineColor: '#111111',
    fontFamily: 'Montserrat',
    fontWeight: 900,
    fontSizeFrac: 0.072,
    outlineWidthFrac: 0.06,
    position: { xFrac: 0.5, yFrac: 0.09 },
    uppercase: true,
    shadow: { color: '#000000bb', blurFrac: 0.12, offsetYFrac: 0.08 },
    animation: { kind: 'floatIn', durationSec: 0.24, anchor: 'cue' },
    emphasis: { color: '#ffe04f', scale: 1.07 },
  },
  paper_notes: {
    textColor: '#25211b',
    highlightColor: '#25211b',
    outlineColor: 'transparent',
    fontFamily: 'JetBrains Mono',
    fontWeight: 700,
    fontSizeFrac: 0.049,
    outlineWidthFrac: 0,
    position: { xFrac: 0.5, yFrac: 0.76 },
    backgroundColor: '#fff8e9',
    backgroundOpacity: 0.96,
    backgroundMode: 'word',
    backgroundRadiusFrac: 0.15,
    activeWordMode: 'box',
    activeBoxColor: '#f1c94b',
    animation: { kind: 'floatIn', durationSec: 0.17, anchor: 'word', reveal: 'word' },
  },
  neon_frame: {
    textColor: '#eaffff',
    highlightColor: '#46eaf6',
    outlineColor: '#082125',
    fontFamily: 'Montserrat',
    fontWeight: 900,
    fontSizeFrac: 0.077,
    outlineWidthFrac: 0.11,
    position: { xFrac: 0.5, yFrac: 0.09 },
    uppercase: true,
    shadow: { color: '#00d9edcc', blurFrac: 0.18, offsetYFrac: 0 },
    animation: { kind: 'scaleIn', durationSec: 0.2, anchor: 'cue' },
    emphasis: { color: '#46eaf6', scale: 1.1 },
  },
  editorial_split: {
    textColor: '#ffffff',
    highlightColor: '#fff5d9',
    outlineColor: '#2a1e1a',
    fontFamily: 'Cormorant Garamond',
    fontWeight: 700,
    fontSizeFrac: 0.075,
    outlineWidthFrac: 0.05,
    position: { xFrac: 0.5, yFrac: 0.1 },
    shadow: { color: '#1c1414aa', blurFrac: 0.13, offsetYFrac: 0.06 },
    animation: { kind: 'floatIn', durationSec: 0.35, anchor: 'cue' },
  },
};

function accentBlob(): Blob {
  const sampleRate = 48_000;
  const count = Math.round(sampleRate * 0.16);
  const bytes = new ArrayBuffer(44 + count * 2);
  const view = new DataView(bytes);
  const label = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  label(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  label(8, 'WAVE');
  label(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  label(36, 'data');
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const u = i / count;
    const envelope = Math.sin(Math.PI * u) ** 2;
    const tone = Math.sin((2 * Math.PI * (420 + 180 * u) * i) / sampleRate);
    view.setInt16(44 + i * 2, Math.round(tone * envelope * 2500), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

async function graphic(
  width: number,
  height: number,
  style: EditorialStyle,
  inset?: Blob,
): Promise<Blob | null> {
  if (style === 'focus_blur') return null;
  if (width < 1 || height < 1) throw new Error('Editorial graphics need video dimensions');
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Editorial graphics need a canvas');
  if (style === 'paper_notes') {
    ctx.fillStyle = '#f6eed51c';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#fff8e960';
    ctx.lineWidth = width * 0.018;
    ctx.strokeRect(width * 0.05, height * 0.07, width * 0.9, height * 0.86);
  } else if (style === 'neon_frame') {
    ctx.fillStyle = '#001e262a';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#39e6ef';
    ctx.lineWidth = width * 0.009;
    ctx.shadowColor = '#29dbe6';
    ctx.shadowBlur = width * 0.04;
    ctx.strokeRect(width * 0.055, height * 0.045, width * 0.89, height * 0.91);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#4ef2f230';
    for (let y = height * 0.68; y < height * 0.89; y += height * 0.035)
      ctx.fillRect(width * 0.06, y, width * 0.88, 1);
  } else {
    const glow = ctx.createLinearGradient(0, 0, width, height);
    glow.addColorStop(0, '#fff4c550');
    glow.addColorStop(0.45, '#ffffff00');
    glow.addColorStop(1, '#f5ddc525');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    if (inset) {
      const bitmap = await createImageBitmap(inset);
      const top = height * 0.72;
      const panelHeight = height * 0.22;
      const panelWidth = width * 0.72;
      const left = width * 0.14;
      const landscape = bitmap.width / bitmap.height > 1.4;
      const sourceWidth = landscape ? bitmap.width : bitmap.width * 0.43;
      const cropHeight = Math.min(bitmap.height, sourceWidth * (panelHeight / panelWidth));
      ctx.drawImage(
        bitmap,
        0,
        landscape ? (bitmap.height - cropHeight) / 2 : (bitmap.height - cropHeight) * 0.55,
        sourceWidth,
        cropHeight,
        left,
        top,
        panelWidth,
        panelHeight,
      );
      ctx.strokeStyle = '#fff9e8';
      ctx.lineWidth = width * 0.01;
      ctx.strokeRect(left, top, panelWidth, panelHeight);
      bitmap.close();
    }
  }
  return canvas.convertToBlob({ type: 'image/png' });
}

export async function runEditorialCaptionsAction(
  args: RunActionArgs,
  config: Record<string, unknown>,
): Promise<NodeOutput> {
  const blob = args.inputs.find((input) => input.handle === 'in')?.blob;
  if (!blob) throw new Error('Connect a video to Editorial Captions');
  let base = await ensureBaseDuration(await measureVideo(blob));
  if (!(base.durationSec > 0))
    throw new Error('Editorial Captions needs a readable video duration');
  if (base.width < 1 || base.height < 1) {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('Editorial Captions needs a video track');
      base = { ...base, width: await track.getCodedWidth(), height: await track.getCodedHeight() };
    } finally {
      (input as unknown as { dispose?: () => void }).dispose?.();
    }
  }
  const style = config.style as EditorialStyle;
  const rawWords = config.words;
  const words: CaptionWord[] =
    Array.isArray(rawWords) && rawWords.length > 0
      ? (rawWords as CaptionWord[])
      : await transcribeCaptionWords(args, {}, false);
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const emphasis = new Set(
    (config.emphasisPhrases as string[]).flatMap((phrase) => phrase.split(/\s+/).map(normalize)),
  );
  const timedWords = words
    .filter((word) => word.startSec < base.durationSec && word.endSec > word.startSec)
    .map((word) => ({
      ...word,
      emphasis: emphasis.has(normalize(word.text)),
    }));
  const cta = typeof config.cta === 'string' ? config.cta.trim() : '';
  const ctaStart = cta ? Math.max(0, base.durationSec - 2.8) : base.durationSec;
  const rawCues = groupWordsIntoCues(
    timedWords.filter((word) => word.startSec < ctaStart - 0.08),
    {
      maxWordsPerCue: style === 'paper_notes' ? 4 : 3,
      maxCueDurationSec: 1.7,
      maxGapSec: 0.5,
    },
  );
  const cues: CaptionCue[] = rawCues.map((cue, index) => ({
    ...cue,
    endSec: Math.max(
      cue.startSec + 0.02,
      Math.min(ctaStart - 0.08, rawCues[index + 1]?.startSec ?? Infinity, cue.endSec + 0.12),
    ),
  }));
  if (style === 'editorial_split' || style === 'neon_frame') {
    const featured = cues.find((cue) => cue.words.some((word) => word.emphasis)) ?? cues[0];
    if (featured)
      cues.push({
        id: 'editorial-script',
        startSec: featured.startSec,
        endSec: Math.min(ctaStart, featured.endSec + 0.5),
        words: featured.words.filter((word) => word.emphasis).length
          ? featured.words.filter((word) => word.emphasis)
          : featured.words.slice(0, 2),
        style: {
          fontFamily: 'Allura',
          fontWeight: 400,
          fontSizeFrac: 0.075,
          textColor: style === 'neon_frame' ? '#4ef2f2' : '#fff6e4',
          outlineWidthFrac: 0,
          position: { xFrac: 0.5, yFrac: style === 'neon_frame' ? 0.43 : 0.48 },
          animation: { kind: 'floatIn', durationSec: 0.35, anchor: 'cue' },
        },
      });
  }
  if (cta) {
    const tokens = cta.split(/\s+/);
    const midpoint = cta.length / 2;
    const split = tokens.slice(1).reduce((best, _token, index) => {
      const candidate = index + 1;
      const length = tokens.slice(0, candidate).join(' ').length;
      const bestLength = tokens.slice(0, best).join(' ').length;
      return Math.abs(length - midpoint) < Math.abs(bestLength - midpoint) ? candidate : best;
    }, 1);
    const lines = [tokens.slice(0, split), tokens.slice(split)];
    for (const [index, line] of lines.entries()) {
      if (!line.length) continue;
      cues.push({
        id: `editorial-cta-${index}`,
        startSec: ctaStart + index * 0.16,
        endSec: base.durationSec,
        words: line.map((text) => ({
          text,
          startSec: ctaStart + index * 0.16,
          endSec: base.durationSec,
          emphasis: /daypass|pass|hoy|today/i.test(text),
        })),
        style: {
          position: { xFrac: 0.5, yFrac: 0.79 + index * 0.075 },
          fontSizeFrac: Math.min(0.032, 0.54 / (line.join(' ').length * 0.7)),
          activeWordMode: 'none',
          emphasis: {
            color: STYLES[style].emphasis?.color ?? STYLES[style].highlightColor,
            scale: 1,
          },
          backgroundMode: 'line',
          backgroundColor: style === 'paper_notes' ? '#fff8e9' : '#151515',
          backgroundOpacity: style === 'paper_notes' ? 0.96 : 0.68,
        },
      });
    }
  }
  const overlays: TimelineOverlayWorkerItem[] = [];
  if (style === 'focus_blur') {
    for (const [index, cue] of cues
      .filter(
        (cue) =>
          cue.startSec >= 1.5 &&
          !cue.id.startsWith('editorial-cta') &&
          cue.words.some((word) => word.emphasis),
      )
      .slice(0, 3)
      .entries()) {
      const startSec = Math.max(0, cue.startSec - 0.06);
      const durationSec = Math.min(1.15, base.durationSec - startSec);
      overlays.push({
        itemId: `focus-blur-${index}`,
        kind: 'video',
        blob,
        startSec,
        trimStartSec: startSec,
        trimEndSec: startSec + durationSec,
        durationSec,
        muteAudio: true,
        effects: {
          adjustments: { blur: Math.max(8, base.width * 0.018) },
          opacityStops: [
            { t: 0, value: 0 },
            { t: 0.16, value: 1 },
            { t: 0.78, value: 1 },
            { t: 1, value: 0 },
          ],
        },
      });
    }
  } else {
    const insetInput = args.inputs.find((input) => input.handle === 'inset-in');
    const inset =
      insetInput?.blob ??
      (insetInput?.imageUrl ? await (await fetch(insetInput.imageUrl)).blob() : undefined);
    if (style === 'editorial_split' && !inset)
      throw new Error('Editorial Split needs an approved inset image');
    const art = await graphic(base.width, base.height, style, inset);
    if (art) {
      const startSec =
        style === 'editorial_split'
          ? Math.min(base.durationSec * 0.55, Math.max(0, base.durationSec - 5))
          : 0;
      const durationSec =
        style === 'editorial_split' ? Math.min(4, base.durationSec - startSec) : base.durationSec;
      overlays.push({
        itemId: `${style}-art`,
        kind: 'image',
        blob: art,
        startSec,
        durationSec,
        effects:
          style === 'editorial_split'
            ? {
                keyframes: [
                  { t: 0, transform: { offsetY: 0.45 } },
                  { t: 0.3, transform: { offsetY: 0 } },
                  { t: 0.72, transform: { offsetY: 0 } },
                  { t: 1, transform: { offsetY: 0.45 } },
                ],
              }
            : undefined,
      });
    }
  }
  const audioTracks: TimelineAudioWorkerItem[] =
    config.soundAccents === 'subtle'
      ? cues
          .filter((cue) => !cue.id.startsWith('editorial-cta'))
          .slice(0, 3)
          .map((cue, index) => ({
            itemId: `accent-${index}`,
            blob: accentBlob(),
            startSec: cue.startSec,
            volume: 0.18,
          }))
      : [];
  const result = await runTimelineInWorker({
    items: [{ itemId: 'editorial-base', kind: 'video', blob }],
    overlays,
    audioTracks,
    captionCues: cues,
    captionStyle: STYLES[style],
    captionFonts: await loadCaptionFonts([
      STYLES[style].fontFamily ?? 'Inter',
      ...(style === 'editorial_split' || style === 'neon_frame' ? ['Allura'] : []),
    ]),
    targetWidth: base.width,
    targetHeight: base.height,
    signal: args.signal,
    onProgress: ({ progress }) => args.onProgress?.(progress),
  });
  return { type: 'video', url: result.objectUrl, sizeBytes: result.blob.size };
}
