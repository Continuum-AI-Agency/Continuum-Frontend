import { describe, expect, it } from 'bun:test';
import {
  buildMentionToken,
  commentMentionSchema,
  createCommentRequestSchema,
  mediaCommentSchema,
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
