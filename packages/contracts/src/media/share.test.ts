import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_SHARE_WATERMARK_TEMPLATE,
  isShareFeaturableFieldType,
  libraryShareRequestSchema,
  renderShareWatermarkText,
  type ShareLinkEventKind,
  shareBeaconEventRequestSchema,
  shareDeliveryRequestSchema,
  shareLinkBrandingSchema,
  shareLinkEventKindSchema,
  shareLinkEventSchema,
  shareLinkFromRow,
  shareLinkLayoutSchema,
  shareLinkSchema,
  shareLinkWatermarkSchema,
  summarizeShareActivity,
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

  it('names the file by asset, never by URL', () => {
    expect(
      shareDeliveryRequestSchema.safeParse({ token: 't'.repeat(20), assetId: ID }).success,
    ).toBe(true);
    expect(
      shareDeliveryRequestSchema.safeParse({
        token: 't'.repeat(20),
        files: [{ url: 'https://x.test/a', fileName: 'a', mimeType: 'image/png' }],
      }).success,
    ).toBe(false);
  });
});

describe('summarizeShareActivity', () => {
  const A = '22222222-2222-4222-8222-222222222222';
  const B = '33333333-3333-4333-8333-333333333333';
  const row = (kind: ShareLinkEventKind, assetId: string | null, viewerKey: string) => ({
    kind,
    assetId,
    assetTitle: assetId === A ? 'Hero cut' : 'Teaser',
    viewerKey,
    viewerName: viewerKey === 'ada' ? 'Ada' : null,
    viewerEmail: viewerKey === 'ada' ? 'ada@client.test' : null,
  });

  it('totals views, plays, downloads and comments per asset and per viewer', () => {
    const totals = summarizeShareActivity([
      row('open', null, 'ada'),
      row('view', A, 'ada'),
      row('view', A, 'anon'),
      row('play', A, 'ada'),
      row('download', A, 'ada'),
      row('comment', B, 'ada'),
      row('download_all', null, 'ada'),
      row('field_edit', A, 'ada'),
    ]);
    expect(totals.byAsset).toEqual([
      { assetId: A, title: 'Hero cut', views: 2, plays: 1, downloads: 1, comments: 0 },
      { assetId: B, title: 'Teaser', views: 0, plays: 0, downloads: 0, comments: 1 },
    ]);
    expect(totals.byViewer[0]).toEqual({
      viewerKey: 'ada',
      name: 'Ada',
      email: 'ada@client.test',
      views: 1,
      plays: 1,
      downloads: 2,
      comments: 1,
    });
    expect(totals.byViewer[1]?.views).toBe(1);
  });
});

describe('library-share edge requests', () => {
  const token = 't'.repeat(20);

  it('lets a guest report only page events, and set only a single featured value', () => {
    expect(
      libraryShareRequestSchema.safeParse({ action: 'record_event', token, kind: 'view' }).success,
    ).toBe(true);
    expect(
      libraryShareRequestSchema.safeParse({ action: 'record_event', token, kind: 'download' })
        .success,
    ).toBe(false);
    const edit = {
      action: 'edit_featured_field',
      token,
      sessionToken: 's'.repeat(40),
      assetId: ID,
      versionId: ID,
    };
    expect(libraryShareRequestSchema.safeParse({ ...edit, value: 'approved' }).success).toBe(true);
    expect(libraryShareRequestSchema.safeParse({ ...edit, value: ['a', 'b'] }).success).toBe(false);
  });

  it('asks for a link detail by id or by token, not both', () => {
    expect(
      libraryShareRequestSchema.safeParse({ action: 'share_link_detail', id: ID }).success,
    ).toBe(true);
    expect(
      libraryShareRequestSchema.safeParse({ action: 'share_link_detail', id: ID, token }).success,
    ).toBe(false);
  });

  it('maps a row whose hash was withheld through has_passcode', () => {
    const link = shareLinkFromRow({
      id: ID,
      brand_id: ID,
      token,
      scope: 'asset',
      asset_id: ID,
      collection_id: null,
      version_mode: 'live',
      pinned_version_id: null,
      allow_comments: true,
      allow_approval: false,
      allow_download: true,
      show_metadata: true,
      show_custom_fields: false,
      require_identity: false,
      has_passcode: true,
      permissions: 'view',
      created_by: null,
      expires_at: null,
      revoked_at: null,
      created_at: '2026-09-27T00:00:00Z',
      layout: 'bogus',
    });
    expect(link.policy.hasPasscode).toBe(true);
    expect(link.layout).toBe('grid');
  });
});
