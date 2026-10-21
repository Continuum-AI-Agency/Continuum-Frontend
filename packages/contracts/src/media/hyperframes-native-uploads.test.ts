import { expect, test } from 'bun:test';
import {
  nativeTemplateUploadCursorSchema,
  nativeTemplateUploadHistorySchema,
  nativeTemplateUploadStatusSchema,
} from './hyperframes-native-uploads';

const id = () => crypto.randomUUID();
function status() {
  const templateId = id();
  return {
    family: 'hyperframes',
    brandId: id(),
    templateId,
    jobId: id(),
    uploadedAssetId: id(),
    uploadedVersionId: id(),
    createdAt: '2026-10-20T00:00:00Z',
    intent: {
      schemaVersion: 'hyperframes.upload-variant/1',
      templateId,
      variantId: id(),
      parentRevisionId: id(),
      sourceAssetId: id(),
      sourceVersionId: id(),
      sourceSha256: 'a'.repeat(64),
      sceneSha256: 'b'.repeat(64),
      name: 'Uploaded branch',
    },
    ingest: {
      state: 'pending',
      error: null,
      parseDurationMs: null,
      compileDurationMs: null,
      sceneSha256: null,
    },
    parseState: 'pending',
    revisionId: null,
  };
}
test('upload status cannot report success before a parsed, compiled immutable child exists', () => {
  const input = status();
  expect(nativeTemplateUploadStatusSchema.parse(input)).toEqual(input);
  const complete = {
    ...input,
    parseState: 'parsed',
    revisionId: id(),
    ingest: { ...input.ingest, state: 'compiled', sceneSha256: 'c'.repeat(64) },
  };
  expect(nativeTemplateUploadStatusSchema.parse(complete)).toEqual(complete);
  for (const value of [
    { ...complete, revisionId: null },
    { ...complete, parseState: 'pending' },
    { ...input, revisionId: id() },
    { ...input, templateId: id() },
    { ...input, execution_spec: { private: true } },
  ])
    expect(nativeTemplateUploadStatusSchema.safeParse(value).success).toBe(false);
});
test('upload discovery bounds pages, tenant identity and cursor syntax', () => {
  const item = status();
  const page = {
    family: 'hyperframes',
    brandId: item.brandId,
    templateId: item.templateId,
    enabled: false,
    items: [item],
    nextCursor: null,
  };
  expect(nativeTemplateUploadHistorySchema.parse(page)).toEqual(page);
  for (const changed of [
    { ...page, brandId: id() },
    { ...page, templateId: id() },
    { ...page, items: Array(51).fill(item) },
  ])
    expect(nativeTemplateUploadHistorySchema.safeParse(changed).success).toBe(false);
  expect(
    nativeTemplateUploadCursorSchema.parse({ createdAt: item.createdAt, jobId: item.jobId }),
  ).toEqual({ createdAt: item.createdAt, jobId: item.jobId });
  for (const cursor of [
    { createdAt: '2026-10-20T00:00:00Z),job_id.gt.secret', jobId: item.jobId },
    { createdAt: item.createdAt, jobId: 'not-a-uuid' },
    { createdAt: item.createdAt, jobId: item.jobId, offset: 10000 },
  ])
    expect(nativeTemplateUploadCursorSchema.safeParse(cursor).success).toBe(false);
});
