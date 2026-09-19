import { describe, expect, it } from 'bun:test';
import {
  apiRenderBatchPreflightRequestSchema,
  apiRenderJobSchema,
  apiRenderPreflightRequestSchema,
  describeEncodeSettings,
  ENCODE_FILE_CONTAINERS,
  ENCODE_STYLES,
  encodeFilesOf,
  encodeSettingsSchema,
  encodeStyleFiles,
  encodeStyleOf,
  flattenEncodeSettings,
  isBucketOnlyRenderFile,
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

describe('output styles', () => {
  it('names every container, so a style replaces a mix instead of adding to it', () => {
    const broadcast = ENCODE_STYLES.find((style) => style.id === 'broadcast')!;
    expect(encodeStyleFiles(broadcast)).toEqual({
      mp4: true,
      mov: false,
      mxf: true,
      webm: false,
      gif: false,
    });
    expect(encodeFilesOf({ files: encodeStyleFiles(broadcast) }, 'mov')).toEqual(['mp4', 'mxf']);
  });

  it('round-trips: every style is the style of the files it makes, from either container', () => {
    for (const style of ENCODE_STYLES) {
      for (const container of ['mp4', 'mov'] as const) {
        const files = encodeFilesOf({ files: encodeStyleFiles(style) }, container);
        expect(encodeStyleOf(files)?.id).toBe(style.id);
      }
    }
  });

  it('keeps the MP4 in every style and uses only known files', () => {
    for (const style of ENCODE_STYLES) {
      expect(style.files).toContain('mp4');
      for (const file of style.files) expect(ENCODE_FILE_CONTAINERS).toContain(file);
    }
    expect(new Set(ENCODE_STYLES.map((style) => style.id)).size).toBe(ENCODE_STYLES.length);
  });

  it('is null for a mix no style names, whatever the order', () => {
    expect(encodeStyleOf(['mxf', 'mp4'])?.id).toBe('broadcast');
    expect(encodeStyleOf(['mp4', 'mov', 'mxf'])).toBeNull();
    expect(encodeStyleOf(['mov'])).toBeNull();
    expect(encodeStyleOf([])).toBeNull();
  });

  it('parses webm and gif as files', () => {
    expect(encodeSettingsSchema.parse({ files: { webm: true, gif: true } })).toEqual({
      files: { webm: true, gif: true },
    });
    expect(describeEncodeSettings({ files: { webm: true, gif: true } }, 'mp4')).toBe(
      'MP4 + WebM + GIF',
    );
  });
});

describe('bucket-only render files', () => {
  it('keeps masters in the fleet bucket and copies everything else to the Library', () => {
    for (const name of ['Card_16_9_ab.mov', 'Card_16_9_ab.MXF']) {
      expect(isBucketOnlyRenderFile(name)).toBe(true);
    }
    for (const name of ['Card_16_9_ab.mp4', 'Card.webm', 'Card.gif', 'Card.jpg', 'mov', '']) {
      expect(isBucketOnlyRenderFile(name)).toBe(false);
    }
  });
});

describe('describeEncodeSettings', () => {
  it('reads fps and files in one line', () => {
    expect(describeEncodeSettings({ fps: 25, files: { mxf: true } }, 'mp4')).toBe(
      '25 fps · MP4 + MXF',
    );
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

  it('maps every file of one comp to the same format', () => {
    for (const extension of ['mp4', 'mov', 'mxf', 'webm', 'gif']) {
      expect(matchOutputFormat(`Card_16_9_ab12cd.${extension}`, formats)?.id).toBe('16x9');
    }
  });

  it('splits a still/video tie on a gif or webm the video output delivers', () => {
    const tied = [
      { id: 'poster', ratio: '9:16', mediaType: 'JPG image (RGB)' },
      { id: 'story', ratio: '9:16', mediaType: 'MP4 Video (RGB)' },
    ];
    for (const extension of ['webm', 'gif']) {
      expect(matchOutputFormat(`Story_9_16_ab12cd.${extension}`, tied)?.id).toBe('story');
    }
    expect(matchOutputFormat('Story_9_16_ab12cd.jpg', tied)?.id).toBe('poster');
  });
});
