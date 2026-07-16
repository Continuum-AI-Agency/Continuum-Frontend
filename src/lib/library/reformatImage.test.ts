import { describe, expect, it } from 'bun:test';

import { parseReformatEventLine } from './reformatImage';

describe('parseReformatEventLine', () => {
  it('validates a completed SSE event against the shared contract', () => {
    expect(
      parseReformatEventLine(
        'data: {"type":"reformat.completed","data":{"requestId":"11111111-1111-4111-8111-111111111111","assetId":"22222222-2222-4222-8222-222222222222","versionId":"33333333-3333-4333-8333-333333333333","sourceVersionId":"44444444-4444-4444-8444-444444444444","outputMode":"derivative","signedUrl":"https://example.com/out.png","bucket":"assets","storagePath":"out.png","fileName":"out.png","mimeType":"image/png","width":1080,"height":1920,"aspectRatio":"9:16"}}',
      ),
    ).toMatchObject({ type: 'reformat.completed', data: { aspectRatio: '9:16' } });
  });

  it('ignores keep-alives and malformed events', () => {
    expect(parseReformatEventLine(': keep-alive')).toBeNull();
    expect(parseReformatEventLine('data: {"type":"surprise"}')).toBeNull();
  });
});
