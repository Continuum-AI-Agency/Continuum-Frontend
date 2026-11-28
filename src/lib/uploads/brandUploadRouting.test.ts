import { describe, expect, it } from 'bun:test';
import { zipSync } from 'fflate';
import {
  brandUploadHome,
  mayReadAsText,
  routeBrandUploads,
  withFontArchivesExpanded,
} from './brandUploadRouting';

const file = (name: string, type = '') => new File(['x'], name, { type });

describe('brandUploadHome', () => {
  it('sends fonts to the font store, by type or by extension', () => {
    expect(brandUploadHome(file('Brand-Bold.ttf'))).toBe('fonts');
    expect(brandUploadHome(file('Brand.woff2', 'font/woff2'))).toBe('fonts');
  });

  it('sends logos, SVGs, photos, video and audio to the Library', () => {
    expect(brandUploadHome(file('logo.svg'))).toBe('library');
    expect(brandUploadHome(file('logo', 'image/svg+xml'))).toBe('library');
    expect(brandUploadHome(file('team.png', 'image/png'))).toBe('library');
    expect(brandUploadHome(file('team.JPG'))).toBe('library');
    expect(brandUploadHome(file('reel.mp4', 'video/mp4'))).toBe('library');
  });

  it('sends documents to Knowledge', () => {
    expect(brandUploadHome(file('guidelines.pdf', 'application/pdf'))).toBe('knowledge');
    expect(brandUploadHome(file('brief.DOCX'))).toBe('knowledge');
    expect(brandUploadHome(file('prices.csv', 'text/csv'))).toBe('knowledge');
  });

  it('leaves what nothing claims to the surface fallback', () => {
    expect(brandUploadHome(file('deck.key'))).toBe('library');
    expect(brandUploadHome(file('deck.key'), 'knowledge')).toBe('knowledge');
  });
});

describe('routeBrandUploads', () => {
  it('splits one drop into its three homes, keeping drop order within each', () => {
    const pdf = file('a.pdf', 'application/pdf');
    const font = file('b.otf');
    const png = file('c.png', 'image/png');
    const svg = file('d.svg');
    expect(routeBrandUploads([pdf, font, png, svg])).toEqual({
      knowledge: [pdf],
      library: [png, svg],
      fonts: [font],
    });
  });
});

describe('mayReadAsText', () => {
  it('is true for raster images only', () => {
    expect(mayReadAsText(file('menu.png', 'image/png'))).toBe(true);
    expect(mayReadAsText(file('logo.svg', 'image/svg+xml'))).toBe(false);
    expect(mayReadAsText(file('Brand.ttf'))).toBe(false);
  });
});

describe('withFontArchivesExpanded', () => {
  it('unpacks a foundry zip into its faces and keeps a zip with no fonts whole', async () => {
    const bytes = new Uint8Array(8).fill(1);
    const fonts = new File([zipSync({ 'Family/Family-Bold.ttf': bytes })], 'Family.zip');
    const assets = new File([zipSync({ 'photos/a.png': bytes })], 'photos.zip');
    const expanded = await withFontArchivesExpanded([fonts, assets]);
    expect(expanded.map((entry) => entry.name)).toEqual(['Family-Bold.ttf', 'photos.zip']);
  });
});
