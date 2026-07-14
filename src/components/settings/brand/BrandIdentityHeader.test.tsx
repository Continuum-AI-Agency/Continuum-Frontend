import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandIdentityHeader } from './BrandIdentityHeader';

describe('BrandIdentityHeader', () => {
  test('presents the brand context and one copy action', () => {
    const markup = renderToStaticMarkup(
      <BrandIdentityHeader brandId="brand-123" name="Acme" logoUrl={null} />,
    );

    expect(markup).toContain('Acme');
    expect(markup).toContain('brand-123');
    expect(markup.match(/Copy brand ID/g)).toHaveLength(1);
    expect(markup).toContain('Switch brand');
  });
});
