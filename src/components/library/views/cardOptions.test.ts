import { describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import {
  CARD_DRAWN_FIELDS,
  cardAspectClass,
  cardFieldSortValue,
  cardFieldValue,
  cardGridTemplate,
  isBuiltInCardField,
  memberNameLookup,
  chosenCustomFieldIds,
  formatDurationMs,
  toggleCardField,
  visibleCardFields,
} from './cardOptions';

const FIELD_ID = '7c2cc78f-6d3b-4d10-8e37-4fa03fabab21';

describe('card fields', () => {
  it('shows title and created date until the user chooses otherwise', () => {
    expect(visibleCardFields(undefined)).toEqual(['title', 'created']);
    expect(visibleCardFields({})).toEqual(['title', 'created']);
    expect(visibleCardFields({ fields: [] })).toEqual([]);
  });

  it('separates custom field ids from the built-in keys', () => {
    expect(chosenCustomFieldIds({ fields: ['title', FIELD_ID, 'size'] })).toEqual([FIELD_ID]);
    expect(chosenCustomFieldIds(undefined)).toEqual([]);
  });

  it('toggles a field on and off, keeping the order of the rest', () => {
    expect(toggleCardField(['title', 'created'], 'size')).toEqual(['title', 'created', 'size']);
    expect(toggleCardField(['title', 'created', 'size'], 'created')).toEqual(['title', 'size']);
  });
});

describe('card geometry', () => {
  it('maps each size to a min column width and leaves an unset size to the breakpoints', () => {
    expect(cardGridTemplate('sm')).toContain('150px');
    expect(cardGridTemplate('lg')).toContain('300px');
    expect(cardGridTemplate(undefined)).toBeUndefined();
  });

  it('forces a shape for every aspect except original', () => {
    expect(cardAspectClass('square')).toBe('aspect-square');
    expect(cardAspectClass('portrait')).toBe('aspect-[4/5]');
    expect(cardAspectClass('landscape')).toBe('aspect-video');
    expect(cardAspectClass('original')).toBeNull();
    expect(cardAspectClass(undefined)).toBeNull();
  });
});

describe('formatDurationMs', () => {
  it('prints m:ss and nothing for an unknown or zero duration', () => {
    expect(formatDurationMs(65_400)).toBe('1:05');
    expect(formatDurationMs(3_723_000)).toBe('1:02:03');
    expect(formatDurationMs(0)).toBeNull();
    expect(formatDurationMs(null)).toBeNull();
  });
});

const VIDEO: MediaAsset = {
  id: 'a1',
  brandId: 'b1',
  createdBy: 'u1',
  kind: 'video',
  bucket: 'media',
  storagePath: 'b1/a1.mov',
  fileName: 'Launch cut.mov',
  mimeType: 'video/quicktime',
  sizeBytes: 5 * 1024 * 1024,
  width: 3840,
  height: 2160,
  durationMs: 12_500,
  source: 'upload',
  status: 'ready',
  reviewStatus: 'none',
  tags: ['launch', 'hero'],
  detectedObjects: [],
  hasImageEmbedding: false,
  createdAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
  videoCodec: 'ProRes 422 HQ',
  frameRate: 29.97,
  bitRate: 184_320_000,
  videoBitRate: 183_000_000,
  colorSpace: 'bt709',
  dynamicRange: 'hlg',
  bitDepth: 10,
  hasAlpha: false,
  startTimecode: '01:00:00:00',
  endTimecode: '01:00:12:15',
  audioCodec: 'PCM',
  audioBitRate: 1_536_000,
  audioChannels: 2,
  audioSampleRate: 48_000,
  audioBitDepth: 24,
  hasLocation: true,
  notes: '  Approved for EMEA  ',
  transcript: '',
};

describe('cardFieldValue', () => {
  it('formats every technical field of a probed video', () => {
    const value = (key: string) => cardFieldValue(VIDEO, key);
    expect(value('videoCodec')).toBe('ProRes 422 HQ');
    expect(value('frameRate')).toBe('29.97 fps');
    expect(value('bitRate')).toBe('184.3 Mb/s');
    expect(value('dynamicRange')).toBe('HLG');
    expect(value('bitDepth')).toBe('10-bit');
    expect(value('hasAlpha')).toBe('No');
    expect(value('startTimecode')).toBe('01:00:00:00');
    expect(value('endTimecode')).toBe('01:00:12:15');
    expect(value('audioBitRate')).toBe('1.5 Mb/s');
    expect(value('audioChannels')).toBe('Stereo');
    expect(value('audioSampleRate')).toBe('48 kHz');
    expect(value('audioBitDepth')).toBe('24-bit');
    expect(value('dimensions')).toBe('3840 × 2160');
    expect(value('duration')).toBe('0:13');
    expect(value('format')).toBe('MOV');
    expect(value('kind')).toBe('Video');
    expect(value('hasLocation')).toBe('Has GPS');
    expect(value('notes')).toBe('Approved for EMEA');
    expect(value('tags')).toBe('launch, hero');
    expect(value('transcript')).toBe('No speech');
  });

  it('reads nothing for a field the asset has not been probed for', () => {
    const bare: MediaAsset = { ...VIDEO, videoCodec: null, frameRate: undefined, notes: '  ' };
    expect(cardFieldValue(bare, 'videoCodec')).toBeNull();
    expect(cardFieldValue(bare, 'frameRate')).toBeNull();
    expect(cardFieldValue(bare, 'notes')).toBeNull();
    expect(cardFieldValue(bare, 'pageCount')).toBeNull();
    expect(cardFieldValue(bare, 'not-a-field')).toBeNull();
  });

  it('takes looked-up facts from the surface: comment count, member names, review label', () => {
    const lookups = {
      commentCount: (id: string) => (id === 'a1' ? 0 : undefined),
      memberName: (id: string) => (id === 'u1' ? 'Ana' : undefined),
      reviewLabel: () => 'Approved',
    };
    expect(cardFieldValue(VIDEO, 'comments', lookups)).toBe('0');
    expect(cardFieldValue(VIDEO, 'uploader', lookups)).toBe('Ana');
    expect(cardFieldValue({ ...VIDEO, createdBy: 'gone' }, 'uploader', lookups)).toBe('Former member');
    expect(cardFieldValue(VIDEO, 'review', lookups)).toBe('Approved');
    expect(cardFieldValue(VIDEO, 'comments')).toBeNull();
    // No member lookup yet (still loading) reads as unknown, never as a former member.
    expect(cardFieldValue(VIDEO, 'uploader')).toBeNull();
  });

  it('sorts numeric fields as numbers and the rest as lower-case text', () => {
    expect(cardFieldSortValue(VIDEO, 'frameRate')).toBe(29.97);
    expect(cardFieldSortValue(VIDEO, 'videoCodec')).toBe('prores 422 hq');
    expect(cardFieldSortValue(VIDEO, 'comments', { commentCount: () => 4 })).toBe(4);
  });

  it('knows which keys are built in and which ones MediaCard draws itself', () => {
    expect(isBuiltInCardField('frameRate')).toBe(true);
    expect(isBuiltInCardField('7c2cc78f-6d3b-4d10-8e37-4fa03fabab21')).toBe(false);
    expect(CARD_DRAWN_FIELDS.has('title')).toBe(true);
    expect(CARD_DRAWN_FIELDS.has('frameRate')).toBe(false);
  });
});

describe('memberNameLookup', () => {
  it('names members once the list has loaded, and offers no lookup for a missing or empty list', () => {
    const lookup = memberNameLookup([{ userId: 'u1', label: 'Ana' }]);
    expect(lookup?.('u1')).toBe('Ana');
    expect(lookup?.('gone')).toBeUndefined();
    expect(memberNameLookup(null)).toBeUndefined();
    expect(memberNameLookup([])).toBeUndefined();
  });
});
