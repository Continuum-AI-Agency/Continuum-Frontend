import type {
  TimelinePreviewAudioEvent,
  TimelinePreviewAudioPlan,
} from './timelineAudioPreviewPlan';

const SCHEDULE_LEAD_SEC = 0.03;
const EPSILON_SEC = 0.000_001;

export interface DecodedPreviewAudioChunk {
  buffer: AudioBuffer;
  timestampSec: number;
  durationSec: number;
}

export interface DecodedPreviewAudioAsset {
  chunks: DecodedPreviewAudioChunk[];
}

export interface ScheduledPreviewAudioChunk {
  event: TimelinePreviewAudioEvent;
  chunk: DecodedPreviewAudioChunk;
  whenSec: number;
  offsetSec: number;
  sourceDurationSec: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function fadeInGainAt(event: TimelinePreviewAudioEvent, timelineSec: number): number {
  if (event.fadeInSec <= 0) return 1;
  return clamp01((timelineSec - event.outputStartSec) / event.fadeInSec);
}

export function fadeOutGainAt(event: TimelinePreviewAudioEvent, timelineSec: number): number {
  if (event.fadeOutSec <= 0) return 1;
  return clamp01((event.outputEndSec - timelineSec) / event.fadeOutSec);
}

export function buildPreviewAudioSchedule(input: {
  plan: TimelinePreviewAudioPlan;
  decodedBySource: ReadonlyMap<string, DecodedPreviewAudioAsset>;
  fromTimelineSec: number;
  contextStartSec: number;
}): ScheduledPreviewAudioChunk[] {
  const scheduled: ScheduledPreviewAudioChunk[] = [];
  const fromTimelineSec = Math.max(0, input.fromTimelineSec);

  for (const event of input.plan.events) {
    if (
      event.outputEndSec <= fromTimelineSec ||
      event.outputStartSec >= input.plan.totalDurationSec
    )
      continue;
    const decoded = input.decodedBySource.get(event.sourceKey);
    if (!decoded) continue;

    const activeOutputStart = Math.max(fromTimelineSec, event.outputStartSec);
    const sourceAtActiveStart =
      event.sourceStartSec + (activeOutputStart - event.outputStartSec) * event.playbackRate;

    for (const chunk of decoded.chunks) {
      const chunkEndSec = chunk.timestampSec + chunk.durationSec;
      const intersectionStartSec = Math.max(
        chunk.timestampSec,
        sourceAtActiveStart,
        event.sourceStartSec,
      );
      const intersectionEndSec = Math.min(chunkEndSec, event.sourceEndSec);
      if (intersectionEndSec - intersectionStartSec <= EPSILON_SEC) continue;

      const timelineChunkStart =
        event.outputStartSec + (intersectionStartSec - event.sourceStartSec) / event.playbackRate;
      scheduled.push({
        event,
        chunk,
        whenSec: input.contextStartSec + Math.max(0, timelineChunkStart - fromTimelineSec),
        offsetSec: intersectionStartSec - chunk.timestampSec,
        sourceDurationSec: intersectionEndSec - intersectionStartSec,
      });
    }
  }

  return scheduled.sort(
    (left, right) => left.whenSec - right.whenSec || left.event.id.localeCompare(right.event.id),
  );
}

async function decodeAudioAsset(blob: Blob): Promise<DecodedPreviewAudioAsset> {
  const { ALL_FORMATS, AudioBufferSink, BlobSource, Input } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return { chunks: [] };
    const sink = new AudioBufferSink(track);
    const chunks: DecodedPreviewAudioChunk[] = [];
    for await (const wrapped of sink.buffers()) {
      chunks.push({
        buffer: wrapped.buffer,
        timestampSec: wrapped.timestamp,
        durationSec: wrapped.duration,
      });
    }
    return { chunks };
  } finally {
    input.dispose();
  }
}

function scheduleLinearEnvelope(input: {
  param: AudioParam;
  event: TimelinePreviewAudioEvent;
  fromTimelineSec: number;
  contextStartSec: number;
  edge: 'in' | 'out';
}): void {
  const { param, event, fromTimelineSec, contextStartSec, edge } = input;
  const activeStart = Math.max(fromTimelineSec, event.outputStartSec);
  const activeEnd = event.outputEndSec;
  const toContextTime = (timelineSec: number) =>
    contextStartSec + Math.max(0, timelineSec - fromTimelineSec);

  param.cancelScheduledValues(contextStartSec);
  if (edge === 'in') {
    const fadeEnd = Math.min(activeEnd, event.outputStartSec + event.fadeInSec);
    param.setValueAtTime(fadeInGainAt(event, activeStart), toContextTime(activeStart));
    if (fadeEnd > activeStart) param.linearRampToValueAtTime(1, toContextTime(fadeEnd));
    return;
  }

  const fadeStart = Math.max(event.outputStartSec, event.outputEndSec - event.fadeOutSec);
  param.setValueAtTime(fadeOutGainAt(event, activeStart), toContextTime(activeStart));
  if (fadeStart > activeStart) param.setValueAtTime(1, toContextTime(fadeStart));
  if (activeEnd > Math.max(activeStart, fadeStart)) {
    param.linearRampToValueAtTime(0, toContextTime(activeEnd));
  }
}

export class TimelineWebAudioPreviewEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly decodedCache = new Map<string, Promise<DecodedPreviewAudioAsset>>();
  private activeSources: AudioBufferSourceNode[] = [];
  private activeGains: GainNode[] = [];
  private generation = 0;
  private playing = false;
  private timelineEpochSec = 0;
  private contextEpochSec = 0;
  private totalDurationSec = 0;

  isSupported(): boolean {
    return typeof globalThis.AudioContext !== 'undefined';
  }

  isPlaying(): boolean {
    return this.playing;
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const context = new AudioContext({ latencyHint: 'interactive' });
    const masterGain = context.createGain();
    masterGain.connect(context.destination);
    this.context = context;
    this.masterGain = masterGain;
    return context;
  }

  private stopSources(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
    }
    this.activeSources = [];
    for (const gain of this.activeGains) gain.disconnect();
    this.activeGains = [];
  }

  private decode(event: TimelinePreviewAudioEvent): Promise<DecodedPreviewAudioAsset> {
    const cacheKey = `${event.sourceKey}:${event.blob.type}:${event.blob.size}`;
    const cached = this.decodedCache.get(cacheKey);
    if (cached) return cached;
    const pending = decodeAudioAsset(event.blob);
    this.decodedCache.set(cacheKey, pending);
    return pending;
  }

  async play(plan: TimelinePreviewAudioPlan, fromTimelineSec: number): Promise<boolean> {
    if (!this.isSupported()) return false;
    const generation = ++this.generation;
    this.stopSources();
    this.playing = false;

    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume();

    const decodedBySource = new Map<string, DecodedPreviewAudioAsset>();
    const uniqueEvents = new Map(plan.events.map((event) => [event.sourceKey, event]));
    const decoded = await Promise.all(
      [...uniqueEvents.values()].map(async (event) => ({
        sourceKey: event.sourceKey,
        asset: await this.decode(event),
      })),
    );
    if (generation !== this.generation) return false;
    for (const entry of decoded) decodedBySource.set(entry.sourceKey, entry.asset);

    const safeFrom = Math.max(0, Math.min(fromTimelineSec, plan.totalDurationSec));
    const latencyLead = Math.max(SCHEDULE_LEAD_SEC, context.baseLatency || 0);
    const contextStartSec = context.currentTime + latencyLead;
    const schedule = buildPreviewAudioSchedule({
      plan,
      decodedBySource,
      fromTimelineSec: safeFrom,
      contextStartSec,
    });
    if (plan.events.length > 0 && schedule.length === 0) {
      throw new Error('Timeline audio sources did not produce decodable preview samples.');
    }
    const gainsByEvent = new Map<
      string,
      { constant: GainNode; fadeIn: GainNode; fadeOut: GainNode }
    >();

    for (const scheduled of schedule) {
      let gains = gainsByEvent.get(scheduled.event.id);
      if (!gains) {
        const constant = context.createGain();
        const fadeIn = context.createGain();
        const fadeOut = context.createGain();
        constant.gain.value = scheduled.event.gain;
        constant.connect(fadeIn);
        fadeIn.connect(fadeOut);
        fadeOut.connect(this.masterGain!);
        scheduleLinearEnvelope({
          param: fadeIn.gain,
          event: scheduled.event,
          fromTimelineSec: safeFrom,
          contextStartSec,
          edge: 'in',
        });
        scheduleLinearEnvelope({
          param: fadeOut.gain,
          event: scheduled.event,
          fromTimelineSec: safeFrom,
          contextStartSec,
          edge: 'out',
        });
        gains = { constant, fadeIn, fadeOut };
        gainsByEvent.set(scheduled.event.id, gains);
        this.activeGains.push(constant, fadeIn, fadeOut);
      }

      const source = context.createBufferSource();
      source.buffer = scheduled.chunk.buffer;
      source.playbackRate.value = scheduled.event.playbackRate;
      source.connect(gains.constant);
      source.start(scheduled.whenSec, scheduled.offsetSec, scheduled.sourceDurationSec);
      this.activeSources.push(source);
    }

    this.timelineEpochSec = safeFrom;
    this.contextEpochSec = contextStartSec;
    this.totalDurationSec = plan.totalDurationSec;
    this.playing = true;
    return true;
  }

  currentTimelineTime(): number | null {
    if (!this.playing || !this.context) return null;
    const elapsed = Math.max(0, this.context.currentTime - this.contextEpochSec);
    return Math.min(this.totalDurationSec, this.timelineEpochSec + elapsed);
  }

  pause(): number | null {
    const timelineSec = this.currentTimelineTime();
    this.generation += 1;
    this.stopSources();
    this.playing = false;
    if (this.context?.state === 'running') void this.context.suspend();
    return timelineSec;
  }

  stop(): void {
    this.generation += 1;
    this.stopSources();
    this.playing = false;
  }

  async dispose(): Promise<void> {
    this.stop();
    this.decodedCache.clear();
    const context = this.context;
    this.context = null;
    this.masterGain = null;
    if (context && context.state !== 'closed') await context.close();
  }
}
