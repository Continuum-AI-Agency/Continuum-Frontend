import { describe, expect, it } from 'bun:test';
import { canPersistBrandRecord } from './brandRecordGuard';

describe('canPersistBrandRecord', () => {
  it('allows persistence when the brand row does not exist yet (new brand)', () => {
    expect(canPersistBrandRecord(null, 'user-1')).toBe(true);
  });

  it('allows the creator to persist global fields on an existing brand', () => {
    expect(canPersistBrandRecord({ created_by: 'user-1' }, 'user-1')).toBe(true);
  });

  it('blocks a non-creator (invited member) from writing the brand record', () => {
    // The bug: an invited viewer/admin opening the brand overwrote brand_name
    // with "<their-name>'s Brand". They must be read-only on the brand row.
    expect(canPersistBrandRecord({ created_by: 'owner-1' }, 'viewer-2')).toBe(false);
  });

  it('blocks writes when the creator is unknown (defensive)', () => {
    expect(canPersistBrandRecord({ created_by: null }, 'user-1')).toBe(false);
  });
});
