import type { TemplateAuthoringArtifact } from '@continuum/contracts';

const responsePins = (artifact: TemplateAuthoringArtifact) => ({
  'x-content-sha256': artifact.packageChecksum,
  'x-template-authoring-artifact-id': artifact.artifactId,
  'x-template-authoring-brand-id': artifact.scope.brandId,
  'x-template-authoring-asset-id': artifact.scope.assetId,
  'x-template-authoring-base-version-id': artifact.scope.baseVersionId,
  'x-template-authoring-draft-revision': String(artifact.draftRevision),
  'x-template-authoring-source-sha256': artifact.sourceChecksum,
  'x-template-authoring-command-sha256': artifact.commandDigest,
  'x-template-authoring-package-sha256': artifact.packageChecksum,
  'x-template-authoring-state': artifact.state,
});

/** Verifies the private package response against its metadata before the caller can save it. */
export async function verifyTemplateAuthoringPackageResponse(
  response: Response,
  artifact: TemplateAuthoringArtifact,
): Promise<Blob> {
  if (!response.ok) throw new Error(`Private package download failed (${response.status}).`);
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/zip') throw new Error('Private package response is not a ZIP archive.');
  for (const [header, expected] of Object.entries(responsePins(artifact))) {
    const actual = response.headers.get(header);
    if (!actual || actual.toLowerCase() !== expected.toLowerCase())
      throw new Error('Private package response did not match the selected artifact pins.');
  }
  const blob = await response.blob();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== artifact.packageChecksum.toLowerCase())
    throw new Error('Private package bytes failed checksum verification.');
  return blob;
}
