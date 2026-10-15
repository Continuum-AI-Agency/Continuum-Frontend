import { templateAuthoringArtifactSchema } from '@continuum/contracts';
import { describe, expect, it } from 'bun:test';
import { verifyTemplateAuthoringPackageResponse } from './templateAuthoringPackage';

const digest = async (bytes: Uint8Array) => {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

describe('verifyTemplateAuthoringPackageResponse', () => {
  const bytes = new TextEncoder().encode('private package fixture');
  const artifactId = '00000000-0000-4000-8000-000000000093';
  const scope = {
    brandId: '00000000-0000-4000-8000-000000000014',
    assetId: '00000000-0000-4000-8000-000000000091',
    baseVersionId: '00000000-0000-4000-8000-000000000102',
  };

  async function artifact() {
    return templateAuthoringArtifactSchema.parse({
      artifactId, scope, draftRevision: 2,
      sourceChecksum: 'a'.repeat(64), commandDigest: 'b'.repeat(64),
      packageChecksum: await digest(bytes), filename: 'authoring.zip', sizeBytes: bytes.length,
      state: 'pending', verification: {
        packageIntegrity: 'pending', writerReadback: 'pending', sourcePreservation: 'pending',
        dependencies: 'pending', format: 'pending', nativeAfterEffects: 'pending', status: 'pending',
      }, createdAt: '2026-10-12T00:00:00.000Z', reviewedAt: null, commit: null,
    });
  }

  async function response(target: Awaited<ReturnType<typeof artifact>>, payload = bytes) {
    const headers = new Headers({
      'content-type': 'application/zip',
      'x-content-sha256': target.packageChecksum,
      'x-template-authoring-artifact-id': target.artifactId,
      'x-template-authoring-brand-id': target.scope.brandId,
      'x-template-authoring-asset-id': target.scope.assetId,
      'x-template-authoring-base-version-id': target.scope.baseVersionId,
      'x-template-authoring-draft-revision': String(target.draftRevision),
      'x-template-authoring-source-sha256': target.sourceChecksum,
      'x-template-authoring-command-sha256': target.commandDigest,
      'x-template-authoring-package-sha256': target.packageChecksum,
      'x-template-authoring-state': target.state,
    });
    return new Response(payload, { headers });
  }

  it('returns bytes only when response pins and content hash match the exact artifact', async () => {
    const expected = await artifact();
    const blob = await verifyTemplateAuthoringPackageResponse(await response(expected), expected);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it('rejects a different artifact pin even when the ZIP bytes hash correctly', async () => {
    const expected = await artifact();
    const mismatched = await response(expected);
    mismatched.headers.set('x-template-authoring-base-version-id', '00000000-0000-4000-8000-000000000103');
    await expect(verifyTemplateAuthoringPackageResponse(mismatched, expected)).rejects.toThrow('artifact pins');
  });

  it('rejects package bytes that do not match the pinned package checksum', async () => {
    const expected = await artifact();
    await expect(verifyTemplateAuthoringPackageResponse(await response(expected, new TextEncoder().encode('tampered')), expected)).rejects.toThrow('checksum verification');
  });
});
