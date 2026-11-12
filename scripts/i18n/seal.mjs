import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export function sealFile(file, destination) {
  if (!destination.startsWith('gs://continuum-production-477821-creative-benchmarks/i18n/'))
    throw new Error('Unapproved evidence destination');
  const copy = spawnSync(
    'gcloud',
    ['storage', 'cp', '--if-generation-match=0', file, destination],
    { encoding: 'utf8' },
  );
  if (copy.status !== 0)
    throw new Error(
      `Evidence upload failed; retain ${file} for recovery within 24 hours. ${copy.stderr}`,
    );
  const metadata = spawnSync(
    'gcloud',
    ['storage', 'objects', 'describe', destination, '--format=json(size,md5_hash,generation)'],
    { encoding: 'utf8' },
  );
  if (metadata.status !== 0)
    throw new Error('Evidence verification failed; all local files retained');
  const receipt = JSON.parse(metadata.stdout),
    data = readFileSync(file);
  if (
    Number(receipt.size) !== data.length ||
    receipt.md5_hash !== createHash('md5').update(data).digest('base64')
  )
    throw new Error('Evidence checksum mismatch; all local files retained');
  const result = {
    uri: destination,
    ...receipt,
    sha256: createHash('sha256').update(data).digest('hex'),
  };
  writeFileSync(`${file}.receipt.json`, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}
