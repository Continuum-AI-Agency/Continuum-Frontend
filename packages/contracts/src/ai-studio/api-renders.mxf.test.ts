import { describe, expect, test } from 'bun:test';
import * as contract from './api-renders';

describe('MXF request and inspection contracts', () => {
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
