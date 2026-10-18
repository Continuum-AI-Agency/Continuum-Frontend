import { z } from 'zod';

const id = z.string().min(1).max(200);
const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
export const presentationSourceSchema = z.object({ assetId: uuid, assetVersionId: uuid, checksum: sha256 }).strict();
export const presentationBoundsSchema = z.object({
  x: z.number().finite(), y: z.number().finite(), width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(), rotation: z.number().finite().default(0),
}).strict();
export const presentationStyleSchema = z.object({
  fill: z.string().max(100).optional(), stroke: z.string().max(100).optional(),
  strokeWidth: z.number().finite().nonnegative().optional(), opacity: z.number().finite().min(0).max(1).optional(),
  fontFamily: z.string().max(200).optional(), fontSize: z.number().finite().positive().optional(),
  color: z.string().max(100).optional(), bold: z.boolean().optional(), italic: z.boolean().optional(),
  underline: z.boolean().optional(), alignment: z.enum(['left', 'center', 'right', 'justify']).optional(),
}).strict();
export const presentationCropSchema = z.object({ left: z.number().min(0).max(1), top: z.number().min(0).max(1), right: z.number().min(0).max(1), bottom: z.number().min(0).max(1) }).strict().refine(crop => crop.left + crop.right < 1 && crop.top + crop.bottom < 1, 'Crop must retain part of the image');
export const presentationImageDataSchema = z.object({
  bytesBase64: z.string().min(1), mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  assetId: uuid.optional(), assetVersionId: uuid.optional(), checksum: sha256.optional(), alt: z.string().max(2000).optional(), crop: presentationCropSchema.optional(),
}).strict();
export const presentationTableDataSchema = z.object({
  cells: z.array(z.array(z.string().max(20_000)).max(100)).max(500),
  columnWidths: z.array(z.number().finite().positive()).optional(),
}).strict();
export const presentationChartDataSchema = z.object({
  chartType: z.enum(['bar', 'column', 'line', 'pie', 'area', 'scatter', 'doughnut']),
  categories: z.array(z.string().max(1000)).max(1000),
  series: z.array(z.object({ name: z.string().max(1000), values: z.array(z.number().finite()).max(1000) }).strict()).max(100),
}).strict();
export const presentationShapeDataSchema = z.object({
  shapeType: z.string().min(1).max(100), path: z.string().optional(),
}).strict();
export type PresentationObject = {
  id: string; kind: 'text' | 'image' | 'shape' | 'table' | 'chart' | 'group'; name: string;
  bounds: z.infer<typeof presentationBoundsSchema>; text?: string; style?: z.infer<typeof presentationStyleSchema>;
  children?: PresentationObject[]; locked?: boolean;
  data?: z.infer<typeof presentationImageDataSchema> | z.infer<typeof presentationTableDataSchema> |
    z.infer<typeof presentationChartDataSchema> | z.infer<typeof presentationShapeDataSchema>;
};
export const presentationObjectSchema: z.ZodType<PresentationObject> = z.lazy(() => z.object({
  id, kind: z.enum(['text', 'image', 'shape', 'table', 'chart', 'group']), name: z.string().default(''),
  bounds: presentationBoundsSchema, text: z.string().max(100_000).optional(), style: presentationStyleSchema.optional(),
  children: z.array(presentationObjectSchema).optional(), locked: z.boolean().optional(),
  data: z.union([presentationImageDataSchema, presentationTableDataSchema, presentationChartDataSchema, presentationShapeDataSchema]).optional(),
}).strict());
export const presentationSlideSchema = z.object({
  id, title: z.string().max(2000), layoutId: id.nullable(), notes: z.string().max(100_000),
  objects: z.array(presentationObjectSchema).max(5000),
}).strict();
export const presentationFieldSchema = z.object({
  id, name: z.string().min(1).max(200), slideId: id, objectId: id,
  kind: z.enum(['text', 'image', 'color', 'table', 'chart']), locked: z.boolean().default(false),
  property: z.string().max(200).optional(), required: z.boolean().default(false),
}).strict();
export const presentationDiagnosticSchema = z.object({
  code: z.string().min(1), message: z.string().min(1), severity: z.enum(['info', 'warning', 'error']),
  slideId: id.nullable().optional(), objectId: id.nullable().optional(),
}).strict();
export const presentationDocumentSchema = z.object({
  schemaVersion: z.literal(1), id, title: z.string().max(2000), revision: z.number().int().nonnegative(),
  engineVersion: z.string().min(1), source: presentationSourceSchema.nullable(), nativeDocument: z.string().min(1),
  size: z.object({ width: z.number().finite().positive(), height: z.number().finite().positive() }).strict(),
  slides: z.array(presentationSlideSchema).max(1000), fields: z.array(presentationFieldSchema).max(10_000),
  diagnostics: z.array(presentationDiagnosticSchema), capabilities: z.record(z.string(), z.boolean()),
  layouts: z.array(z.object({ id, name: z.string(), agentAllowed: z.boolean().default(true) }).strict()).optional(),
}).strict().superRefine((document, context) => {
  if (new Set(document.slides.map(slide => slide.id)).size !== document.slides.length)
    context.addIssue({ code: 'custom', path: ['slides'], message: 'Slide IDs must be unique' });
  for (const [index, slide] of document.slides.entries()) {
    const ids: string[] = [];
    const visit = (objects: PresentationObject[]) => objects.forEach(object => { ids.push(object.id); if (object.children) visit(object.children); });
    visit(slide.objects);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['slides', index, 'objects'], message: 'Object IDs must be unique within a slide' });
  }
  if (new Set(document.fields.map(field => field.id)).size !== document.fields.length)
    context.addIssue({ code: 'custom', path: ['fields'], message: 'Field IDs must be unique' });
});
export type PresentationDocument = z.infer<typeof presentationDocumentSchema>;
const objectTarget = { slideId: id, objectId: id };
export const presentationCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('slide.add'), slide: presentationSlideSchema, index: z.number().int().nonnegative().optional() }).strict(),
  z.object({ type: z.literal('slide.duplicate'), slideId: id, newSlideId: id }).strict(),
  z.object({ type: z.literal('slide.remove'), slideId: id }).strict(),
  z.object({ type: z.literal('slide.reorder'), slideIds: z.array(id).min(1) }).strict(),
  z.object({ type: z.literal('layout.allow'), layoutId: id, allowed: z.boolean() }).strict(),
  z.object({ type: z.literal('slide.layout'), slideId: id, layoutId: id.nullable() }).strict(),
  z.object({ type: z.literal('slide.notes'), slideId: id, notes: z.string().max(100_000) }).strict(),
  z.object({ type: z.literal('object.text'), ...objectTarget, text: z.string().max(100_000) }).strict(),
  z.object({ type: z.literal('object.transform'), ...objectTarget, bounds: presentationBoundsSchema }).strict(),
  z.object({ type: z.literal('object.style'), ...objectTarget, style: presentationStyleSchema }).strict(),
  z.object({ type: z.literal('object.crop'), ...objectTarget, crop: presentationCropSchema }).strict(),
  z.object({ type: z.literal('object.image'), ...objectTarget, data: presentationImageDataSchema }).strict(),
  z.object({ type: z.literal('object.add'), slideId: id, object: presentationObjectSchema }).strict(),
  z.object({ type: z.literal('object.remove'), ...objectTarget }).strict(),
  z.object({ type: z.literal('object.group'), slideId: id, objectIds: z.array(id).min(2), newObjectId: id }).strict(),
  z.object({ type: z.literal('object.ungroup'), ...objectTarget }).strict(),
  z.object({ type: z.literal('object.align'), slideId: id, objectIds: z.array(id).min(2), alignment: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom']) }).strict(),
  z.object({ type: z.literal('object.order'), slideId: id, objectIds: z.array(id).min(1) }).strict(),
  z.object({ type: z.literal('table.data'), ...objectTarget, data: presentationTableDataSchema }).strict(),
  z.object({ type: z.literal('chart.data'), ...objectTarget, data: presentationChartDataSchema }).strict(),
  z.object({ type: z.literal('field.define'), field: presentationFieldSchema }).strict(),
  z.object({ type: z.literal('lock.set'), ...objectTarget, locked: z.boolean() }).strict(),
  z.object({ type: z.literal('font.map'), from: z.string().min(1).max(200), to: z.string().min(1).max(200) }).strict(),
  z.object({ type: z.literal('title'), title: z.string().min(1).max(2000) }).strict(),
]);
export type PresentationCommand = z.infer<typeof presentationCommandSchema>;
export const presentationArtifactSchema = z.object({
  mimeType: z.string().min(1), filename: z.string().min(1), bytesBase64: z.string().min(1),
  width: z.number().positive().optional(), height: z.number().positive().optional(),
}).strict();
export type PresentationArtifact = z.infer<typeof presentationArtifactSchema>;
export const presentationEngineRequestSchema = z.object({
  operation: z.enum(['import', 'create', 'inspect', 'apply', 'render', 'export', 'capabilities']),
  document: presentationDocumentSchema.optional(), bytesBase64: z.string().min(1).optional(), filename: z.string().optional(),
  title: z.string().optional(), id: id.optional(), source: presentationSourceSchema.nullable().optional(),
  expectedRevision: z.number().int().nonnegative().optional(), retryId: z.string().min(1).max(200).optional(),
  commands: z.array(presentationCommandSchema).max(2048).optional(), slideId: id.optional(), scale: z.number().positive().max(4).optional(),
  format: z.enum(['pptx', 'pdf']).optional(),
}).strict();
export type PresentationEngineRequest = z.infer<typeof presentationEngineRequestSchema>;
export const presentationEngineResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), document: presentationDocumentSchema.optional(), artifact: presentationArtifactSchema.optional(),
    diagnostics: z.array(presentationDiagnosticSchema).optional(), capabilities: z.record(z.string(), z.boolean()).optional(), engineVersion: z.string().optional(),
  }).strict(),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string().min(1), message: z.string().min(1), diagnostics: z.array(presentationDiagnosticSchema).optional() }).strict() }).strict(),
]);
export type PresentationEngineResponse = z.infer<typeof presentationEngineResponseSchema>;
export const presentationScopeSchema = z.object({ brandId: uuid, baseVersionId: uuid }).strict();
export const presentationEnvelopeSchema = z.object({ document: presentationDocumentSchema, draftRevision: z.number().int().nonnegative(), history: z.object({ canUndo: z.boolean(), canRedo: z.boolean(), entries: z.array(z.object({ revision: z.number().int(), summary: z.string(), createdAt: z.string() }).strict()) }).strict().optional() }).strict();
export type PresentationEnvelope = z.infer<typeof presentationEnvelopeSchema>;
export const presentationApplyRequestSchema = presentationScopeSchema.extend({
  expectedRevision: z.number().int().nonnegative(), retryId: uuid, commands: z.array(presentationCommandSchema).min(1).max(2048),
}).strict();
export const presentationProposalSchema = z.object({ id: uuid, name: z.string().min(1).max(200), summary: z.string(), commands: z.array(presentationCommandSchema).min(1).max(2048) }).strict();
export type PresentationProposal = z.infer<typeof presentationProposalSchema>;
export const presentationProposeRequestSchema = presentationScopeSchema.extend({ expectedRevision: z.number().int().nonnegative(), prompt: z.string().min(1).max(20_000), count: z.number().int().min(1).max(8).default(3), slideIds: z.array(id).max(1000).optional() }).strict();
export const presentationApplyProposalsRequestSchema = presentationScopeSchema.extend({
  expectedRevision: z.number().int().nonnegative(), retryId: uuid, proposalIds: z.array(uuid).min(1).max(8),
}).strict();
export const presentationPreviewRequestSchema = presentationScopeSchema.extend({ slideId: id, scale: z.number().positive().max(4).optional() }).strict();
export const presentationExportPreviewRequestSchema = presentationScopeSchema.extend({
  expectedRevision: z.number().int().nonnegative(), formats: z.array(z.enum(['pptx', 'pdf'])).min(1).max(2),
}).strict().refine(input => new Set(input.formats).size === input.formats.length, 'Choose each export format once');
export const presentationExportConfirmRequestSchema = presentationScopeSchema.extend({ confirmationToken: z.string().min(1) }).strict();
export const presentationSaveVariantRequestSchema = presentationScopeSchema.extend({ expectedRevision: z.number().int().nonnegative(), name: z.string().trim().min(1).max(120), retryId: uuid, proposalId: uuid.optional() }).strict();
export const presentationHistoryRequestSchema = presentationScopeSchema.extend({ expectedRevision: z.number().int().nonnegative(), retryId: uuid, direction: z.enum(['undo', 'redo']) }).strict();
export const presentationCreateRequestSchema = z.object({ brandId: uuid, title: z.string().trim().min(1).max(2000), retryId: uuid }).strict();
export const PRESENTATION_ROUTE = '/api/ai-studio/presentations';
export const presentationTemplateRoute = (assetId: string) => `/api/ai-studio/templates/${encodeURIComponent(assetId)}/presentation`;
export const presentationProposalsResponseSchema = z.object({ proposals: z.array(presentationProposalSchema), expectedRevision: z.number().int().nonnegative() }).strict();
export const presentationExportPreviewResponseSchema = z.object({
  confirmationToken: uuid, revision: z.number().int().nonnegative(), formats: z.array(z.enum(['pptx', 'pdf'])), expiresAt: z.string(),
}).strict();
export const presentationExportOutputSchema = z.object({ assetId: uuid, versionId: uuid, fileName: z.string(), mimeType: z.string(), url: z.string().url() }).strict();
export const presentationExportConfirmResponseSchema = z.object({ outputs: z.array(presentationExportOutputSchema) }).strict();
export const presentationSaveVariantResponseSchema = z.object({ assetId: uuid, versionId: uuid, name: z.string() }).strict();
