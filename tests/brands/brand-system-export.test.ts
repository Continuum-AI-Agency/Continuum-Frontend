import { describe, expect, it } from 'bun:test';
import { type BrandSystemExportFile, brandSystemSnapshotV1Schema } from '@continuum/contracts';
import { strFromU8, unzipSync } from 'fflate';

import {
  createBrandSystemZip,
  loadBrandSystemLogo,
  renderBrandBookPdf,
} from '@/lib/brands/brand-system-export';

describe('createBrandSystemZip', () => {
  it('archives the exact compiler file paths and bytes', () => {
    const files: BrandSystemExportFile[] = [
      {
        path: 'manifest.json',
        mediaType: 'application/json',
        role: 'knowledge',
        size: 12,
        sha256: '0'.repeat(64),
        bytes: new TextEncoder().encode('{"ok":true}\n'),
      },
      {
        path: 'assets/logo.png',
        mediaType: 'image/png',
        role: 'asset',
        size: 4,
        sha256: '1'.repeat(64),
        bytes: new Uint8Array([137, 80, 78, 71]),
      },
    ];

    const archive = unzipSync(createBrandSystemZip(files));

    expect(Object.keys(archive).sort()).toEqual(['assets/logo.png', 'manifest.json']);
    expect(strFromU8(archive['manifest.json'] ?? new Uint8Array())).toBe('{"ok":true}\n');
    expect(Array.from(archive['assets/logo.png'] ?? [])).toEqual([137, 80, 78, 71]);
  });
});

describe('renderBrandBookPdf', () => {
  it('renders a real PDF from the normalized snapshot', async () => {
    const snapshot = brandSystemSnapshotV1Schema.parse({
      schemaVersion: 1,
      brand: { name: 'Example Brand' },
      identity: {
        colors: [{ value: '#336699', role: 'primary', name: 'Ocean' }],
        typography: [{ family: 'Inter', role: 'body' }],
        logo: null,
        voice: { tone: 'Clear and assured', power_verbs: [], banned_words: [] },
        personality: null,
        imagery: null,
        audience: null,
      },
      strategy: {
        positioning: 'The reliable operating system for modern teams.',
        pillars: ['Clarity', 'Momentum'],
        tonalSignal: 'Calm confidence',
        audienceSummary: 'Operations leaders',
        audienceSegments: [],
        contentGuidelines: null,
        guidelineSets: [],
      },
      assessment: { readiness: null },
      sources: {
        documents: [
          {
            name: 'Research.pdf',
            category: 'brand_guidelines',
            status: 'ready',
            createdAt: '2026-07-30T12:00:00.000Z',
          },
        ],
      },
    });

    const pdf = await renderBrandBookPdf(snapshot, null);

    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(1_000);
  });
});

describe('loadBrandSystemLogo', () => {
  it('loads original image bytes through a short-lived signed URL', async () => {
    const signedPaths: string[] = [];
    const asset = await loadBrandSystemLogo('brand/branding/logo.svg', {
      signLogo: async (path) => {
        signedPaths.push(path);
        return 'https://storage.example/logo';
      },
      fetchAsset: async () =>
        new Response('<svg xmlns="http://www.w3.org/2000/svg" />', {
          headers: { 'content-type': 'image/svg+xml' },
        }),
    });

    expect(signedPaths).toEqual(['brand/branding/logo.svg']);
    expect(asset?.mediaType).toBe('image/svg+xml');
    expect(asset?.extension).toBe('svg');
    expect(new TextDecoder().decode(asset?.bytes)).toContain('<svg');
  });
});
