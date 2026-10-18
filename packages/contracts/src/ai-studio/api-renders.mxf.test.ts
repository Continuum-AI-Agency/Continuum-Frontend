import { describe, expect, test } from 'bun:test';
import * as contract from './api-renders';

describe('MXF request and inspection contracts', () => {
  test('profiles survive merge/clear and summaries describe the effective MXF audio', () => {
    const settings: contract.EncodeSettings = {
      video: { mxfProfile: 'xdcam-hd422-1080i5994' },
      audio: { layout: 'stereo', channels: 4 },
      files: { mxf: true },
    };
    expect(contract.encodeSettingsSchema.parse(settings)).toEqual(settings);
    expect(contract.flattenEncodeSettings(settings)['video.mxfProfile']).toBe(
      'xdcam-hd422-1080i5994',
    );
    expect(
      contract.mergeEncodeSettings(settings, { video: { mxfProfile: 'dnxhr-hq' } }).video
        ?.mxfProfile,
    ).toBe('dnxhr-hq');
    expect(contract.describeMxfAudio(settings)).toBe('1 stereo track · 48 kHz · 24-bit PCM');
    expect(contract.describeMxfAudio({ audio: { channels: 2 } })).toBe(
      '4 mono tracks (L/R/L/R) · 48 kHz · 24-bit PCM',
    );
    expect(contract.describeMxfAudio({ audio: { enabled: false } })).toBe('No audio');
    expect(contract.describeMxfVideo(settings)).toBe('XDCAM HD422 · 1080i59.94 · 50 Mb/s');
    expect(
      contract.encodeSettingsSchema.safeParse({ video: { mxfProfile: 'unsupported' } }).success,
    ).toBe(false);
    expect(contract.apiRenderFieldOrderSchema.safeParse('tt').success).toBe(true);
    expect(contract.apiRenderFieldOrderSchema.safeParse('guessed').success).toBe(false);
  });
  // The conformance table for every renderer that writes an XDCAM MXF. Copied verbatim into
  // continuum-render-api test/encode.test.js (FlowStream ilftbbyr3); keep the rows identical.
  test('XDCAM 1080i59.94 takes 29.97, 59.94 and 60 fps comps and refuses the rest', () => {
    const cases: Array<[number | null, boolean]> = [
      [30000 / 1001, true],
      [29.97, true],
      [60000 / 1001, true],
      [59.94, true],
      [60, true],
      [30, false],
      [25, false],
      [24, false],
      [50, false],
      [null, false],
    ];
    for (const [rate, accepted] of cases) {
      const refusal = contract.mxfProfileRateRefusal('xdcam-hd422-1080i5994', rate);
      expect({ rate, accepted: refusal === null }).toEqual({ rate, accepted });
      expect(contract.mxfProfileRateRefusal('dnxhr-hq', rate)).toBeNull();
      expect(contract.mxfProfileRateRefusal(undefined, rate)).toBeNull();
    }
    expect(contract.mxfProfileRateRefusal('xdcam-hd422-1080i5994', null)).toContain(
      'no recorded frame rate',
    );
    expect(contract.mxfProfileRateRefusal('xdcam-hd422-1080i5994', 25)).toContain('25 fps');
  });
  test('accepts the two MXF layouts and preserves them through merge and clear helpers', () => {
    for (const api of [contract]) {
      const settings = { audio: { layout: 'stereo', channels: 4 } };
      expect(api.encodeSettingsSchema.safeParse(settings).success).toBe(true);
      expect(api.flattenEncodeSettings(settings as contract.EncodeSettings)['audio.layout']).toBe(
        'stereo',
      );
      expect(
        api.mergeEncodeSettings(
          { audio: { layout: 'broadcast-4x-aes3' } },
          settings as contract.EncodeSettings,
        ).audio?.layout,
      ).toBe('stereo');
      expect(api.encodeSettingsSchema.safeParse({ audio: { layout: 'surround' } }).success).toBe(
        false,
      );
    }
  });
  test('allows explicit MXF remastering and rejects MOV remastering', () => {
    const request = {
      brandId: '00000000-0000-4000-8000-000000000001',
      outputId: 'master',
      format: 'mxf',
      remaster: true,
    };
    for (const api of [contract]) {
      expect(api.apiRenderMasterDownloadRequestSchema.safeParse(request).success).toBe(true);
      expect(
        api.apiRenderMasterDownloadRequestSchema.safeParse({ ...request, format: 'mov' }).success,
      ).toBe(false);
      expect(
        api.apiRenderMasterDownloadRequestSchema.safeParse({
          ...request,
          format: 'mov',
          remaster: false,
        }).success,
      ).toBe(true);
    }
  });
  test('carries measured stream facts and explicit unavailable facts across both boundaries', () => {
    const measured = {
      outputId: 'master',
      status: 'measured',
      video: {
        codec: 'dnxhd',
        profile: 'DNXHR HQ',
        frameRate: 30000 / 1001,
        frameRateRational: '30000/1001',
        bitDepth: 8,
        fieldOrder: 'progressive',
      },
      audioStreams: [
        { index: 1, codec: 'pcm_s24le', channels: 1, sampleRate: 48000, bitDepth: 24 },
      ],
      probedAt: '2026-10-09T20:00:00.000Z',
    };
    const unavailable = {
      outputId: 'master',
      status: 'unavailable',
      video: null,
      audioStreams: null,
      probedAt: null,
    };
    for (const api of [contract]) {
      expect(api.apiRenderFileSpecsSchema.parse(measured)).toEqual(measured);
      expect(api.apiRenderFileSpecsSchema.parse(unavailable)).toEqual(unavailable);
      expect(
        api.apiRenderFileSpecsSchema.safeParse({
          ...measured,
          audioStreams: [{ ...measured.audioStreams[0], channels: -1 }],
        }).success,
      ).toBe(false);
      expect(api.apiRenderFileSpecsRoute('job/id', 'out id')).toBe(
        '/api/ai-studio/renders/jobs/job%2Fid/outputs/out%20id/specs',
      );
    }
  });
});
