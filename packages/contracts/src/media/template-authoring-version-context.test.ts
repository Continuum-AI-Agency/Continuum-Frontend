import { expect, it } from 'bun:test';
import {
  templateAuthoringArtifactProvenanceSchema,
  templateAuthoringDocumentSchema,
  templateAuthoringSourceContextSchema,
} from './template-authoring';

const scope = {
  brandId: '11111111-1111-4111-8111-111111111111',
  assetId: '22222222-2222-4222-8222-222222222222',
  baseVersionId: '33333333-3333-4333-8333-333333333333',
};
const groupId = 'draft:44444444-4444-4444-8444-444444444444';
const members = [
  { nodeId: 'aep:7:31', persistedUid: 31, parentUid: 70 },
  { nodeId: 'aep:7:32', persistedUid: 32, parentUid: 70 },
];
const entry = { nodeId: groupId, compId: 7, persistedUid: 70, sourceUid: 80, members };
const context = {
  artifactId: '55555555-5555-4555-8555-555555555555',
  versionId: scope.baseVersionId,
  packageChecksum: 'a'.repeat(64),
  identityMap: [entry],
  freshArtboardReceipts: [],
};
const document = {
  scope, sourceChecksum: context.packageChecksum, sourceHeadVersionId: scope.baseVersionId,
  readiness: 'pending', diagnostics: [], exposureKeys: [], fontChoices: [], compositions: [], nodes: [],
  sourceAuthoringContext: context,
  opaqueSourceRef: { versionId: scope.baseVersionId, checksum: context.packageChecksum, authority: 'pinned-source-package' },
};
const provenance = {
  nodeMappings: [{ draftNodeId: groupId, compId: entry.compId, persistedUid: entry.persistedUid,
    sourceUid: entry.sourceUid, sourceNodeId: null, groupMembers: members }],
};

it('retains exact group member identities through artifact JSON serialization', () => {
  const saved = JSON.parse(JSON.stringify(templateAuthoringArtifactProvenanceSchema.parse(provenance)));
  expect(saved.nodeMappings[0].groupMembers).toEqual(members);
  expect(templateAuthoringSourceContextSchema.parse(context).identityMap[0]).toEqual(entry);
});

it('rejects missing group source identity, duplicate membership, wrong parents and self-parenting', () => {
  const mapping = provenance.nodeMappings[0];
  const invalid = [
    { ...mapping, sourceUid: undefined },
    { ...mapping, groupMembers: [members[0], members[0]] },
    { ...mapping, groupMembers: [members[0], { ...members[1], parentUid: 71 }] },
    { ...mapping, groupMembers: [members[0], { ...members[1], persistedUid: 70 }] },
  ];
  for (const candidate of invalid)
    expect(templateAuthoringArtifactProvenanceSchema.safeParse({ nodeMappings: [candidate] }).success).toBe(false);
});

it('binds source authoring context to the actual immutable document version and package', () => {
  expect(templateAuthoringDocumentSchema.parse(document).sourceAuthoringContext).toEqual(context);
  for (const changed of [
    { ...context, versionId: '66666666-6666-4666-8666-666666666666' },
    { ...context, packageChecksum: 'b'.repeat(64) },
  ]) expect(templateAuthoringDocumentSchema.safeParse({ ...document, sourceAuthoringContext: changed }).success).toBe(false);
  expect(templateAuthoringDocumentSchema.safeParse({ ...document,
    sourceHeadVersionId: '66666666-6666-4666-8666-666666666666' }).success).toBe(false);
  expect(templateAuthoringDocumentSchema.safeParse({ ...document,
    workspacePackage: { kind: 'pinned_source', packageChecksum: 'b'.repeat(64) } }).success).toBe(false);
});

it('rejects duplicate source node/native identities and duplicate artboard receipts', () => {
  expect(templateAuthoringSourceContextSchema.safeParse({ ...context, identityMap: [entry, entry] }).success).toBe(false);
  expect(templateAuthoringSourceContextSchema.safeParse({ ...context, identityMap: [entry,
    { ...entry, nodeId: 'draft:77777777-7777-4777-8777-777777777777' }] }).success).toBe(false);
  const receipt = { compId: 7, sourceCompId: null, name: 'Created board', width: 640, height: 360,
    frameRate: 30, durationSec: 4, layerUidMap: [] };
  expect(templateAuthoringSourceContextSchema.safeParse({ ...context, freshArtboardReceipts: [receipt, receipt] }).success).toBe(false);
});

it('keeps older artifacts and documents compatible while withholding absent generated identity', () => {
  const { groupMembers: _members, ...oldMapping } = provenance.nodeMappings[0];
  expect(templateAuthoringArtifactProvenanceSchema.parse({ nodeMappings: [oldMapping] }).nodeMappings?.[0].groupMembers).toBeUndefined();
  const { sourceAuthoringContext: _context, ...oldDocument } = document;
  expect(templateAuthoringDocumentSchema.parse(oldDocument).sourceAuthoringContext).toBeUndefined();
});
