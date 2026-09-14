import { describe, expect, it } from 'bun:test';

import { partitionForgeProjectFiles } from './ForgeProjectDrop';

function file(name: string): File {
  return new File(['bytes'], name);
}

describe('partitionForgeProjectFiles', () => {
  it('keeps only supported After Effects project packages', () => {
    const result = partitionForgeProjectFiles([
      file('intro.aep'),
      file('master.AEPX'),
      file('starter.aet'),
      file('collected.zip'),
      file('preview.mov'),
    ]);

    expect(result.accepted.map((item) => item.name)).toEqual([
      'intro.aep',
      'master.AEPX',
      'starter.aet',
      'collected.zip',
    ]);
    expect(result.rejected.map((item) => item.name)).toEqual(['preview.mov']);
  });
});
