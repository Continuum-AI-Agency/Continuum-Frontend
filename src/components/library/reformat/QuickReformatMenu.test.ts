import { describe, expect, test } from 'bun:test';

import { canQuickReformat } from './QuickReformatMenu';

describe('canQuickReformat', () => {
  test('keeps a private image eligible when its preview URL is absent or expired', () => {
    expect(
      canQuickReformat(
        {
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          kind: 'image',
        },
        'bbbbbbbb-0000-4000-8000-000000000001',
      ),
    ).toBe(true);
  });

  test('rejects non-image assets and missing brand authority', () => {
    expect(
      canQuickReformat(
        { id: 'aaaaaaaa-0000-4000-8000-000000000001', kind: 'video' },
        'bbbbbbbb-0000-4000-8000-000000000001',
      ),
    ).toBe(false);
    expect(
      canQuickReformat({ id: 'aaaaaaaa-0000-4000-8000-000000000001', kind: 'image' }, null),
    ).toBe(false);
  });
});
