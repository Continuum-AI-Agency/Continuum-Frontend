import { describe, expect, it } from 'bun:test';
import {
  apiRenderBatchPreflightRequestSchema,
  apiRenderJobSchema,
  apiRenderPreflightRequestSchema,
  describeEncodeSettings,
  encodeFilesOf,
  encodeSettingsSchema,
  flattenEncodeSettings,
  mergeEncodeSettings,
} from './api-renders';
import { matchOutputFormat } from './render-output-format';

const BRAND = '6a49e1a8-0ee8-4101-bed7-1bdc8fd5e088';

describe('encode files', () => {
  it('keeps the template container when files is unset', () => {
    expect(encodeFilesOf(undefined, 'mp4')).toEqual(['mp4']);
    expect(encodeFilesOf({ fps: 25 }, 'mov')).toEqual(['mov']);
  });

  it('adds and drops containers on top of the template one', () => {
    expect(encodeFilesOf({ files: { mxf: true } }, 'mp4')).toEqual(['mp4', 'mxf']);
    expect(encodeFilesOf({ files: { mp4: false, mov: true } }, 'mp4')).toEqual(['mov']);
    expect(encodeFilesOf({ files: { mp4: false } }, 'mp4')).toEqual([]);
  });

  it('gives a still no video files', () => {
    expect(encodeFilesOf({ files: { mxf: true } }, null)).toEqual([]);
  });

  it('merges files leaf by leaf like every other setting', () => {
    const merged = mergeEncodeSettings({ files: { mxf: true } }, { files: { mov: true }, fps: 25 });
    expect(merged).toEqual({ files: { mxf: true, mov: true }, fps: 25 });
    expect(flattenEncodeSettings(merged)).toMatchObject({ 'files.mxf': true, 'files.mov': true });
  });

  it('refuses an unknown container', () => {
    expect(encodeSettingsSchema.safeParse({ files: { avi: true } }).success).toBe(false);
  });
});

describe('describeEncodeSettings', () => {
  it('reads fps and files in one line', () => {
    expect(describeEncodeSettings({ fps: 25, files: { mxf: true } }, 'mp4')).toBe('25 fps · MP4 + MXF');
    expect(describeEncodeSettings({ fps: '30000/1001' }, 'mp4')).toBe('29.97 fps');
    expect(describeEncodeSettings({ fps: 'comp' }, 'mov')).toBe('Comp rate');
  });

  it('is null for template defaults and for stills', () => {
    expect(describeEncodeSettings(undefined, 'mp4')).toBeNull();
    expect(describeEncodeSettings({ fps: 25 }, null)).toBeNull();
  });

  it('says so when every file was turned off', () => {
    expect(describeEncodeSettings({ files: { mp4: false } }, 'mp4')).toBe('No file');
  });
});

describe('final renders', () => {
  const single = {
    brandId: BRAND,
    templateKey: '133',
    contractHash: 'abc',
    variables: {},
  };

  it('accepts final on single and batch preflight, and leaves it unset by default', () => {
    expect(apiRenderPreflightRequestSchema.parse({ ...single, final: true }).final).toBe(true);
    expect(apiRenderPreflightRequestSchema.parse(single).final).toBeUndefined();
    const batch = apiRenderBatchPreflightRequestSchema.parse({
      brandId: BRAND,
      templateKey: '133',
      contractHash: 'abc',
      records: [{ variables: {} }],
      final: true,
    });
    expect(batch.final).toBe(true);
  });
});

describe('job additions', () => {
  const job = {
    id: '37589754-b6bb-4eaf-9620-08de1c4f09ff',
    brandId: BRAND,
    templateKey: '133',
    templateName: 'StarCraft Promo',
    contractHash: 'abc',
    taskUid: null,
    status: 'finished',
    outputs: [],
    delivery: [],
    error: null,
    createdAt: '2026-09-18T00:00:00Z',
    updatedAt: '2026-09-18T00:00:00Z',
  };

  it('defaults renderInput and versionNumber to null for older servers', () => {
    const parsed = apiRenderJobSchema.parse({
      ...job,
      templateSource: {
        assetId: '6a49e1a8-0ee8-4101-bed7-1bdc8fd5e088',
        versionId: '6a49e1a8-0ee8-4101-bed7-1bdc8fd5e088',
        sha256: 'a'.repeat(64),
      },
    });
    expect(parsed.renderInput).toBeNull();
    expect(parsed.templateSource?.versionNumber).toBeNull();
    expect(parsed.test).toBe(true);
  });

  it('carries a final job and the values it was rendered with', () => {
    const parsed = apiRenderJobSchema.parse({
      ...job,
      test: false,
      renderInput: { headline: 'Phase black' },
    });
    expect(parsed.test).toBe(false);
    expect(parsed.renderInput).toEqual({ headline: 'Phase black' });
  });
});

describe('matchOutputFormat with several files per comp', () => {
  const formats = [
    { id: '16x9', ratio: '16:9', comp: { name: 'Card 16:9', width: 1920, height: 1080 } },
    { id: '9x16', ratio: '9:16', comp: { name: 'Card 9:16', width: 1080, height: 1920 } },
  ];

  it('maps the mp4, mov and mxf of one comp to the same format', () => {
    for (const name of ['Card_16_9_ab12cd.mp4', 'Card_16_9_ab12cd.mov', 'Card_16_9_ab12cd.mxf']) {
      expect(matchOutputFormat(name, formats)?.id).toBe('16x9');
    }
  });
});
