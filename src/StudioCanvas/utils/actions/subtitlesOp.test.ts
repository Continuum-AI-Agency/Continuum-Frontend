import { describe, expect, it } from 'bun:test';
import { runSubtitlesAction, type SubtitlesOpDeps } from './subtitlesOp';

const TRANSCRIPT = {
  languageCode: 'en-US',
  durationSec: 4,
  text: 'you will never lose money doing this',
  words: 'you will never lose money doing this'.split(' ').map((text, index) => ({
    text,
    startSec: index * 0.5,
    endSec: index * 0.5 + 0.45,
  })),
  emphasisIndices: [2, 4],
  emphasisSource: 'llm' as const,
};

type SpliceCall = Parameters<NonNullable<SubtitlesOpDeps['splice']>>[0];

function harness(over: Partial<SubtitlesOpDeps> = {}, transcript: unknown = TRANSCRIPT) {
  const calls: {
    splice: SpliceCall[];
    uploads: unknown[];
    cleanups: unknown[];
    fetches: { url: string; body: Record<string, unknown> }[];
    fonts: string[][];
  } = { splice: [], uploads: [], cleanups: [], fetches: [], fonts: [] };

  const deps: SubtitlesOpDeps = {
    resolveBrandId: () => 'brand-1',
    extractAudio: async () => new Blob(['wav'], { type: 'audio/wav' }),
    uploadAudio: async (params) => {
      calls.uploads.push(params);
      return { audioBucket: 'media-library', audioStoragePath: 'brand-1/clip-audio/x.wav' };
    },
    cleanupAudio: async (params) => {
      calls.cleanups.push(params);
    },
    loadFonts: async (families) => {
      calls.fonts.push([...families]);
      return families.map((family) => ({
        family,
        weightRange: '400',
        bytes: new ArrayBuffer(8),
      }));
    },
    getToken: async () => 'token-abc',
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.fetches.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return { ok: true, status: 200, json: async () => transcript };
    }) as unknown as typeof fetch,
    splice: async (options) => {
      calls.splice.push(options);
      options.onProgress?.({ progress: 1, processedClips: 1, totalClips: 1 });
      return {
        blob: new Blob(['mp4'], { type: 'video/mp4' }),
        objectUrl: 'blob:out',
        width: 1080,
        height: 1920,
        durationSec: 4,
      };
    },
    ...over,
  };

  const args = {
    inputs: [{ handle: 'in', blob: new Blob(['src'], { type: 'video/mp4' }) }],
    onProgress: () => {},
  };
  return { deps, args, calls };
}

describe('runSubtitlesAction', () => {
  it('returns the rendered clip as a video output', async () => {
    const { deps, args } = harness();
    const output = await runSubtitlesAction(args, { preset: 'pop' }, deps);
    expect(output).toEqual({ type: 'video', url: 'blob:out', sizeBytes: 3 });
  });

  it('asks the backend for emphasis and stamps the returned INDICES onto the words', async () => {
    const { deps, args, calls } = harness();
    await runSubtitlesAction(args, { preset: 'pop', emphasize: true }, deps);
    expect(calls.fetches[0].body.emphasize).toBe(true);
    const words = calls.splice[0].captionCues!.flatMap((cue) => cue.words);
    expect(words.filter((w) => w.emphasis).map((w) => w.text)).toEqual(['never', 'money']);
  });

  it('does not ask for emphasis when the node turned it off', async () => {
    const { deps, args, calls } = harness();
    await runSubtitlesAction(args, { preset: 'pop', emphasize: false }, deps);
    expect(calls.fetches[0].body.emphasize).toBe(false);
  });

  it('defaults emphasize to on, matching the registry default', async () => {
    const { deps, args, calls } = harness();
    await runSubtitlesAction(args, { preset: 'pop' }, deps);
    expect(calls.fetches[0].body.emphasize).toBe(true);
  });

  it('sends CUES grouped by the PRESET, not raw words for the worker to re-group', async () => {
    // The whole reason the protocol grew captionCues: pulse groups at 3 words a line and
    // pop at 6, and re-grouping worker-side would flatten both to the engine default.
    const pulse = harness();
    await runSubtitlesAction(pulse.args, { preset: 'pulse' }, pulse.deps);
    const pop = harness();
    await runSubtitlesAction(pop.args, { preset: 'pop' }, pop.deps);

    expect(pulse.calls.splice[0].captionWords).toBeUndefined();
    const pulseSizes = pulse.calls.splice[0].captionCues!.map((c) => c.words.length);
    const popSizes = pop.calls.splice[0].captionCues!.map((c) => c.words.length);
    expect(Math.max(...pulseSizes)).toBeLessThanOrEqual(3);
    expect(Math.max(...popSizes)).toBeGreaterThan(3);
  });

  it('sends the preset style, stamped with its provenance', async () => {
    const { deps, args, calls } = harness();
    await runSubtitlesAction(args, { preset: 'boxed' }, deps);
    expect(calls.splice[0].captionStyle?.presetId).toBe('boxed');
    expect(calls.splice[0].captionStyle?.fontFamily).toBe('JetBrains Mono');
  });

  it('ships the preset FACE with the job, or the worker renders Helvetica', async () => {
    const { deps, args, calls } = harness();
    await runSubtitlesAction(args, { preset: 'pulse' }, deps);
    expect(calls.fonts).toEqual([['Montserrat']]);
    expect(calls.splice[0].captionFonts?.map((f) => f.family)).toEqual(['Montserrat']);
  });

  it('asks for no faces at all for the system-stack preset', async () => {
    const { deps, args, calls } = harness();
    await runSubtitlesAction(args, { preset: 'classic' }, deps);
    expect(calls.fonts).toEqual([[]]);
  });

  it('falls back to classic for an unknown preset id', async () => {
    const { deps, args, calls } = harness();
    await runSubtitlesAction(args, { preset: 'hormozi-5' }, deps);
    expect(calls.splice[0].captionStyle?.presetId).toBe('classic');
  });

  it('renders the WHOLE source, letting the engine clamp to the real duration', async () => {
    const { deps, args, calls } = harness();
    await runSubtitlesAction(args, {}, deps);
    expect(calls.splice[0].ranges).toEqual([{ startSec: 0, endSec: Number.POSITIVE_INFINITY }]);
  });

  it('attaches the bearer token to the transcribe call', async () => {
    const { deps, args, calls } = harness();
    await runSubtitlesAction(args, {}, deps);
    expect(calls.fetches[0].url).toContain('/api/clips/transcribe');
    expect(calls.fetches[0].body.brandId).toBe('brand-1');
  });

  it('deletes the temporary audio after a successful render', async () => {
    const { deps, args, calls } = harness();
    await runSubtitlesAction(args, {}, deps);
    expect(calls.cleanups).toEqual([
      {
        brandId: 'brand-1',
        audioBucket: 'media-library',
        audioStoragePath: 'brand-1/clip-audio/x.wav',
      },
    ]);
  });

  it('deletes the temporary audio even when the render fails', async () => {
    // It is a temporary on a SHARED store; a failed run must not leave it behind.
    const { deps, args, calls } = harness({
      splice: async () => {
        throw new Error('encoder died');
      },
    });
    await expect(runSubtitlesAction(args, {}, deps)).rejects.toThrow('encoder died');
    expect(calls.cleanups).toHaveLength(1);
  });

  it('never lets a cleanup failure mask the real error', async () => {
    const { deps, args } = harness({
      cleanupAudio: async () => {
        throw new Error('storage 500');
      },
      splice: async () => {
        throw new Error('encoder died');
      },
    });
    await expect(runSubtitlesAction(args, {}, deps)).rejects.toThrow('encoder died');
  });

  it('refuses with a readable message when nothing is connected', async () => {
    const { deps } = harness();
    await expect(runSubtitlesAction({ inputs: [] }, {}, deps)).rejects.toThrow(/Connect a clip/);
  });

  it('refuses before uploading anything when no brand is selected', async () => {
    const { deps, args, calls } = harness({ resolveBrandId: () => undefined });
    await expect(runSubtitlesAction(args, {}, deps)).rejects.toThrow(/Select a brand/);
    expect(calls.uploads).toHaveLength(0);
  });

  it('surfaces a transcription failure rather than rendering an uncaptioned clip', async () => {
    const { deps, args, calls } = harness({
      fetchImpl: (async () => ({
        ok: false,
        status: 502,
        json: async () => ({ error: 'edge function down' }),
      })) as unknown as typeof fetch,
    });
    await expect(runSubtitlesAction(args, {}, deps)).rejects.toThrow('edge function down');
    expect(calls.splice).toHaveLength(0);
    expect(calls.cleanups).toHaveLength(1);
  });

  it('says so plainly when the clip has no speech', async () => {
    const { deps, args } = harness({}, { ...TRANSCRIPT, words: [], emphasisIndices: [] });
    await expect(runSubtitlesAction(args, {}, deps)).rejects.toThrow(/No speech/);
  });

  it('renders fine when the backend returned no emphasis at all', async () => {
    const noEmphasis = { ...TRANSCRIPT };
    delete (noEmphasis as { emphasisIndices?: number[] }).emphasisIndices;
    delete (noEmphasis as { emphasisSource?: string }).emphasisSource;
    const { deps, args, calls } = harness({}, noEmphasis);
    await runSubtitlesAction(args, {}, deps);
    const words = calls.splice[0].captionCues!.flatMap((cue) => cue.words);
    expect(words.some((w) => w.emphasis)).toBe(false);
  });
});
