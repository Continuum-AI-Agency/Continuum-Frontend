export async function verifyTemplateAuthoringFontResponse(
  response: Response,
  expectedSha256: string,
  packagePins?: { postScriptName: string; seedArtifactId: string; seedPackageChecksum: string; expectedRevision: number },
): Promise<{ bytes: ArrayBuffer; contentType: string; sha256: string }> {
  if (!response.ok) throw new Error(`Font preview failed (${response.status})`);
  if (packagePins) {
    const exactHeaders =
      response.headers.get('X-Font-PostScript-Name') === encodeURIComponent(packagePins.postScriptName) &&
      response.headers.get('X-Authoring-Seed-Artifact-Id') === packagePins.seedArtifactId &&
      response.headers.get('X-Authoring-Seed-Package-Checksum')?.toLowerCase() === packagePins.seedPackageChecksum.toLowerCase() &&
      response.headers.get('X-Authoring-Draft-Revision') === String(packagePins.expectedRevision);
    if (!exactHeaders) throw new Error('The package font response did not match its private seed pins.');
  }
  const expected = expectedSha256.toLowerCase();
  const declared = response.headers.get('X-Content-SHA256')?.toLowerCase();
  if (!declared || declared !== expected) throw new Error('The pinned font checksum did not match.');
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw new Error('The downloaded font did not match its pinned checksum.');
  const contentType = response.headers.get('Content-Type')?.split(';')[0] ?? '';
  if (contentType !== 'font/ttf' && contentType !== 'font/otf')
    throw new Error('The authorized font response had an unsupported format.');
  return { bytes, contentType, sha256: actual };
}
