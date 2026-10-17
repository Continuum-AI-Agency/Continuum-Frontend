import { describe, expect, test } from 'bun:test';
import { verifyTemplateAuthoringFontResponse } from './templateAuthoringFont';

const digestHex = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');

describe('verifyTemplateAuthoringFontResponse', () => {
  test('accepts bytes only when private response header and browser digest match the offered checksum', async () => {
    const bytes = new TextEncoder().encode('font-fixture');
    const sha = await digestHex(bytes);
    const response = new Response(bytes, {
      headers: { 'Content-Type': 'font/otf', 'X-Content-SHA256': sha, 'Cache-Control': 'private, no-store' },
    });
    await expect(verifyTemplateAuthoringFontResponse(response, sha)).resolves.toMatchObject({
      contentType: 'font/otf', sha256: sha,
    });
  });

  test('rejects a mismatched digest, missing digest header, wrong media type, and failed response', async () => {
    const bytes = new TextEncoder().encode('font-fixture');
    const sha = await digestHex(bytes);
    const validHeaders = { 'Content-Type': 'font/ttf', 'X-Content-SHA256': sha };
    await expect(verifyTemplateAuthoringFontResponse(new Response(bytes, { headers: validHeaders }), 'b'.repeat(64))).rejects.toThrow('checksum');
    await expect(verifyTemplateAuthoringFontResponse(new Response(new TextEncoder().encode('different'), { headers: validHeaders }), sha)).rejects.toThrow('downloaded font');
    await expect(verifyTemplateAuthoringFontResponse(new Response(bytes, { headers: { 'Content-Type': 'font/ttf' } }), sha)).rejects.toThrow('checksum');
    await expect(verifyTemplateAuthoringFontResponse(new Response(bytes, { headers: { ...validHeaders, 'Content-Type': 'application/octet-stream' } }), sha)).rejects.toThrow('unsupported format');
    await expect(verifyTemplateAuthoringFontResponse(new Response(null, { status: 503 }), sha)).rejects.toThrow('503');
  });

  test('requires exact package font and attached-seed identity headers before accepting bytes', async () => {
    const bytes = new TextEncoder().encode('font-fixture');
    const sha = await digestHex(bytes);
    const pins = {
      postScriptName: 'DejaVu Sans/Regular',
      seedArtifactId: '10000000-0000-4000-8000-000000000201',
      seedPackageChecksum: 'f'.repeat(64),
      expectedRevision: 7,
    };
    const headers = {
      'Content-Type': 'font/ttf',
      'X-Content-SHA256': sha,
      'X-Font-PostScript-Name': encodeURIComponent(pins.postScriptName),
      'X-Authoring-Seed-Artifact-Id': pins.seedArtifactId,
      'X-Authoring-Seed-Package-Checksum': pins.seedPackageChecksum,
      'X-Authoring-Draft-Revision': String(pins.expectedRevision),
    };
    await expect(verifyTemplateAuthoringFontResponse(new Response(bytes, { headers }), sha, pins)).resolves.toMatchObject({ sha256: sha });
    await expect(verifyTemplateAuthoringFontResponse(
      new Response(bytes, { headers: { ...headers, 'X-Authoring-Draft-Revision': '8' } }),
      sha,
      pins,
    )).rejects.toThrow('private seed pins');
  });
});
