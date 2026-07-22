import { describe, expect, it } from 'bun:test';
import { buildDataUrl, parseDataUrl } from './dataUrl';

describe('dataUrl', () => {
  it('normalizes whitespace in parsed base64 data URLs', () => {
    expect(parseDataUrl('data:image/png;base64,QU JD\nRA==')?.base64).toBe('QUJDRA==');
  });

  it('normalizes whitespace when building data URLs', () => {
    expect(buildDataUrl('image/png', 'QU JD\nRA==')).toBe('data:image/png;base64,QUJDRA==');
  });
});
