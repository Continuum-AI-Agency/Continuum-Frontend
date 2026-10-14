import { describe, expect, test } from 'bun:test';
import {
  templateAuthoringArtifactSchema,
  templateAuthoringCommandSchema,
  templateAuthoringDocumentSchema,
  templateAuthoringDraftPutSchema,
  templateAuthoringDraftSchema,
  templateAuthoringCapabilitiesSchema,
  templateAuthoringNodeId,
  templateAuthoringArtboardDraftNodeId,
  templateAuthoringSeedSchema,
  templateAuthoringWorkspacePackageSchema,
} from './template-authoring';

const scope = {
  brandId: '11111111-1111-4111-8111-111111111111',
  assetId: '22222222-2222-4222-8222-222222222222',
  baseVersionId: '33333333-3333-4333-8333-333333333333',
};
const checksum = 'a'.repeat(64);

describe('template authoring contracts', () => {
  test('keeps the original source pin separate from an explicitly identified HyperFrames workspace package', () => {
    const seed = {
      artifactId: '66666666-6666-4666-8666-666666666666',
      packageChecksum: 'b'.repeat(64),
      attachedAtRevision: 4,
      sourceRevisionId: '77777777-7777-4777-8777-777777777777',
      sourceHtmlSha256: 'c'.repeat(64),
      extractedSceneSha256: 'd'.repeat(64),
    };
    expect(templateAuthoringSeedSchema.parse(seed)).toEqual(seed);
    expect(templateAuthoringWorkspacePackageSchema.parse({
      kind: 'hyperframes_seed', artifactId: seed.artifactId, packageChecksum: seed.packageChecksum,
      sourceRevisionId: seed.sourceRevisionId, sourceHtmlSha256: seed.sourceHtmlSha256,
      extractedSceneSha256: seed.extractedSceneSha256,
    }).kind).toBe('hyperframes_seed');
    expect(templateAuthoringWorkspacePackageSchema.safeParse({
      kind: 'hyperframes_seed', artifactId: seed.artifactId, packageChecksum: checksum,
      sourceRevisionId: seed.sourceRevisionId, sourceHtmlSha256: seed.sourceHtmlSha256,
      extractedSceneSha256: seed.extractedSceneSha256,
    }).success).toBe(true);
  });

  test('derives identity from immutable Rust Uid, independently of mutable stack index', () => {
    expect(templateAuthoringNodeId({ compId: 7, layerId: 31 })).toBe('aep:7:31');
  });

  test('accepts only the existing writer command families and rejects unknown operations', () => {
    expect(
      templateAuthoringCommandSchema.safeParse({
        type: 'layer.edit',
        nodeId: 'aep:7:31',
        edit: { compId: 7, layerId: 31, visible: false },
      }).success,
    ).toBe(true);
    expect(
      templateAuthoringCommandSchema.safeParse({ type: 'layer.create', name: 'new' }).success,
    ).toBe(false);
    expect(
      templateAuthoringDraftPutSchema.safeParse({
        brandId: scope.brandId,
        baseVersionId: scope.baseVersionId,
        expectedRevision: 0,
        commands: [{ type: 'composition.order', compId: 7, layerIds: [31, 31] }],
      }).success,
    ).toBe(false);
    expect(
      templateAuthoringDraftPutSchema.safeParse({
        brandId: scope.brandId,
        baseVersionId: scope.baseVersionId,
        userId: '55555555-5555-4555-8555-555555555555',
        expectedRevision: 0,
        commands: [],
      }).success,
    ).toBe(false);
  });

  test('uses UUID identities for authored nodes and separates draft edits from native references', () => {
    const draftNodeId = 'draft:88888888-8888-4888-8888-888888888888';
    const sourceNodeId = 'aep:7:31';
    const fontRef = {
      fontId: '77777777-7777-4777-8777-777777777777',
      postScriptName: 'Inter-Regular',
      sha256: checksum,
    };
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'text.create', nodeId: draftNodeId, compId: 7, name: 'Caption', text: 'Hi',
      fontRef, fontSize: 24, fillColor: [0.1, 0.2, 0.3], position: [0, 0],
    }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'text.create', nodeId: draftNodeId, compId: 7, name: 'Packaged caption', text: 'Hi',
      fontRef: { kind: 'workspace_package', packageChecksum: checksum, postScriptName: 'Seed-Face', sha256: checksum },
      fontSize: 24, fillColor: [0.1, 0.2, 0.3], position: [0, 0],
    }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'layer.duplicate', nodeId: draftNodeId, sourceNodeId, name: 'Copy',
    }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({ type: 'layer.delete', nodeId: draftNodeId }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({ type: 'layer.ungroup', nodeId: draftNodeId }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'layer.edit', nodeId: draftNodeId, edit: { position: [2, 3] },
    }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'layer.edit', nodeId: draftNodeId, edit: { text: 'Changed' },
    }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'layer.edit', nodeId: draftNodeId, edit: { text: '' },
    }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'layer.edit', nodeId: draftNodeId, edit: { text: 'x'.repeat(20_001) },
    }).success).toBe(false);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'layer.edit', nodeId: draftNodeId, edit: { compId: 7, layerId: 99, visible: false },
    }).success).toBe(false);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'composition.order', compId: 7, nodeIds: [sourceNodeId, draftNodeId],
    }).success).toBe(true);
  });

  test('accepts stable-node group commands only with a distinct complete member list', () => {
    const command = {
      type: 'layer.group',
      nodeId: 'draft:88888888-8888-4888-8888-888888888888',
      compId: 7,
      name: 'Card group',
      memberNodeIds: ['aep:7:31', 'aep:7:32'],
    };
    expect(templateAuthoringCommandSchema.parse(command)).toEqual(command);
    expect(templateAuthoringCommandSchema.safeParse({
      ...command,
      memberNodeIds: ['aep:7:31', 'aep:7:31'],
    }).success).toBe(false);
    expect(templateAuthoringCommandSchema.safeParse({
      ...command,
      memberNodeIds: ['aep:7:31'],
    }).success).toBe(false);
  });

  test('allows grouping capability only as an explicit per-node boolean from native preflight', () => {
    const capabilities = {
      transform: true, visibility: true, font: false, text: false, order: true, exposure: false,
      creation: false, duplicate: true, delete: true, grouping: true, masks: false,
      artboardMutation: false, keyframes: false,
    };
    expect(templateAuthoringCapabilitiesSchema.parse(capabilities).grouping).toBe(true);
  });

  test('accepts only explicit rectangle and ellipse shape commands with normalized paint choices', () => {
    const draftNodeId = 'draft:88888888-8888-4888-8888-888888888888';
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'shape.create', nodeId: draftNodeId, compId: 7, shape: 'rectangle', name: 'Card',
      position: [200, 300], size: [400, 180],
      fill: { type: 'solid', color: [0.1, 0.2, 0.3], opacity: 0.8 },
      stroke: { type: 'none' },
    }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'shape.create', nodeId: draftNodeId, compId: 7, shape: 'star', name: 'Unsupported',
      position: [200, 300], size: [400, 180],
      fill: { type: 'none' }, stroke: { type: 'none' },
    }).success).toBe(false);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'shape.create', nodeId: draftNodeId, compId: 7, shape: 'ellipse', name: 'Bad stroke',
      position: [200, 300], size: [400, 180],
      fill: { type: 'none' }, stroke: { type: 'solid', color: [0, 0, 0], opacity: 1, width: 0 },
    }).success).toBe(false);
  });

  test('pins artwork creation to an immutable Library asset version and exact checksum', () => {
    const command = {
      type: 'artwork.create',
      nodeId: 'draft:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      compId: 7,
      name: 'Logo',
      position: [540, 960],
      size: [240, 120],
      assetRef: {
        assetId: '11111111-1111-4111-8111-111111111111',
        versionId: '22222222-2222-4222-8222-222222222222',
        sha256: 'a'.repeat(64),
      },
    };
    expect(templateAuthoringCommandSchema.parse(command)).toEqual(command);
    expect(templateAuthoringCommandSchema.safeParse({
      ...command,
      assetRef: { assetId: command.assetRef.assetId, sha256: command.assetRef.sha256 },
    }).success).toBe(false);
    expect(templateAuthoringCommandSchema.safeParse({ ...command, assetRef: {
      ...command.assetRef, versionId: '33333333-3333-4333-8333-333333333333', sha256: 'bad',
    } }).success).toBe(false);
  });

  test('accepts only existing-comp artboard resize and source-node mask commands with stable draft mask IDs', () => {
    expect(templateAuthoringCommandSchema.safeParse({ type: 'artboard.resize', compId: 7, width: 1200, height: 800 }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({ type: 'artboard.resize', artboardId: '88888888-8888-4888-8888-888888888888', width: 1200, height: 800 }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({ type: 'artboard.resize', compId: 7, artboardId: '88888888-8888-4888-8888-888888888888', width: 1200, height: 800 }).success).toBe(false);
    expect(templateAuthoringCommandSchema.safeParse({ type: 'artboard.resize', compId: 7, width: 1200.5, height: 800 }).success).toBe(false);
    const artboardId = '88888888-8888-4888-8888-888888888888';
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'artboard.create', artboardId, name: 'New', width: 1080, height: 1920, frameRate: 29.97, durationSec: 15,
    }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'artboard.duplicate', artboardId, sourceCompId: 7, name: 'Copy',
    }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'artboard.duplicate', artboardId, sourceArtboardId: '77777777-7777-4777-8777-777777777777', name: 'Copy copy',
    }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({
      type: 'artboard.duplicate', artboardId, sourceCompId: 7,
      sourceArtboardId: '77777777-7777-4777-8777-777777777777', name: 'Ambiguous',
    }).success).toBe(false);
    expect(templateAuthoringArtboardDraftNodeId(artboardId, 'aep:7:31')).toBe(templateAuthoringArtboardDraftNodeId(artboardId, 'aep:7:31'));
    expect(templateAuthoringArtboardDraftNodeId(artboardId, 'aep:7:31')).not.toBe(templateAuthoringArtboardDraftNodeId('77777777-7777-4777-8777-777777777777', 'aep:7:31'));
    const mask = {
      type: 'mask.create', draftMaskId: '88888888-8888-4888-8888-888888888888', nodeId: 'aep:7:31',
      name: 'Mask', shape: 'ellipse', center: [512, 512], size: [400, 300], mode: 'add', opacity: 100, feather: [0, 0],
    };
    expect(templateAuthoringCommandSchema.safeParse(mask).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({ ...mask, center: [-106.63, 132.63] }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({ ...mask, nodeId: 'draft:88888888-8888-4888-8888-888888888888' }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({ ...mask, draftMaskId: 'not-a-uuid' }).success).toBe(false);
    const maskUpdate = { type: 'mask.update', nodeId: mask.nodeId, draftMaskId: mask.draftMaskId, patch: { opacity: 64, center: [-22, 28] } };
    expect(templateAuthoringCommandSchema.safeParse(maskUpdate).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({ type: 'mask.update', nodeId: mask.nodeId, draftMaskId: mask.draftMaskId, patch: {} }).success).toBe(false);
    expect(templateAuthoringCommandSchema.safeParse({ ...maskUpdate, maskId: 7 }).success).toBe(false);
    expect(templateAuthoringCommandSchema.safeParse({ type: 'mask.delete', nodeId: mask.nodeId, draftMaskId: mask.draftMaskId }).success).toBe(true);
    expect(templateAuthoringCommandSchema.safeParse({ type: 'mask.delete', nodeId: mask.nodeId, draftMaskId: mask.draftMaskId, propertyIndex: 2 }).success).toBe(false);
    const artifact = templateAuthoringArtifactSchema.safeParse({
      artifactId: '99999999-9999-4999-8999-999999999999', scope,
      draftRevision: 1, sourceChecksum: checksum, commandDigest: checksum, packageChecksum: checksum,
      filename: 'review.zip', sizeBytes: 1, state: 'prepared',
      verification: { packageIntegrity: 'passed', writerReadback: 'passed', sourcePreservation: 'passed', dependencies: 'pending', format: 'pending', nativeAfterEffects: 'pending', status: 'pending' },
      provenance: { maskMappings: [{ draftMaskId: mask.draftMaskId, nodeId: mask.nodeId, compId: 7, layerUid: 31, maskId: 3, propertyIndex: 2 }] },
      createdAt: '2026-10-11T00:00:00.000Z', reviewedAt: null, commit: null,
    });
    expect(artifact.success).toBe(true);
  });

  test('requires exact source pin and explicit unsupported-operation capabilities', () => {
    const document = {
      scope,
      sourceChecksum: checksum,
      sourceHeadVersionId: scope.baseVersionId,
      readiness: 'ready',
      diagnostics: [],
      exposureKeys: ['headline'],
      fontChoices: [],
      compositions: [
        {
          compId: 7,
          name: 'Main',
          width: 1080,
          height: 1920,
          frameRate: 30,
          durationSec: 15,
          clock: { frameIn: 0, frameOut: 449, cursorFramePosition: 0 },
          parentCompIds: [],
          orderReason: null,
          creationReason: null,
          shapeCreationReason: null,
          nodeIds: ['aep:7:31'],
        },
      ],
      nodes: [
        {
          nodeId: 'aep:7:31',
          sourceRef: { compId: 7, layerId: 31 },
          sourceNodeId: null,
          sourceCompositionId: null,
          parentNodeId: null,
          name: 'Title',
          textContent: 'Hello',
          fontRef: null,
          fillColor: null,
          kind: 'text',
          shape: null,
          size: null,
          pathPosition: null,
          fill: null,
          stroke: null,
          inSec: null,
          outSec: null,
          index: 4,
          visible: true,
          visibilityReason: null,
          textReason: null,
          fontReason: null,
          font: 'Inter',
          fontSize: 48,
          position: [0, 0],
          rotation: 0,
          scale: [100, 100],
          opacity: 100,
          transformLocks: {},
          capabilities: {
            transform: true,
            visibility: true,
            font: true,
            text: true,
            order: true,
            exposure: true,
            creation: false,
            duplicate: true,
            delete: true,
            grouping: false,
            masks: false,
            artboardMutation: false,
            keyframes: false,
          },
          duplicateReason: null,
          deleteReason: null,
          opaqueSourceRef: { versionId: scope.baseVersionId, checksum },
        },
      ],
      opaqueSourceRef: {
        versionId: scope.baseVersionId,
        checksum,
        authority: 'pinned-source-package',
      },
    };
    expect(templateAuthoringDocumentSchema.safeParse(document).success).toBe(true);
    const maskGeometry = {
      status: 'verified' as const, coordinateSpace: 'layer-source-pixels' as const, sourceKind: 'footage' as const,
      sourceRef: { kind: 'footage-item' as const, id: 13, name: 'logo.png' },
      bounds: { x: 0, y: 0, width: 100, height: 100 }, anchor: [0, 0, 0] as [number, number, number],
      position: [0, 0, 0] as [number, number, number], scale: [100, 100, 100] as [number, number, number], rotation: 0,
      localToComp: { matrix: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number], corners: [[0, 0], [100, 0], [100, 100], [0, 100]] as [[number, number], [number, number], [number, number], [number, number]], verifiedWithPyAep: true as const },
      measurement: 'py-aep-native', packageSha256: checksum, sourceAepSha256: 'b'.repeat(64), compId: 7, layerUid: 31,
    };
    const verifiedMaskDocument = {
      ...document,
      nodes: [{ ...document.nodes[0]!, maskReason: null, maskGeometryReason: null, maskSourceGeometry: maskGeometry,
        capabilities: { ...document.nodes[0]!.capabilities, masks: true } }],
    };
    expect(templateAuthoringDocumentSchema.safeParse(verifiedMaskDocument).success).toBe(true);
    expect(templateAuthoringDocumentSchema.safeParse({ ...verifiedMaskDocument, sourceChecksum: 'f'.repeat(64) }).success).toBe(false);
    expect(templateAuthoringDocumentSchema.safeParse({ ...verifiedMaskDocument, nodes: [{ ...verifiedMaskDocument.nodes[0], sourceRef: { compId: 7, layerId: 32 } }] }).success).toBe(false);
    expect(
      templateAuthoringDocumentSchema.safeParse({
        ...document,
        nodes: [
          {
            ...document.nodes[0],
            capabilities: { ...document.nodes[0].capabilities, keyframes: true },
          },
        ],
      }).success,
    ).toBe(false);
  });

  test('keeps old-base draft readable with explicit current-source reconciliation state', () => {
    const draft = templateAuthoringDraftSchema.parse({
      scope,
      sourceChecksum: checksum,
      revision: 3,
      commands: [],
      projectedDocument: null,
      updatedAt: '2026-10-11T00:00:00.000Z',
      requiresReconciliation: true,
      currentSource: {
        templateSourceVersionId: '66666666-6666-4666-8666-666666666666',
        templateSourceChecksum: 'b'.repeat(64),
        assetHeadVersionId: '66666666-6666-4666-8666-666666666666',
        assetHeadChecksum: 'b'.repeat(64),
      },
    });
    expect(draft.scope.baseVersionId).toBe(scope.baseVersionId);
    expect(draft.requiresReconciliation).toBe(true);
    expect(draft.currentSource.assetHeadVersionId).not.toBe(draft.scope.baseVersionId);
  });

  test('exposes only scoped immutable source sidecar references on the artifact DTO', () => {
    const sourceHtmlSha256 = 'b'.repeat(64);
    const extractedSceneSha256 = 'c'.repeat(64);
    const artifact = templateAuthoringArtifactSchema.parse({
      artifactId: '44444444-4444-4444-8444-444444444444',
      scope,
      draftRevision: 1,
      sourceChecksum: checksum,
      commandDigest: 'd'.repeat(64),
      packageChecksum: 'e'.repeat(64),
      filename: 'authored.zip',
      sizeBytes: 12,
      state: 'pending',
      verification: {
        packageIntegrity: 'passed',
        writerReadback: 'passed',
        sourcePreservation: 'pending',
        dependencies: 'pending',
        format: 'pending',
        nativeAfterEffects: 'pending',
        status: 'pending',
      },
      provenance: {
        sourceRevisionId: '55555555-5555-4555-8555-555555555555',
        sourceHtmlSha256,
        extractedSceneSha256,
        targetTemplateAssetId: scope.assetId,
        baseVersionId: scope.baseVersionId,
        nodeMappings: [{
          draftNodeId: 'draft:66666666-6666-4666-8666-666666666666',
          persistedUid: 526,
          compId: 32,
          sourceUid: 525,
        }],
        sourceRetention: {
          status: 'verified',
          sourceHtml: {
            objectPath: 'brand/user/artifact/source.html',
            sha256: sourceHtmlSha256,
            sizeBytes: 4,
          },
          extractedSceneJson: {
            objectPath: 'brand/user/artifact/extracted-scene.json',
            sha256: extractedSceneSha256,
            sizeBytes: 2,
          },
        },
      },
      createdAt: '2026-10-11T00:00:00.000Z',
      reviewedAt: null,
      commit: null,
    });
    expect(artifact.provenance?.sourceRetention?.status).toBe('verified');
    expect(artifact.provenance?.nodeMappings?.[0]?.sourceUid).toBe(525);
    expect(
      templateAuthoringArtifactSchema.safeParse({
        ...artifact,
        provenance: {
          ...artifact.provenance,
          sourceRetention: {
            ...artifact.provenance?.sourceRetention,
            sourceHtml: { ...artifact.provenance?.sourceRetention?.sourceHtml, sha256: 'bad' },
          },
        },
      }).success,
    ).toBe(false);
  });
});
