import { expect, test } from 'bun:test';
import { detectIntakeKind } from './detectIntakeKind';

test.each([
  ['', null],
  ['   ', null],
  ['acme.com', { kind: 'website', url: 'https://acme.com/' }],
  ['https://www.acme.co.uk/about', { kind: 'website', url: 'https://www.acme.co.uk/about' }],
  ['  shop.acme.io  ', { kind: 'website', url: 'https://shop.acme.io/' }],
  ['@Acme', { kind: 'instagram', url: 'https://www.instagram.com/acme/' }],
  ['instagram.com/acme', { kind: 'instagram', url: 'https://www.instagram.com/acme/' }],
  ['https://www.facebook.com/AcmeCo', { kind: 'facebook', url: 'https://www.facebook.com/AcmeCo' }],
  ['instagram.com/p/Cx1', { kind: 'unsupported_social' }],
  ['facebook.com/groups/acme', { kind: 'unsupported_social' }],
  ['acme', { kind: 'description' }],
  ['bob@acme.com', { kind: 'description' }],
  ['Solar panels for homeowners in Austin.', { kind: 'description' }],
  ['We sell acme.com gear\nto climbers', { kind: 'description' }],
] as const)('%p → %p', (input, expected) => {
  expect(detectIntakeKind(input)).toEqual(expected as never);
});
