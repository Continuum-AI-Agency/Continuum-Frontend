import { describe, expect, it } from 'bun:test';
import { changelogEntrySchema } from './schema';

const valid = {
  id: '2026-07-20-thing',
  date: '2026-07-20',
  title: 'A shipped thing',
  body: 'It **works** now.',
  tag: 'new' as const,
};

describe('changelogEntrySchema', () => {
  it('accepts a well-formed entry (with and without a tag)', () => {
    expect(changelogEntrySchema.safeParse(valid).success).toBe(true);
    const { tag: _tag, ...withoutTag } = valid;
    expect(changelogEntrySchema.safeParse(withoutTag).success).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(changelogEntrySchema.safeParse({ ...valid, date: '2026-7-20' }).success).toBe(false);
    expect(changelogEntrySchema.safeParse({ ...valid, date: '07/20/2026' }).success).toBe(false);
  });

  it('rejects an empty title', () => {
    expect(changelogEntrySchema.safeParse({ ...valid, title: '' }).success).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(changelogEntrySchema.safeParse({ ...valid, body: '' }).success).toBe(false);
  });

  it('rejects an unknown tag', () => {
    expect(changelogEntrySchema.safeParse({ ...valid, tag: 'urgent' }).success).toBe(false);
  });
});
