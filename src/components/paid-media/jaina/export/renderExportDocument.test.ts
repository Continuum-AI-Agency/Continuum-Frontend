import { describe, expect, it } from 'bun:test';
import { absolutizeCssUrls } from './renderExportDocument';

// Root-relative url() in the copied app CSS resolves against the export document —
// `about:srcdoc` while printing, `file://` once the HTML is saved. Either way the
// asset is not there, so fonts silently fall back and background images vanish.
describe('absolutizeCssUrls', () => {
  it('rewrites root-relative urls against the app origin', () => {
    expect(absolutizeCssUrls('@font-face{src:url(/_next/f.woff2)}', 'https://app.test')).toBe(
      '@font-face{src:url(https://app.test/_next/f.woff2)}',
    );
  });

  it('keeps the quote style it found', () => {
    expect(absolutizeCssUrls(`a{background:url("/img/x.png")}`, 'https://app.test')).toBe(
      `a{background:url("https://app.test/img/x.png")}`,
    );
    expect(absolutizeCssUrls(`a{background:url('/img/x.png')}`, 'https://app.test')).toBe(
      `a{background:url('https://app.test/img/x.png')}`,
    );
  });

  it('leaves absolute, protocol-relative and data urls alone', () => {
    const css = [
      'a{background:url(https://cdn.test/x.png)}',
      'b{background:url(//cdn.test/y.png)}',
      'c{background:url(data:image/png;base64,AAAA)}',
    ].join('');
    expect(absolutizeCssUrls(css, 'https://app.test')).toBe(css);
  });
});
