import { describe, expect, it } from 'bun:test';

import { storedAccountReadDocSchema, storedAccountReadRowSchema } from './stored-account-read';

describe('the stored account read row', () => {
  // A row is created QUEUED and only later carries a document, and the completion RPC stores
  // `read = coalesce(p_read, read)`. The Jaina tool's own copy of this shape declared `read`
  // non-nullable and parsed strictly, so a real row threw inside the tool.
  it('admits a row that exists with no document yet', () => {
    const parsed = storedAccountReadRowSchema.parse({
      id: 'r1',
      utc_day: '2026-09-21',
      read: null,
      ready_at: null,
    });
    expect(parsed.read).toBeNull();
  });

  it('admits a row whose document is simply absent from the payload', () => {
    expect(storedAccountReadRowSchema.parse({ id: 'r1' }).read).toBeNull();
  });

  it('keeps a key it has never heard of, so a new producer field cannot break a reader', () => {
    const parsed = storedAccountReadRowSchema.parse({
      id: 'r1',
      read: { candidates: [], guards: [], something_new: 7 },
      an_unknown_row_key: 'x',
    });
    expect((parsed.read as Record<string, unknown>).something_new).toBe(7);
    expect((parsed as Record<string, unknown>).an_unknown_row_key).toBe('x');
  });

  // These three were added to the producer and to ONE consumer each, in separate commits in
  // separate repositories. Two of the four hand-rolled copies never learned about them.
  it('carries the fields the copies kept missing', () => {
    const doc = storedAccountReadDocSchema.parse({
      candidates: [],
      guards: [],
      assumptions: ['measured like a purchase'],
      ceiling_defaults: { structure: 'recommend' },
      deck: { applies: 20, total: 25, muted: ['post_click'] },
    });
    expect(doc.assumptions).toEqual(['measured like a purchase']);
    expect(doc.ceiling_defaults.structure).toBe('recommend');
    expect(doc.deck?.applies).toBe(20);
  });

  it('defaults them rather than refusing a document written before they existed', () => {
    const doc = storedAccountReadDocSchema.parse({ candidates: [], guards: [] });
    expect(doc.assumptions).toEqual([]);
    expect(doc.ceiling_defaults).toEqual({});
    expect(doc.deck).toBeNull();
    expect(doc.model).toBe('deterministic');
  });
});
