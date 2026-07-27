import { describe, expect, it, mock } from 'bun:test';

import { transcribeReelTimeline } from './reelCaptions';

const item = {
  itemId: 'scene-1',
  kind: 'video' as const,
  blob: new Blob(['video'], { type: 'video/mp4' }),
};

describe('transcribeReelTimeline', () => {
  it('transcribes output-time audio and removes the temporary WAV', async () => {
    const cleanupAudio = mock(async () => undefined);
    const words = await transcribeReelTimeline(
      {
        brandId: 'brand-1',
        sourceAssetId: 'asset-1',
        items: [item],
      },
      {
        extractAudio: mock(async () => ({
          blob: new Blob(['wav'], { type: 'audio/wav' }),
          durationSec: 1,
        })),
        uploadAudio: mock(async () => ({
          audioBucket: 'media-library',
          audioStoragePath: 'clip-audio/brand-1/temp.wav',
        })),
        cleanupAudio,
        getAccessToken: mock(async () => 'token'),
        fetcher: mock(async () =>
          Response.json({
            languageCode: 'en-US',
            durationSec: 1,
            text: 'hello',
            words: [{ text: 'hello', startSec: 0, endSec: 0.5 }],
          }),
        ),
      },
    );

    expect(words).toEqual([{ text: 'hello', startSec: 0, endSec: 0.5 }]);
    expect(cleanupAudio).toHaveBeenCalledWith({
      brandId: 'brand-1',
      audioBucket: 'media-library',
      audioStoragePath: 'clip-audio/brand-1/temp.wav',
    });
  });

  it('fails when speech is absent but still removes the temporary WAV', async () => {
    const cleanupAudio = mock(async () => undefined);
    await expect(
      transcribeReelTimeline(
        {
          brandId: 'brand-1',
          sourceAssetId: 'asset-1',
          items: [item],
        },
        {
          extractAudio: mock(async () => ({
            blob: new Blob(['wav'], { type: 'audio/wav' }),
            durationSec: 1,
          })),
          uploadAudio: mock(async () => ({
            audioBucket: 'media-library',
            audioStoragePath: 'clip-audio/brand-1/temp.wav',
          })),
          cleanupAudio,
          getAccessToken: mock(async () => null),
          fetcher: mock(async () =>
            Response.json({
              languageCode: 'en-US',
              durationSec: 1,
              text: '',
              words: [],
            }),
          ),
        },
      ),
    ).rejects.toThrow('No speech');
    expect(cleanupAudio).toHaveBeenCalledTimes(1);
  });
});
