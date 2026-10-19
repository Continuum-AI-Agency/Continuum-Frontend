import { describe, expect, it } from 'bun:test';

import { organicStreamFrameSchema } from '../streaming/organic';
import {
  CHAT_MEDIA_ITEM_MAX_BYTES,
  CHAT_MEDIA_LABEL_MAX_CHARS,
  CHAT_MEDIA_SIGN_MAX_REFS,
  CHAT_MEDIA_STRIP_MAX_ITEMS,
  type ChatMediaRef,
  chatMediaItemSchema,
  chatMediaRefKey,
  chatMediaSignRequestSchema,
  chatMediaSignResponseSchema,
  uiMediaStripFrameSchema,
} from './chat-media';
import {
  PERSISTED_AUX_FRAME_TYPES,
  persistedFrameKey,
  persistedOrganicFrameSchema,
} from './persistedFrames';

const ASSET = '6f1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const VERSION = '7a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';

const REFS: ChatMediaRef[] = [
  { type: 'library', assetId: ASSET },
  { type: 'library', assetId: ASSET, versionId: VERSION },
  { type: 'draft', draftId: ASSET },
  { type: 'draft', draftId: ASSET, slide: 2 },
  { type: 'platform', platform: 'instagram', mediaId: '17890000000000001' },
  { type: 'competitor', source: 'instagram', id: '17890000000000002' },
  { type: 'competitor', source: 'meta_ad', id: ASSET },
  { type: 'headless', assetId: ASSET },
];

const strip = (items: unknown[]) => ({
  type: 'ui.media_strip',
  data: { toolCallId: 'call_1', toolName: 'listDrafts', items, total: items.length },
});

describe('chatMediaItemSchema', () => {
  it('parses one item per ref kind', () => {
    for (const ref of REFS)
      expect(chatMediaItemSchema.safeParse({ ref, kind: 'image', w: null, h: null }).success).toBe(
        true,
      );
  });

  it('refuses a URL riding on an item or its ref', () => {
    const base = { ref: REFS[0], kind: 'image', w: 1080, h: 1350 };
    expect(chatMediaItemSchema.safeParse({ ...base, thumbUrl: 'https://x/y.jpg' }).success).toBe(
      false,
    );
    expect(chatMediaItemSchema.safeParse({ ...base, transcript: 'hello' }).success).toBe(false);
    expect(
      chatMediaItemSchema.safeParse({ ...base, ref: { ...REFS[4], url: 'https://cdn/x.jpg' } })
        .success,
    ).toBe(false);
  });

  it('holds the largest legal item inside the per-item budget', () => {
    const item = {
      ref: { type: 'draft', draftId: 'd'.repeat(160), slide: 19 },
      kind: 'carousel',
      w: 4096,
      h: 4096,
      durationMs: 600_000,
      permalink: `https://www.instagram.com/p/${'a'.repeat(470)}`,
      label: 'é'.repeat(CHAT_MEDIA_LABEL_MAX_CHARS),
    };
    expect(chatMediaItemSchema.safeParse(item).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(item))).toBeLessThanOrEqual(CHAT_MEDIA_ITEM_MAX_BYTES);
  });
});

describe('chatMediaRefKey', () => {
  it('gives every ref its own key', () => {
    const keys = REFS.map(chatMediaRefKey);
    expect(new Set(keys).size).toBe(REFS.length);
    expect(chatMediaRefKey({ type: 'draft', draftId: 'd1', slide: 0 })).toBe('draft:d1');
  });
});

describe('ui.media_strip frame', () => {
  const item = { ref: REFS[2], kind: 'video', w: 1080, h: 1920, durationMs: 15_000 };

  it('is a member of the organic stream union', () => {
    expect(organicStreamFrameSchema.safeParse(strip([item])).success).toBe(true);
  });

  it('caps the strip and refuses an empty one', () => {
    expect(uiMediaStripFrameSchema.safeParse(strip([])).success).toBe(false);
    const full = Array.from({ length: CHAT_MEDIA_STRIP_MAX_ITEMS + 1 }, () => item);
    expect(uiMediaStripFrameSchema.safeParse(strip(full)).success).toBe(false);
  });

  it('persists one strip per tool call', () => {
    const frame = strip([item]);
    expect(persistedFrameKey(frame.type, frame.data, 9)).toBe('media_strip:call_1');
  });

  it('still knows an old persisted media.search_results frame as itself, not as a fallback', () => {
    const legacy = {
      type: 'media.search_results',
      data: { query: 'beach', mode: 'text', items: [] },
    };
    // The typed union, not the loose { type, data } arm every frame passes.
    expect(organicStreamFrameSchema.safeParse(legacy).success).toBe(true);
    expect(persistedOrganicFrameSchema.safeParse(legacy).success).toBe(true);
    expect(PERSISTED_AUX_FRAME_TYPES).toContain('media.search_results');
  });
});

describe('sign on view', () => {
  it('accepts a batch up to the cap and refuses one past it', () => {
    const refs = Array.from({ length: CHAT_MEDIA_SIGN_MAX_REFS }, () => REFS[0]);
    expect(chatMediaSignRequestSchema.safeParse({ brandId: ASSET, refs }).success).toBe(true);
    expect(
      chatMediaSignRequestSchema.safeParse({ brandId: ASSET, refs: [...refs, REFS[0]] }).success,
    ).toBe(false);
  });

  it('parses a response with a missing tile and a relative proxy path', () => {
    const parsed = chatMediaSignResponseSchema.safeParse({
      items: [
        { key: 'library:x', thumbUrl: null, expiresAt: '2026-10-18T12:00:00.000Z' },
        {
          key: 'platform:instagram:1',
          thumbUrl: '/api/organic/agent/media/thumb?t=abc.def',
          expiresAt: '2026-10-18T12:00:00.000Z',
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
