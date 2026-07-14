import { describe, expect, it } from 'bun:test';

import { parseReformatEventLine } from './reformatImage';

describe('parseReformatEventLine', () => {
  it('validates a completed SSE event against the shared contract', () => {
    expect(
      parseReformatEventLine(
        'data: {"type":"reformat.completed","data":{"requestId":"11111111-1111-4111-8111-111111111111","assetId":"22222222-2222-4222-8222-222222222222","signedUrl":"https://example.com/out.png","bucket":"assets","storagePath":"out.png","fileName":"out.png","mimeType":"image/png","width":1080,"height":1920,"aspectRatio":"9:16"}}',
      ),
    ).toMatchObject({ type: 'reformat.completed', data: { aspectRatio: '9:16' } });
  });

  it('ignores keep-alives and malformed events', () => {
    expect(parseReformatEventLine(': keep-alive')).toBeNull();
    expect(parseReformatEventLine('data: {"type":"surprise"}')).toBeNull();
  });
});
