import { describe, expect, it } from 'bun:test';
import { auditCopy } from './tiktokCopyAudit';

describe('TikTok Ads copy audit', () => {
  it('finds no user-visible line that sells TikTok Ads while it has no connector', () => {
    const selling = auditCopy().filter((hit) => hit.severity === 'FAIL');
    expect(selling.map((hit) => `${hit.file}:${hit.line} ${hit.text}`)).toEqual([]);
  });
});
