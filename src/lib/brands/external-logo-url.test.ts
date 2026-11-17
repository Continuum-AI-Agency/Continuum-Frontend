import { describe, expect, it } from 'bun:test';

import { isExternalLogoUrl } from './external-logo-url';

describe('isExternalLogoUrl', () => {
  it('recognises scraped absolute logo URLs', () => {
    expect(isExternalLogoUrl('https://brand.example/wp-content/logo.png')).toBe(true);
    expect(isExternalLogoUrl('HTTP://www.google.com/s2/favicons?domain=brand.example')).toBe(true);
  });

  it('leaves storage keys to be signed', () => {
    expect(isExternalLogoUrl('brands/b1/branding/logo.png')).toBe(false);
    expect(isExternalLogoUrl('httpsish/logo.png')).toBe(false);
  });
});
