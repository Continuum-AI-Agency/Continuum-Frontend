import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_SHARE_WATERMARK_TEMPLATE,
  isShareFeaturableFieldType,
  renderShareWatermarkText,
  shareBeaconEventRequestSchema,
  shareDeliveryRequestSchema,
  shareLinkBrandingSchema,
  shareLinkEventKindSchema,
  shareLinkEventSchema,
  shareLinkLayoutSchema,
  shareLinkSchema,
  shareLinkWatermarkSchema,
  updateShareLinkRequestSchema,
} from './share';

const ID = '11111111-1111-4111-8111-111111111111';

const storedLink = {
  id: ID,
  brandId: ID,
  token: 'tok',
  scope: 'asset',
  assetId: ID,
  permissions: 'view',
  policy: {
    versionMode: 'live',
    pinnedVersionId: null,
    allowComments: true,
    allowApproval: false,
    allowDownload: true,
    showMetadata: true,
    showCustomFields: false,
    requireIdentity: false,
    hasPasscode: false,
  },
  createdAt: '2026-09-27T00:00:00Z',
} as const;

describe('share link presentation', () => {
  it('defaults a legacy row to the grid layout, empty branding, no watermark', () => {
    const parsed = shareLinkSchema.parse(storedLink);
    expect(parsed.layout).toBe('grid');
    expect(parsed.branding).toEqual({});
    expect(parsed.watermark).toBeUndefined();
  });

  it('carries layout, branding, watermark and a featured field', () => {
    const parsed = shareLinkSchema.parse({
      ...storedLink,
      layout: 'reel',
      branding: { accent: '#112233', theme: 'dark', headerTitle: 'Spring cuts' },
      watermark: { position: 'tiled', opacity: 0.2, burnDownloads: true },
      featuredFieldId: ID,
    });
    expect(parsed.watermark?.template).toBe(DEFAULT_SHARE_WATERMARK_TEMPLATE);
    expect(parsed.featuredFieldId).toBe(ID);
  });

  it('rejects a bad layout, a named accent colour, and an out-of-range opacity', () => {
    expect(shareLinkLayoutSchema.safeParse('board').success).toBe(false);
    expect(shareLinkBrandingSchema.safeParse({ accent: 'red' }).success).toBe(false);
    expect(shareLinkBrandingSchema.safeParse({ headerTitle: 'x'.repeat(121) }).success).toBe(false);
    expect(
      shareLinkWatermarkSchema.safeParse({
        position: 'center',
        opacity: 0.01,
        burnDownloads: false,
      }).success,
    ).toBe(false);
    expect(
      shareLinkWatermarkSchema.safeParse({ position: 'middle', opacity: 0.5, burnDownloads: false })
        .success,
    ).toBe(false);
  });
});

describe('share link events', () => {
  it('parses an anonymous download event', () => {
    const event = {
      id: ID,
      shareLinkId: ID,
      brandId: ID,
      reviewerSessionId: null,
      assetId: ID,
      versionId: null,
      kind: 'download_all',
      ipHash: 'abc',
      userAgent: null,
      createdAt: '2026-09-27T00:00:00Z',
    } as const;
    expect(shareLinkEventSchema.parse(event)).toEqual(event);
  });

  it('rejects an unknown event kind', () => {
    expect(shareLinkEventKindSchema.safeParse('field_edit').success).toBe(true);
    expect(shareLinkEventKindSchema.safeParse('share').success).toBe(false);
  });
});

describe('renderShareWatermarkText', () => {
  const time = new Date('2026-09-27T08:05:00Z');

  it('names the viewer in the default template', () => {
    expect(
      renderShareWatermarkText(DEFAULT_SHARE_WATERMARK_TEMPLATE, {
        name: 'Ada Client',
        email: 'ada@client.test',
        time,
      }),
    ).toBe('Ada Client · ada@client.test · 2026-09-27 08:05 UTC');
  });

  it('fills {ip} and drops dangling separators when a token is empty', () => {
    expect(
      renderShareWatermarkText('{name} · {ip}', {
        name: 'Ada',
        email: null,
        ip: '203.0.113.9',
        time,
      }),
    ).toBe('Ada · 203.0.113.9');
    expect(renderShareWatermarkText('{name} · {ip}', { name: 'Ada', email: null, time })).toBe(
      'Ada',
    );
  });
});

describe('share owner and delivery requests', () => {
  it('accepts a layout, order and watermark edit and refuses a client-sent actor', () => {
    const edit = {
      brandId: ID,
      shareLinkId: ID,
      idempotencyKey: 'k',
      layout: 'reel',
      assetOrder: [ID],
      watermark: { template: '{name}', position: 'tiled', opacity: 0.4, burnDownloads: true },
    };
    expect(updateShareLinkRequestSchema.safeParse(edit).success).toBe(true);
    expect(updateShareLinkRequestSchema.safeParse({ ...edit, actor: ID }).success).toBe(false);
  });

  it('only lets the browser beacon report open, view and play', () => {
    expect(shareBeaconEventRequestSchema.safeParse({ kind: 'view', assetId: ID }).success).toBe(
      true,
    );
    expect(shareBeaconEventRequestSchema.safeParse({ kind: 'download' }).success).toBe(false);
  });

  it('only features single-value types a guest can set', () => {
    expect(isShareFeaturableFieldType('status')).toBe(true);
    expect(isShareFeaturableFieldType('user')).toBe(false);
    expect(isShareFeaturableFieldType('multi_select')).toBe(false);
  });

  it('bounds a delivery request', () => {
    const file = {
      url: 'https://x.supabase.co/storage/v1/object/sign/a/b',
      fileName: 'a.png',
      mimeType: 'image/png',
    };
    expect(
      shareDeliveryRequestSchema.safeParse({ token: 't'.repeat(20), files: [file] }).success,
    ).toBe(true);
    expect(shareDeliveryRequestSchema.safeParse({ token: 't'.repeat(20), files: [] }).success).toBe(
      false,
    );
  });
});
