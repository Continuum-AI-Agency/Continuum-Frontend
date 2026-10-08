import { expect, test } from 'bun:test';
import { strFromU8, unzipSync } from 'fflate';
import { packHyperframesProject } from './exportProject';

test('project ZIP contains pinned local media and rewired composition HTML', () => {
  const files = unzipSync(
    packHyperframesProject({
      html: '<img src="hf-asset://product"><video src="hf-asset://product"></video>',
      assets: [{ assetId: 'product', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }],
      compositionSpec: { title: 'Launch' },
    }),
  );
  expect(strFromU8(files['index.html']!)).toContain('assets/product.png');
  expect(strFromU8(files['index.html']!)).not.toContain('hf-asset://');
  expect([...files['assets/product.png']!]).toEqual([1, 2, 3]);
  expect(strFromU8(files['composition.json']!)).toContain('Launch');
});
