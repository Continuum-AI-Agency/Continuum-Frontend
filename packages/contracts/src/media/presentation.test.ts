import { describe, expect, test } from 'bun:test';
import { presentationCommandSchema, presentationDocumentSchema, presentationApplyRequestSchema, presentationExportPreviewRequestSchema } from './presentation';
const uuid = '22222222-2222-4222-8222-222222222222';
const document = () => ({ schemaVersion: 1, id: 'deck', title: 'Plan', revision: 0, engineVersion: 'deckcraft-test',
  source: { assetId: uuid, assetVersionId: uuid, checksum: 'a'.repeat(64) }, nativeDocument: 'UEs=', size: { width: 720, height: 405 },
  slides: [{ id: 'slide-1', title: 'Opening', layoutId: null, notes: '', objects: [{ id: 'object-1', kind: 'text', name: 'Title', text: 'Plan', bounds: { x: 20, y: 30, width: 200, height: 60, rotation: 0 } }] }], fields: [], diagnostics: [], capabilities: { 'object.text': true } });
describe('presentation trust boundaries', () => {
  test('accepts exact source pins and rejects invented AE source properties', () => {
    expect(presentationDocumentSchema.safeParse(document()).success).toBe(true);
    expect(presentationDocumentSchema.safeParse({ ...document(), compId: 1 }).success).toBe(false);
    expect(presentationDocumentSchema.safeParse({ ...document(), source: { assetId: uuid, assetVersionId: uuid, checksum: 'different' } }).success).toBe(false);
  });
  test('rejects duplicate native slide and nested object identities', () => {
    const deck = document();
    expect(presentationDocumentSchema.safeParse({ ...deck, slides: [deck.slides[0], deck.slides[0]] }).success).toBe(false);
    const object = deck.slides[0].objects[0];
    expect(presentationDocumentSchema.safeParse({ ...deck, slides: [{ ...deck.slides[0], objects: [object, { ...object, kind: 'group', children: [object] }] }] }).success).toBe(false);
  });
  test('rejects nonfinite geometry and fully cropped images', () => {
    expect(presentationCommandSchema.safeParse({ type: 'object.transform', slideId: 'slide-1', objectId: 'object-1', bounds: { x: NaN, y: 0, width: 10, height: 10, rotation: 0 } }).success).toBe(false);
    expect(presentationCommandSchema.safeParse({ type: 'object.crop', slideId: 'slide-1', objectId: 'object-1', crop: { left: 0.6, right: 0.4, top: 0, bottom: 0 } }).success).toBe(false);
    expect(presentationCommandSchema.safeParse({ type: 'object.crop', slideId: 'slide-1', objectId: 'object-1', crop: { left: 0.1, right: 0.2, top: 0, bottom: 0 } }).success).toBe(true);
  });
  test('requires a CAS revision and retry identity for persisted edits', () => {
    const input = { brandId: uuid, baseVersionId: uuid, commands: [{ type: 'object.text', slideId: 'slide-1', objectId: 'object-1', text: 'New plan' }] };
    expect(presentationApplyRequestSchema.safeParse(input).success).toBe(false);
    expect(presentationApplyRequestSchema.safeParse({ ...input, retryId: uuid, expectedRevision: 1 }).success).toBe(true);
  });
  test('accepts typed tables/charts and refuses duplicate export formats', () => {
    expect(presentationCommandSchema.safeParse({ type: 'table.data', slideId: 's', objectId: 'o', data: { cells: [['Quarter', 'Sales'], ['Q1', '12']] } }).success).toBe(true);
    expect(presentationCommandSchema.safeParse({ type: 'chart.data', slideId: 's', objectId: 'o', data: { chartType: 'bar', categories: ['Q1'], series: [{ name: 'Sales', values: ['12'] }] } }).success).toBe(false);
    expect(presentationExportPreviewRequestSchema.safeParse({ brandId: uuid, baseVersionId: uuid, expectedRevision: 1, formats: ['pdf', 'pdf'] }).success).toBe(false);
  });
});
