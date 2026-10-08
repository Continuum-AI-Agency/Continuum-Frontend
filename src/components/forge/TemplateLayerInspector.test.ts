import { expect, test } from 'bun:test';
import type { FontInventoryRow } from '@continuum/contracts';
import { boldFaceFor } from './TemplateLayerInspector';

const font = (
  postScriptName: string,
  weight: number,
  style: 'normal' | 'italic' = 'normal',
  familyKey = 'arial',
): FontInventoryRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  family: familyKey,
  familyKey,
  postScriptName,
  weight,
  style,
  licenceScope: 'brand',
  brandId: '00000000-0000-4000-8000-000000000002',
  brandName: 'Bench',
  winRegistryName: null,
  format: 'ttf',
  bytes: 1,
  sha256: 'font-hash',
  source: 'upload',
  createdAt: '2026-10-02T00:00:00Z',
});
test('bold toggle preserves font family and italic style and requires a held face', () => {
  const regular = font('ArialMT', 400),
    bold = font('Arial-BoldMT', 700);
  const italic = font('Arial-ItalicMT', 400, 'italic'),
    boldItalic = font('Arial-BoldItalicMT', 700, 'italic');
  const other = font('Other-Bold', 700, 'normal', 'other');
  const fonts = [other, regular, bold, italic, boldItalic];
  expect(boldFaceFor(regular.postScriptName, fonts)).toEqual({ bold: false, target: bold });
  expect(boldFaceFor(bold.postScriptName, fonts)).toEqual({ bold: true, target: regular });
  expect(boldFaceFor(italic.postScriptName, fonts)).toEqual({ bold: false, target: boldItalic });
  expect(boldFaceFor(regular.postScriptName, [regular, other]).target).toBeUndefined();
});
