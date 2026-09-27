import { describe, expect, it } from 'bun:test';
import {
  buildInlineChunkTranscribeRequestBody,
  stitchChunkTranscripts,
  WINDOW_RESPONSE_SCHEMA,
} from './transcription';

describe('stitchChunkTranscripts', () => {
  it('puts each chunk on the recording clock and keeps chunk order', () => {
    const stitched = stitchChunkTranscripts([
      {
        startSec: 600,
        endSec: 1200,
        segments: [{ startSec: 1.5, endSec: 4, text: 'second chunk' }],
        language: 'en',
      },
      {
        startSec: 0,
        endSec: 600,
        segments: [{ startSec: 0.5, endSec: 3, text: 'first chunk' }],
        language: 'en',
      },
    ]);
    expect(stitched.segments).toEqual([
      { startSec: 0.5, endSec: 3, text: 'first chunk' },
      { startSec: 601.5, endSec: 604, text: 'second chunk' },
    ]);
  });

  it('never lets a segment run past its chunk, so a word at a cut is not doubled', () => {
    const { segments } = stitchChunkTranscripts([
      {
        startSec: 0,
        endSec: 600,
        segments: [
          { startSec: 598, endSec: 603, text: 'straddles the cut' },
          { startSec: 601, endSec: 604, text: 'hallucinated past the end' },
        ],
        language: 'en',
      },
    ]);
    expect(segments).toEqual([{ startSec: 598, endSec: 600, text: 'straddles the cut' }]);
  });

  it('keeps a sentence straddling a cut whole, once, from the chunk it starts in', () => {
    // Chunk 1 owns 0–600 and hears to 615; chunk 2 owns 600–1200 and hears from 585.
    const { segments } = stitchChunkTranscripts([
      {
        startSec: 0,
        endSec: 615,
        ownedFromSec: 0,
        ownedToSec: 600,
        segments: [
          { startSec: 590, endSec: 596, text: 'before the cut' },
          { startSec: 598.5, endSec: 603, text: 'the saffron kite drifts over the quarry' },
          { startSec: 604, endSec: 610, text: 'already chunk two' },
        ],
        language: 'en',
      },
      {
        startSec: 585,
        endSec: 1215,
        ownedFromSec: 600,
        ownedToSec: 1200,
        segments: [
          { startSec: 5, endSec: 11, text: 'before the cut' },
          { startSec: 13.5, endSec: 18, text: 'the saffron kite drifts over the quarry' },
          { startSec: 19, endSec: 25, text: 'already chunk two' },
        ],
        language: 'en',
      },
    ]);
    expect(segments.map((segment) => [segment.startSec, segment.text])).toEqual([
      [590, 'before the cut'],
      [598.5, 'the saffron kite drifts over the quarry'],
      [604, 'already chunk two'],
    ]);
    // Whole: it runs past 600 s, to where chunk 1 heard it end.
    expect(segments[1]?.endSec).toBe(603);
  });

  it('keeps a line both chunks heard once, at the LATER chunk’s time, when the earlier clock drifted', () => {
    // Measured on the bench's 27-minute recording: after a 10 s pause chunk 1 heard the marker
    // at 588.5 s (10 s early) and week 111 before 600 s; chunk 2 heard both at the true time.
    const { segments } = stitchChunkTranscripts([
      {
        startSec: 0,
        endSec: 615,
        ownedFromSec: 0,
        ownedToSec: 600,
        segments: [
          { startSec: 580, endSec: 585, text: 'In week 110, Maria packed the oak ladder.' },
          {
            startSec: 588.5,
            endSec: 592.5,
            text: 'Here is the marker, the saffron kite drifts over the quarry.',
          },
          { startSec: 593, endSec: 598, text: 'In week 111, the gaffer moved the brass lamp.' },
        ],
        language: 'en',
      },
      {
        startSec: 585,
        endSec: 1215,
        ownedFromSec: 600,
        ownedToSec: 1200,
        segments: [
          { startSec: 0, endSec: 0.8, text: 'oak ladder.' },
          {
            startSec: 13.5,
            endSec: 16.5,
            text: 'Here is the marker, the saffron kite drifts over the quarry',
          },
          { startSec: 17, endSec: 22, text: 'In week 111, the gaffer moved the brass lamp.' },
        ],
        language: 'en',
      },
    ]);
    expect(segments.map((segment) => [segment.startSec, segment.text])).toEqual([
      [580, 'In week 110, Maria packed the oak ladder.'],
      [598.5, 'Here is the marker, the saffron kite drifts over the quarry'],
      [602, 'In week 111, the gaffer moved the brass lamp.'],
    ]);
  });

  it('keeps a line only the LATER chunk heard in its lead-in, and matches misheard twins', () => {
    // Measured: chunk 1 missed the marker entirely; chunk 2 heard it split in two, before 600 s.
    // And a name heard two ways ("Aiko" / "Ico") is still one line.
    const { segments } = stitchChunkTranscripts([
      {
        startSec: 0,
        endSec: 615,
        ownedFromSec: 0,
        ownedToSec: 600,
        segments: [
          {
            startSec: 575,
            endSec: 580,
            text: 'In week 110, the colorist cleaned the velvet chair.',
          },
          {
            startSec: 596,
            endSec: 601,
            text: 'In week 111, Aiko checked the brass lamp after the rehearsal.',
          },
        ],
        language: 'en',
      },
      {
        startSec: 585,
        endSec: 1215,
        ownedFromSec: 600,
        ownedToSec: 1200,
        segments: [
          { startSec: 0, endSec: 0.5, text: 'chair.' },
          { startSec: 13.5, endSec: 14.5, text: 'Here is the marker' },
          { startSec: 14.5, endSec: 17, text: 'the saffron kite drifts over the quarry' },
          {
            startSec: 17,
            endSec: 22.5,
            text: 'in week 111, Ico checked the brass lamp after the rehearsal',
          },
        ],
        language: 'en',
      },
    ]);
    expect(segments.map((segment) => [segment.startSec, segment.text])).toEqual([
      [575, 'In week 110, the colorist cleaned the velvet chair.'],
      [598.5, 'Here is the marker'],
      [599.5, 'the saffron kite drifts over the quarry'],
      [602, 'in week 111, Ico checked the brass lamp after the rehearsal'],
    ]);
  });

  it('never merges two short common lines just because they read the same', () => {
    // Two "Okay."s 15 s apart are two lines; ownership keeps each where it starts.
    const { segments } = stitchChunkTranscripts([
      {
        startSec: 0,
        endSec: 615,
        ownedFromSec: 0,
        ownedToSec: 600,
        segments: [{ startSec: 590, endSec: 591, text: 'Okay.' }],
        language: 'en',
      },
      {
        startSec: 585,
        endSec: 1215,
        ownedFromSec: 600,
        ownedToSec: 1200,
        segments: [{ startSec: 20, endSec: 21, text: 'Okay.' }],
        language: 'en',
      },
    ]);
    expect(segments.map((segment) => segment.startSec)).toEqual([590, 605]);
  });

  it('takes the language most chunks heard, and none when no chunk heard speech', () => {
    const chunk = (language: string | null) => ({ startSec: 0, endSec: 1, segments: [], language });
    expect(stitchChunkTranscripts([chunk('es'), chunk('en'), chunk('en')]).language).toBe('en');
    expect(stitchChunkTranscripts([chunk(null)]).language).toBeNull();
  });
});

describe('buildInlineChunkTranscribeRequestBody', () => {
  it('sends the chunk inline and asks for segments plus language', () => {
    const body = buildInlineChunkTranscribeRequestBody({
      audioBase64: 'AAAA',
      mimeType: 'audio/mpeg',
      spanSec: 600,
    });
    expect(body.contents[0]?.parts[1]).toEqual({
      inlineData: { mimeType: 'audio/mpeg', data: 'AAAA' },
    });
    expect(body.generationConfig.responseSchema).toBe(WINDOW_RESPONSE_SCHEMA);
    expect(body.contents[0]?.parts[0]).toMatchObject({
      text: expect.stringContaining('600 seconds'),
    });
  });
});
