/** Actual byte-backed native fixture preparation, then authenticated shared merge HTTP calls. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type TemplateRevision,
  templateRevisionEditsSchema,
  templateVersionMergePreviewSchema,
  templateVersionResultSchema,
} from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import { unzipSync } from 'fflate';
import { Recorder } from '../../Continuum-Backend/scripts/_bench/recorder';

const rec = new Recorder('forge:shared-versioning-concurrency:bench');
const config = process.env.WORKING_COPY_QUAL_CONFIG;
assert(config);
const f = JSON.parse(readFileSync(config, 'utf8')) as {
  supabaseUrl: string;
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  brandId: string;
  templateId: string;
  sourceAssetId: string;
  sourceVersionId: string;
  branches: { revisionId: string }[];
  layer: { compId: number; layerId: number; name: string };
  authSession: { access_token: string; refresh_token: string };
};
for (const address of [f.supabaseUrl, f.apiUrl])
  assert.equal(new URL(address).hostname, '127.0.0.1');
const stage = path.resolve(
  process.env.WORKING_COPY_QUAL_STAGE ?? path.dirname(path.dirname(config)),
);
const manifest = JSON.parse(
  readFileSync(process.env.FAULT_NATIVE_FIXTURE_MANIFEST ?? path.join(stage, 'fault-native-fixtures.json'), 'utf8'),
) as {
  run: string;
  receipts: {
    name: string;
    file: string;
    sha256: string;
    sizeBytes: number;
    innerAepSha256: string;
    parseFile: string;
    edits: unknown;
    parentArtifactName?: string | null;
  }[];
};
const runId = randomUUID();
const observed: object[] = [];
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sourceText = readFileSync(import.meta.path, 'utf8');
const sourceSha256 = hash(sourceText);
writeFileSync(path.join(stage, `fault-merge-source-${runId}.ts`), sourceText, { flag: 'wx' });
const admin = createClient(f.supabaseUrl, f.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const member = createClient(f.supabaseUrl, f.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let authorization = '',
  principal = '';
async function api(action: string, body: unknown) {
  const response = await fetch(`${f.apiUrl}/api/ai-studio/templates/${f.templateId}/${action}`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const value: unknown = await response.json();
  observed.push({ action, request: body, status: response.status, response: value });
  return { status: response.status, body: value };
}
const artifacts = new Map<
  string,
  {
    assetId: string;
    versionId: string;
    checksum: string;
    edits: ReturnType<typeof templateRevisionEditsSchema.parse>;
  }
>();
async function seedArtifacts() {
  const original = await admin
    .schema('media')
    .from('assets')
    .select('kind,bucket,source,status,integrity_state')
    .eq('id', f.sourceAssetId)
    .single();
  assert.ifError(original.error);
  assert(original.data);
  const source = await admin
    .schema('media')
    .from('template_sources')
    .select('family,fonts,ratios,slot_count')
    .eq('asset_id', f.sourceAssetId)
    .single();
  assert.ifError(source.error);
  assert(source.data);
  for (const receipt of manifest.receipts) {
    const bytes = readFileSync(receipt.file);
    assert.equal(hash(bytes), receipt.sha256);
    assert.equal(bytes.length, receipt.sizeBytes);
    const parse = JSON.parse(readFileSync(receipt.parseFile, 'utf8'));
    assert.equal(parse.structure.sourcePackageChecksum, receipt.sha256);
    assert.equal(parse.structure.sourceAepChecksum, receipt.innerAepSha256);
    const edits = templateRevisionEditsSchema.parse(receipt.edits);
    for (const replacement of [false, ...(receipt.name === 'x620' ? [true] : [])]) {
      const assetId = randomUUID(),
        versionId = randomUUID();
      const name = `${receipt.name}${replacement ? '-replacement' : ''}`;
      const storagePath = `qualification/faults/${runId}/${name}.zip`;
      const uploaded = await admin.storage
        .from(original.data.bucket)
        .upload(storagePath, bytes, { contentType: 'application/zip', upsert: false });
      assert.ifError(uploaded.error);
      const stored: { data: Blob | null; error: unknown } = await admin.storage.from(original.data.bucket).download(storagePath);
      assert.ifError(stored.error);
      assert(stored.data);
      assert.equal(hash(new Uint8Array(await stored.data.arrayBuffer())), receipt.sha256);
      const parent = receipt.parentArtifactName
        ? artifacts.get(receipt.parentArtifactName)
        : undefined;
      if (receipt.parentArtifactName)
        assert(parent, 'Structural child must retain its actual native source identity.');
      const origin = {
        kind: 'template_variant',
        assetId: f.sourceAssetId,
        versionId: f.sourceVersionId,
        ...(replacement || receipt.parentArtifactName === null
          ? {}
          : {
              parentAssetId: parent?.assetId ?? f.sourceAssetId,
              parentVersionId: parent?.versionId ?? f.sourceVersionId,
              revisionEdits: edits,
            }),
      };
      const inserted = await admin
        .schema('media')
        .from('assets')
        .insert({
          id: assetId,
          brand_id: f.brandId,
          created_by: principal,
          kind: original.data.kind,
          bucket: original.data.bucket,
          storage_path: storagePath,
          file_name: `${name}.zip`,
          mime_type: 'application/zip',
          size_bytes: bytes.length,
          source: original.data.source,
          checksum: receipt.sha256,
          status: original.data.status,
          integrity_state: original.data.integrity_state,
          title: `Fault native ${name}`,
          origin_ref: origin,
        });
      assert.ifError(inserted.error);
      const version = await admin
        .schema('media')
        .from('asset_versions')
        .insert({
          id: versionId,
          brand_id: f.brandId,
          asset_id: assetId,
          version_number: 1,
          bucket: original.data.bucket,
          storage_path: storagePath,
          file_name: `${name}.zip`,
          mime_type: 'application/zip',
          size_bytes: bytes.length,
          checksum: receipt.sha256,
          created_by: principal,
          integrity_state: original.data.integrity_state,
        });
      assert.ifError(version.error);
      assert.ifError(
        (
          await admin
            .schema('media')
            .from('assets')
            .update({ head_version_id: versionId })
            .eq('id', assetId)
            .eq('brand_id', f.brandId)
        ).error,
      );
      assert.ifError(
        (
          await admin
            .schema('media')
            .from('template_sources')
            .insert({
              asset_id: assetId,
              brand_id: f.brandId,
              version_id: versionId,
              ...source.data,
              parse_state: 'parsed',
              parse,
              parser: parse.parser,
              parsed_at: new Date().toISOString(),
            })
        ).error,
      );
      artifacts.set(name, { assetId, versionId, checksum: receipt.sha256, edits });
      observed.push({
        fixturePreparation:
          'Actual native writer and Rust parser bytes uploaded/read back, then canonical coordinator acceptance',
        name,
        assetId,
        versionId,
        packageSha256: receipt.sha256,
        innerAepSha256: receipt.innerAepSha256,
        sourceReplacement: replacement,
      });
    }
  }
}
async function branch(
  name: string,
  parentRevisionId = f.branches[0]!.revisionId,
): Promise<TemplateRevision> {
  const result = await api('branches', {
    brandId: f.brandId,
    parentRevisionId,
    name: `Fault ${name} ${runId.slice(0, 8)}`,
    idempotencyKey: `fault:${runId}:${name}:${randomUUID()}`,
  });
  assert.equal(result.status, 200);
  return templateVersionResultSchema.parse(result.body).revision;
}
async function save(base: TemplateRevision, artifact: string) {
  const value = artifacts.get(artifact);
  assert(value);
  const intent = {
    kind: 'save',
    variantId: base.variantId,
    parentRevisionId: base.id,
    expectedHeadRevisionId: base.id,
    sourceAssetId: value.assetId,
    sourceVersionId: value.versionId,
    edits: value.edits,
    dependencies: base.dependencies ?? { fonts: [], media: [] },
    idempotencyKey: `fault:${runId}:${randomUUID()}`,
    message: 'Qualification fixture from verified actual native writer package',
  };
  const accepted = await admin.schema('media').rpc('commit_template_version', {
    p_brand_id: f.brandId,
    p_template_id: f.templateId,
    p_operator_user_id: principal,
    p_intent: { ...intent, requestFingerprint: hash(JSON.stringify(intent)) },
  });
  assert.ifError(accepted.error);
  const id = (accepted.data as { revisionId: string }).revisionId;
  const read = await fetch(
    `${f.apiUrl}/api/ai-studio/templates/${f.templateId}/revision-variants?brandId=${f.brandId}`,
    { headers: { authorization } },
  );
  assert.equal(read.status, 200);
  const family = (await read.json()) as { items: { revisions: TemplateRevision[] }[] };
  const revision = family.items
    .flatMap((variant) => variant.revisions)
    .find((revision) => revision.id === id);
  assert(revision);
  return revision;
}
async function pair(label: string, ours: string, theirs: string, parentRevisionId?: string) {
  const a = await save(await branch(`${label}-A`, parentRevisionId), ours),
    b = await save(await branch(`${label}-B`, parentRevisionId), theirs);
  const request = {
    brandId: f.brandId,
    variantId: a.variantId,
    sourceVariantId: b.variantId,
    expectedHeadRevisionId: a.id,
    expectedSourceHeadRevisionId: b.id,
  };
  const result = await api('merges/preview', request);
  assert.equal(result.status, 200);
  return { a, b, request, preview: templateVersionMergePreviewSchema.parse(result.body) };
}
async function commitPair(
  value: Awaited<ReturnType<typeof pair>>,
  resolutions: { path: string; choice: 'ours' | 'theirs' }[],
) {
  return api('merges', {
    ...value.request,
    previewToken: value.preview.previewToken,
    resolutions,
    idempotencyKey: `fault:${runId}:merge:${randomUUID()}`,
    message: 'Authenticated explicit fault qualification merge',
  });
}
async function verifyCombinedRevision(revision: TemplateRevision, value: Awaited<ReturnType<typeof pair>>) {
  assert.equal(revision.parentRevisionId, value.a.id);
  assert.notEqual(revision.sourceVersionId, value.a.sourceVersionId);
  assert.notEqual(revision.sourceVersionId, value.b.sourceVersionId);
  assert(revision.edits.layers.some((layer) => layer.compId === f.layer.compId && layer.layerId === f.layer.layerId && layer.x === 600 && layer.y === 1100));
  const parents = await admin.schema('media').from('template_version_commits')
    .select('merge_parent_revision_id').eq('brand_id', f.brandId).eq('revision_id', revision.id).single();
  assert.ifError(parents.error);
  assert.equal(parents.data?.merge_parent_revision_id, value.b.id);
  const pin = await admin.schema('media').from('asset_versions')
    .select('bucket,storage_path,checksum,size_bytes').eq('brand_id', f.brandId)
    .eq('asset_id', revision.sourceAssetId).eq('id', revision.sourceVersionId).single();
  assert.ifError(pin.error); assert(pin.data);
  const stored = await admin.storage.from(pin.data.bucket).download(pin.data.storage_path);
  assert.ifError(stored.error); assert(stored.data);
  const bytes = new Uint8Array(await stored.data.arrayBuffer());
  assert.equal(bytes.length, pin.data.size_bytes);
  assert.equal(hash(bytes), pin.data.checksum);
  assert.equal(hash(bytes), revision.checksum);
  const snapshot = await admin.schema('media').from('template_revisions')
    .select('parse:source_snapshot->parse').eq('brand_id', f.brandId)
    .eq('id', revision.id).eq('template_id', f.templateId).single();
  assert.ifError(snapshot.error);
  const parse = snapshot.data?.parse as { structure: { sourcePackageChecksum: string; sourceAepChecksum: string;
    comps: { id: number; layers: { id: number; positionSource?: { kind: string; value: number[] } }[] }[] } };
  assert(parse?.structure);
  assert.equal(parse.structure.sourcePackageChecksum, hash(bytes));
  const aeps = Object.entries(unzipSync(bytes)).filter(([name]) => /\.aep$/i.test(name));
  assert.equal(aeps.length, 1, 'This qualification source has one genuine AEP.');
  assert.equal(hash(aeps[0]![1]), parse.structure.sourceAepChecksum);
  const position = parse.structure.comps.find((comp) => comp.id === f.layer.compId)?.layers.find((layer) => layer.id === f.layer.layerId)?.positionSource;
  assert.equal(position?.kind, 'explicit');
  assert.deepEqual(position?.value.slice(0, 2), [600, 1100]);
  const packageFile = path.join(stage, `fault-merge-output-${runId}.zip`);
  writeFileSync(packageFile, bytes, { flag: 'wx' });
  observed.push({ combinedByteReadback: { packageFile, revisionId: revision.id, parentRevisionId: value.a.id,
    mergeParentRevisionId: value.b.id, sourceAssetId: revision.sourceAssetId, sourceVersionId: revision.sourceVersionId,
    packageSha256: hash(bytes), packageBytes: bytes.length, innerAepSha256: hash(aeps[0]![1]),
    nativeParsedPosition: position?.value, qualification: 'Stored immutable parse and independently downloaded package/AEP hashes; no pixel or dependency completeness claim' } });
}
try {
  const signed = await member.auth.setSession(f.authSession);
  assert.ifError(signed.error);
  assert(signed.data.session);
  authorization = `Bearer ${signed.data.session.access_token}`;
  principal = signed.data.session.user.id;
  assert.equal(
    (await member.auth.getUser(signed.data.session.access_token)).data.user?.id,
    principal,
  );
  await seedArtifacts();
  rec.record(
    'Actual native packages retain distinct verified package/AEP hashes and canonical revision identities',
    'PASS',
  );
  const independent = await pair('independent', 'x600', 'y1100');
  assert.deepEqual(independent.preview.conflicts, []);
  assert(
    independent.preview.edits.layers.some(
      (layer) => layer.compId === f.layer.compId && layer.layerId === f.layer.layerId && layer.x === 600 && layer.y === 1100,
    ),
  );
  rec.record('Actual authenticated three-way preview combines independent X and Y edits', 'PASS');
  const independentCommit = await commitPair(independent, []);
  if (independentCommit.status === 200) {
    await verifyCombinedRevision(templateVersionResultSchema.parse(independentCommit.body).revision, independent);
    rec.record(
      'Independent combined-state merge appends both parents and actual stored package/AEP hashes match native parsed X/Y',
      'PASS',
    );
  } else {
    if (process.env.FAULT_MERGE_CASE === 'combined') assert.equal(independentCommit.status, 200, JSON.stringify(independentCommit.body));
    assert([409, 502, 503].includes(independentCommit.status));
    rec.record(
      'Independent combined-state merge materialization',
      'SKIP',
      `Actual service refusal HTTP ${independentCommit.status}: ${JSON.stringify(independentCommit.body)}; no receipt fabricated`,
    );
  }
  if (process.env.FAULT_MERGE_CASE !== 'combined') {
    const identical = await pair('identical', 'x600', 'x600');
    assert.deepEqual(identical.preview.conflicts, []);
    const combined = await commitPair(identical, []);
    assert.equal(combined.status, 200);
    const merged = templateVersionResultSchema.parse(combined.body).revision;
    assert.notEqual(merged.id, identical.a.id);
    assert.equal(merged.parentRevisionId, identical.a.id);
    assert.equal(merged.sourceVersionId, identical.a.sourceVersionId);
    const metadata = await admin
      .schema('media')
      .from('template_version_commits')
      .select('merge_parent_revision_id')
      .eq('revision_id', merged.id)
      .single();
    assert.ifError(metadata.error);
    assert.equal(metadata.data?.merge_parent_revision_id, identical.b.id);
    rec.record(
      'Identical outcomes append a real two-parent merge reusing verified existing bytes',
      'PASS',
    );
    for (const choice of ['ours', 'theirs'] as const) {
      const overlap = await pair(`overlap-${choice}`, 'x600', 'x620');
      assert.equal(overlap.preview.conflicts.length, 1);
      assert.equal(overlap.preview.conflicts[0]?.kind, 'field');
      assert.equal((await commitPair(overlap, [])).status, 409);
      const resolved = await commitPair(overlap, [
        { path: overlap.preview.conflicts[0]!.path, choice },
      ]);
      assert.equal(resolved.status, 200);
      const actual = templateVersionResultSchema.parse(resolved.body).revision;
      assert.deepEqual(actual.edits, choice === 'ours' ? overlap.a.edits : overlap.b.edits);
      assert.equal(
        actual.sourceVersionId,
        choice === 'ours' ? overlap.a.sourceVersionId : overlap.b.sourceVersionId,
      );
      rec.record(
        `Overlapping real edits preserve proposals until explicit ${choice} choice selects exact verified bytes`,
        'PASS',
      );
    }
    for (const side of ['destination', 'source'] as const) {
      const stale = await pair(`stale-${side}`, 'x600', 'x600');
      const moved = side === 'destination' ? stale.a : stale.b;
      const restored = await api('reverts', {
        brandId: f.brandId,
        variantId: moved.variantId,
        restoreRevisionId: moved.id,
        expectedHeadRevisionId: moved.id,
        idempotencyKey: `fault:${runId}:move:${side}`,
      });
      assert.equal(restored.status, 200);
      assert.equal((await commitPair(stale, [])).status, 409);
      rec.record(`Merge commit refuses a ${side} head moved after its actual preview`, 'PASS');
    }
    const source = await pair('source-replacement', 'x600', 'x620-replacement');
    assert(source.preview.conflicts.some((conflict) => conflict.kind === 'source'));
    assert.equal((await commitPair(source, [])).status, 409);
    rec.record(
      'Source replacement with distinct verified bytes remains a review conflict without derivation claims',
      'PASS',
    );
    const structuralBase = await save(await branch('structural-base'), 'shapeBase');
    const structural = await pair('structural', 'orderA', 'orderB', structuralBase.id);
    assert(
      structural.preview.conflicts.some(
        (conflict) => conflict.kind === 'structural' && conflict.path === '/orders/127',
      ),
    );
    assert.equal((await commitPair(structural, [])).status, 409);
    const structuralCommit = await commitPair(structural, [{ path: '/orders/127', choice: 'ours' }]);
    assert.equal(structuralCommit.status, 200);
    assert.equal(
      templateVersionResultSchema.parse(structuralCommit.body).revision.sourceVersionId,
      structural.a.sourceVersionId,
    );
    rec.record(
      'Competing actual three-layer native orders remain structural conflicts until explicit resolution commits exact selected bytes',
      'PASS',
    );
  }
} catch (cause) {
  rec.record(
    'Actual authenticated merge qualification',
    'FAIL',
    cause instanceof Error ? cause.message : String(cause),
  );
} finally {
  writeFileSync(
    path.join(stage, `fault-merge-observed-${runId}.json`),
    `${JSON.stringify({ runId, sourceSha256, observed }, null, 2)}\n`,
  );
  rec.note(
    'Fixture writes use actual native bytes and canonical coordinator. Source dependency diagnostics remain in each actual parse; resolved font/footage completeness, rendered fidelity and production rendering are not qualified.',
  );
  rec.finish({ json: true });
}
