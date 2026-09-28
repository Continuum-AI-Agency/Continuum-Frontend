import { describe, expect, it } from 'bun:test';
import {
  addCommentReactionRequestSchema,
  buildMentionToken,
  commentAnnotationSchema,
  commentAttachmentSchema,
  commentMentionSchema,
  commentReactionSchema,
  createCommentRequestSchema,
  mediaCommentSchema,
  parseCommentHashtags,
  parseCommentMentions,
  splitCommentBodyForRender,
  stripMentionTokensForExcerpt,
} from './comments';
import {
  commentMentionPayloadSchema,
  commentReplyPayloadSchema,
  parseNotificationPayload,
  reviewStatusChangePayloadSchema,
} from './notifications';

describe('mention tokens', () => {
  it('builds and parses round-trip', () => {
    const body = `hey ${buildMentionToken('u-1', 'Ana Silva')} look at ${buildMentionToken('u-2', 'Bo')} — ${buildMentionToken('u-1', 'Ana again')}`;
    expect(parseCommentMentions(body)).toEqual([{ userId: 'u-1' }, { userId: 'u-2' }]);
  });

  it('splits body into text and mention segments in order', () => {
    const segments = splitCommentBodyForRender(
      `pre ${buildMentionToken('u-1', 'Ana')} mid ${buildMentionToken('u-2', 'Bo')} post`,
    );
    expect(segments).toEqual([
      { kind: 'text', text: 'pre ' },
      { kind: 'mention', userId: 'u-1', label: 'Ana' },
      { kind: 'text', text: ' mid ' },
      { kind: 'mention', userId: 'u-2', label: 'Bo' },
      { kind: 'text', text: ' post' },
    ]);
  });

  it('returns a single text segment for a body without mentions', () => {
    expect(splitCommentBodyForRender('no tags here')).toEqual([
      { kind: 'text', text: 'no tags here' },
    ]);
  });

  it('does not match malformed or foreign protocols', () => {
    expect(parseCommentMentions('@[X](https://evil.example/u-1)')).toEqual([]);
    expect(parseCommentMentions('@[X](continuum-user://)')).toEqual([]);
  });

  it('strips tokens to readable @labels for excerpts', () => {
    const excerpt = stripMentionTokensForExcerpt(`ping ${buildMentionToken('u-1', 'Ana')}`);
    expect(excerpt).toBe('ping @Ana');
  });

  it('truncates long excerpts with an ellipsis', () => {
    const excerpt = stripMentionTokensForExcerpt('x'.repeat(200), 10);
    expect(excerpt.length).toBe(10);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});

describe('comment schemas with mentions', () => {
  const baseCreate = {
    brandId: 'b-1',
    assetId: 'a-1',
    body: `hi ${buildMentionToken('u-1', 'Ana')}`,
  };

  it('accepts a create request carrying mentions', () => {
    const parsed = createCommentRequestSchema.parse({
      ...baseCreate,
      mentions: [{ userId: 'u-1' }],
    });
    expect(parsed.mentions).toEqual([{ userId: 'u-1' }]);
  });

  it('defaults mentions on the read model when absent (legacy rows)', () => {
    const parsed = mediaCommentSchema.parse({
      id: 'c-1',
      brandId: 'b-1',
      assetId: 'a-1',
      body: 'legacy',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(parsed.mentions).toEqual([]);
  });

  it('rejects an oversized mention list', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ userId: `u-${i}` }));
    expect(createCommentRequestSchema.safeParse({ ...baseCreate, mentions: many }).success).toBe(
      false,
    );
  });
});

describe('typed notification payloads', () => {
  const base = { assetId: 'a-1', assetName: 'Reel v2', actorName: 'Ana' };

  it('parses a comment_mention payload with excerpt', () => {
    const payload = { ...base, commentId: 'c-1', excerpt: 'ping @Bo' };
    expect(commentMentionPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('keeps status optional but typed on review_status_change', () => {
    expect(reviewStatusChangePayloadSchema.parse({ ...base, status: 'approved' }).status).toBe(
      'approved',
    );
  });

  it('requires assetId/assetName/actorName on every producer payload', () => {
    expect(commentReplyPayloadSchema.safeParse({ assetId: 'a-1' }).success).toBe(false);
  });

  it('parseNotificationPayload routes by kind and falls back permissively', () => {
    expect(parseNotificationPayload('comment_mention', { ...base })).toEqual(base);
    expect(parseNotificationPayload('review_request', { anything: true })).toEqual({
      anything: true,
    });
  });
});

describe('comment attachments', () => {
  const ASSET = '11111111-1111-4111-8111-111111111111';
  const VERSION = '21111111-1111-4111-8111-111111111111';
  const baseCreate = { brandId: 'b-1', assetId: 'a-1', body: 'use this take' };

  it('accepts a create request with an asset and an exact-version attachment', () => {
    const attachments = [{ assetId: ASSET }, { assetId: ASSET, versionId: VERSION }];
    expect(createCommentRequestSchema.parse({ ...baseCreate, attachments }).attachments).toEqual(
      attachments,
    );
  });

  it('rejects more than ten attachments and a non-uuid asset', () => {
    const eleven = Array.from({ length: 11 }, () => ({ assetId: ASSET }));
    expect(
      createCommentRequestSchema.safeParse({ ...baseCreate, attachments: eleven }).success,
    ).toBe(false);
    expect(commentAttachmentSchema.safeParse({ assetId: 'a-1' }).success).toBe(false);
  });

  it('defaults attachments to [] on legacy comment rows', () => {
    const parsed = mediaCommentSchema.parse({
      id: 'c-1',
      brandId: 'b-1',
      assetId: 'a-1',
      body: 'legacy',
      createdAt: '2026-09-27T00:00:00Z',
      updatedAt: '2026-09-27T00:00:00Z',
    });
    expect(parsed.attachments).toEqual([]);
  });
});

describe('page and orbit anchors', () => {
  it('pins a point, a box or a drawing to a page', () => {
    for (const annotation of [
      { kind: 'point', x: 0.25, y: 0.75, page: 3 },
      { kind: 'box', x: 0.1, y: 0.1, width: 0.2, height: 0.2, page: 1 },
      {
        kind: 'freehand',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        page: 12,
      },
      {
        kind: 'point',
        x: 0.5,
        y: 0.5,
        page: 2,
        shapes: [{ tool: 'box', color: '#FF0000', x: 0, y: 0, width: 0.5, height: 0.5 }],
      },
    ]) {
      expect(commentAnnotationSchema.parse(annotation)).toEqual(annotation as never);
    }
  });

  it.each([0, -1, 1.5])('refuses page %p', (page) => {
    expect(commentAnnotationSchema.safeParse({ kind: 'point', x: 0.5, y: 0.5, page }).success).toBe(
      false,
    );
  });

  it('pins a point to the camera it was placed from', () => {
    const annotation = {
      kind: 'point',
      x: 0.4,
      y: 0.6,
      orbit: { azimuthDeg: -135, polarDeg: 60, distance: 2.5 },
    } as const;
    expect(commentAnnotationSchema.parse(annotation)).toEqual(annotation);
    expect(
      commentAnnotationSchema.safeParse({ ...annotation, orbit: { azimuthDeg: 0, polarDeg: 60 } })
        .success,
    ).toBe(true);
  });

  it('holds the orbit to a real camera', () => {
    for (const orbit of [
      { azimuthDeg: 0, polarDeg: 181 },
      { azimuthDeg: 0, polarDeg: 90, distance: 0 },
      { azimuthDeg: Number.POSITIVE_INFINITY, polarDeg: 90 },
      { azimuthDeg: 0 },
    ]) {
      expect(commentAnnotationSchema.safeParse({ kind: 'point', x: 0, y: 0, orbit }).success).toBe(
        false,
      );
    }
  });

  it('keeps every older annotation parseable', () => {
    expect(
      commentAnnotationSchema.safeParse({ kind: 'time', timeMs: 1000, endMs: 2000 }).success,
    ).toBe(true);
    expect(commentAnnotationSchema.safeParse({ kind: 'point', x: 0.5, y: 0.5 }).success).toBe(true);
  });
});

describe('hashtags', () => {
  // The same strings the migration test feeds media.comment_hashtags.
  it('matches the database: lower-cased, distinct, in order; #2 and URL fragments are not tags', () => {
    expect(
      parseCommentHashtags('Tighten the #Hero crop, #hero again, fix #2 — see https://x.co/a#frag'),
    ).toEqual(['hero']);
    expect(
      parseCommentHashtags(
        `Now #Legal and #Añejo ${buildMentionToken('11111111-1111-4111-8111-111111111111', 'Ana #vip')}`,
      ),
    ).toEqual(['legal', 'añejo']);
    expect(parseCommentHashtags('Love the #Hero shot! &#39; ##dup #Añejo_Día end#no')).toEqual([
      'hero',
      'añejo_día',
    ]);
  });

  it('finds a tag at the start of the body and after a newline', () => {
    expect(parseCommentHashtags('#first\n#second')).toEqual(['first', 'second']);
    expect(parseCommentHashtags('')).toEqual([]);
  });

  it('is optional on a comment so hand-built comments still parse', () => {
    const comment = {
      id: 'c1',
      brandId: 'b1',
      assetId: 'a1',
      body: 'x',
      createdAt: '2026-09-27T00:00:00Z',
      updatedAt: '2026-09-27T00:00:00Z',
    };
    expect(mediaCommentSchema.parse(comment).hashtags).toBeUndefined();
    expect(mediaCommentSchema.parse({ ...comment, hashtags: ['hero'] }).hashtags).toEqual(['hero']);
  });
});

describe('reactions', () => {
  const reaction = {
    commentId: '11111111-1111-4111-8111-111111111111',
    brandId: '22222222-2222-4222-8222-222222222222',
    assetId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
    emoji: '👍',
    createdAt: '2026-09-27T00:00:00Z',
  };

  it('parses a stored reaction, including a ZWJ emoji', () => {
    expect(commentReactionSchema.parse(reaction)).toEqual(reaction);
    expect(commentReactionSchema.safeParse({ ...reaction, emoji: '👩‍💻' }).success).toBe(true);
  });

  it('refuses an empty, spaced or overlong emoji', () => {
    for (const emoji of ['', 'a b', 'x'.repeat(33)]) {
      expect(
        addCommentReactionRequestSchema.safeParse({ commentId: reaction.commentId, emoji }).success,
      ).toBe(false);
    }
  });
});
