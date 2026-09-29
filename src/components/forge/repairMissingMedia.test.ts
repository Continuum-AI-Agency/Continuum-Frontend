import { expect, test } from 'bun:test';
import { unzipSync, zipSync } from 'fflate';
import { repairMissingMediaZip } from './repairMissingMedia';

test('repairs the selected AEP media path in a Windows ZIP without dropping other entries', () => {
  const original = zipSync({
    'A\\one.aep': new Uint8Array([1]),
    'B\\two.aep': new Uint8Array([2]),
    'B\\(Footage)\\other.png': new Uint8Array([3]),
  });
  const repaired = unzipSync(
    repairMissingMediaZip(
      original,
      'C:\\Users\\designer\\B\\(Footage)\\PTW_logo_purple.png',
      new Uint8Array([4, 5]),
      'two.aep',
    ),
  );
  expect(repaired['B/(Footage)/PTW_logo_purple.png']).toEqual(new Uint8Array([4, 5]));
  expect(repaired['B/(Footage)/other.png']).toEqual(new Uint8Array([3]));
  expect(repaired['A/one.aep']).toEqual(new Uint8Array([1]));
});

test('finds a uniquely named file already in the ZIP', () => {
  const original = zipSync({
    'card.aep': new Uint8Array([1]),
    'loose/PTW_logo_purple.png': new Uint8Array([9]),
  });
  const repaired = unzipSync(
    repairMissingMediaZip(original, 'C:\\work\\(Footage)\\PTW_logo_purple.png'),
  );
  expect(repaired['(Footage)/PTW_logo_purple.png']).toEqual(new Uint8Array([9]));
});
