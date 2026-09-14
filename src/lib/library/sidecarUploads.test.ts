import { describe, expect, it } from 'bun:test';

import { partitionSidecarUploads } from './sidecarUploads';

const file = (name: string, type = 'application/octet-stream') =>
  new File([new Uint8Array([1])], name, { type });

describe('partitionSidecarUploads', () => {
  it('pairs an After Effects project with a same-stem movie', () => {
    const aep = file('Vivo47_v11.aep');
    const mp4 = file('Vivo47_v11.mp4', 'video/mp4');
    const png = file('hero.png', 'image/png');
    const { pairs, rest } = partitionSidecarUploads([aep, mp4, png]);
    expect(pairs).toEqual([{ source: aep, companion: mp4 }]);
    expect(rest).toEqual([png]);
  });

  it('leaves an unmatched project in the rest list', () => {
    const aep = file('solo.aep');
    expect(partitionSidecarUploads([aep])).toEqual({ pairs: [], rest: [aep] });
  });

  it('pairs an MXF with a same-stem H.264 movie', () => {
    const mxf = file('A001C001.mxf', 'application/mxf');
    const mp4 = file('A001C001.mp4', 'video/mp4');
    expect(partitionSidecarUploads([mxf, mp4])).toEqual({
      pairs: [{ source: mxf, companion: mp4 }],
      rest: [],
    });
  });
});
