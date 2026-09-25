import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { type TemplateSourceSummary, templateSourceSummarySchema } from '@continuum/contracts';

import {
  fileSha256,
  matchDroppedFile,
  partitionForgeProjectFiles,
  uploadRefusal,
} from './ForgeProjectDrop';

function file(name: string): File {
  return new File(['bytes'], name);
}

function source(
  overrides: Partial<TemplateSourceSummary> & { filename?: string },
): TemplateSourceSummary {
  const { filename = 'promo.aep', ...rest } = overrides;
  return templateSourceSummarySchema.parse({
    assetId: crypto.randomUUID(),
    brandId: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    family: 'after_effects',
    parseState: 'parsed',
    parse: {
      parser: 'py_aep',
      sourceFamily: 'after_effects',
      filename,
      comps: [],
      ratios: [],
      slots: [],
    },
    createdAt: '2026-09-01T00:00:00Z',
    ...rest,
  });
}

describe('partitionForgeProjectFiles', () => {
  it('keeps project packages and loose fonts apart, and refuses the rest', () => {
    const result = partitionForgeProjectFiles([
      file('intro.aep'),
      file('master.AEPX'),
      file('starter.aet'),
      file('collected.zip'),
      file('2f0cf1733d838e005b2ef333cfea82b6.ttf'),
      file('Brand-Bold.OTF'),
      file('preview.mov'),
    ]);

    expect(result.accepted.map((item) => item.name)).toEqual([
      'intro.aep',
      'master.AEPX',
      'starter.aet',
      'collected.zip',
    ]);
    expect(result.fonts.map((item) => item.name)).toEqual([
      '2f0cf1733d838e005b2ef333cfea82b6.ttf',
      'Brand-Bold.OTF',
    ]);
    expect(result.rejected.map((item) => item.name)).toEqual(['preview.mov']);
  });
});

describe('fileSha256', () => {
  it('is the hex sha256 of the bytes, the digest the upload records', async () => {
    expect(await fileSha256(new File(['zerg rush'], 'a.aep'))).toBe(
      createHash('sha256').update('zerg rush').digest('hex'),
    );
  });

  it('does not buffer a file bigger than the upload ever hashes', async () => {
    const big = new File(['x'], 'big.aep');
    Object.defineProperty(big, 'size', { value: 65 * 1024 * 1024 });
    Object.defineProperty(big, 'arrayBuffer', {
      value: () => Promise.reject(new Error('must not be read')),
    });
    expect(await fileSha256(big)).toBeNull();
  });
});

describe('matchDroppedFile', () => {
  const sha = 'a'.repeat(64);
  const promo = source({ displayName: 'Promo', sourceChecksum: sha, filename: 'promo.aep' });
  const teaser = source({ displayName: 'Teaser', filename: 'teaser.aep' });

  it('the same bytes open the template that holds them, whatever the file is called', () => {
    const match = matchDroppedFile('renamed copy.aep', sha.toUpperCase(), [teaser, promo]);
    expect(match.kind).toBe('same');
    expect(match.kind === 'same' ? match.source.displayName : null).toBe('Promo');
  });

  it('a known file name with different bytes asks about a revision', () => {
    const match = matchDroppedFile('teaser.aep', 'b'.repeat(64), [promo, teaser]);
    expect(match.kind).toBe('named');
    expect(match.kind === 'named' ? match.source.displayName : null).toBe('Teaser');
  });

  it('a source with no recorded checksum never matches on bytes, and an unknown file is new', () => {
    const unrecorded = source({ filename: 'other.aep' });
    expect(matchDroppedFile('new.aep', null, [promo, unrecorded])).toEqual({ kind: 'new' });
    expect(matchDroppedFile('new.aep', 'c'.repeat(64), [unrecorded])).toEqual({ kind: 'new' });
  });
});

describe('uploadRefusal', () => {
  const inyogo = { name: 'inyogo.zip', sizeBytes: 260 * 1024 * 1024 };

  it('names the file, its size and the limit for either form of the refusal', () => {
    const sentence =
      'inyogo.zip is 260 MB, over the 250 MB upload limit, so it was not uploaded. Ask an admin to raise the limit.';
    expect(uploadRefusal(inyogo, 'resumable upload creation failed (413)')).toBe(sentence);
    expect(
      uploadRefusal(
        inyogo,
        'Upload to storage failed: The object exceeded the maximum allowed size',
      ),
    ).toBe(sentence);
  });

  it('leaves every other failure as it was', () => {
    expect(uploadRefusal(inyogo, 'resumable upload creation failed (500)')).toBeNull();
    expect(uploadRefusal(inyogo, undefined)).toBeNull();
  });
});
