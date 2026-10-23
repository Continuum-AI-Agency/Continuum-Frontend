/** Real saved row -> authenticated Backend preflight -> the Frontend HTTP response validator. */
import assert from 'node:assert/strict';
import {
  API_RENDER_BATCH_PREFLIGHT_ROUTE,
  API_RENDER_SETS_ROUTE,
  apiRenderBatchPreflightRequestSchema,
  apiRenderBatchPreflightResponseSchema,
  forgeRenderSetSchema,
  resolveForgeRenderSetRows,
} from '@continuum/contracts';
import { http } from '../src/lib/api/http';
import { mintSessionBundleForEmail } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';

const rec = createBenchRecorder('forge:batch-preflight:e2e:bench', [
  'Reads one existing saved row; preflights only. Does not confirm, render, save, or deliver.',
]);
function required(name: string): string {
  const value = process.env[name];
  assert(value, `Missing ${name}`);
  return value;
}

try {
  const brandId = required('FORGE_BENCH_BRAND_ID');
  const setId = required('FORGE_BENCH_SET_ID');
  const session = await rec.step('Authenticate existing brand member', () =>
    mintSessionBundleForEmail(required('FORGE_BENCH_USER_EMAIL')),
  );
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const set = await rec.step('Read the real saved render set through the Frontend HTTP client', () =>
    http.request({
      path: `${API_RENDER_SETS_ROUTE}/${encodeURIComponent(setId)}?${new URLSearchParams({ brandId })}`,
      headers,
      schema: forgeRenderSetSchema,
    }),
  );
  const row = resolveForgeRenderSetRows(set.rows)[0];
  assert(row, 'The saved set must contain a row');
  const body = apiRenderBatchPreflightRequestSchema.parse({
    brandId,
    bindingId: set.bindingId,
    templateKey: set.templateKey,
    contractHash: set.contractHash,
    records: [{
      label: set.rows[0]?.label ?? 'Base',
      renderSetId: set.id,
      renderSetRowId: row.id,
      expectedRenderSetRevision: set.revision,
      rootRowId: row.rootRowId,
      parentRowId: row.parentRowId,
      variables: row.variables,
      ...(row.outputIds.length ? { outputIds: row.outputIds } : {}),
      ...(row.encode ? { encode: row.encode } : {}),
    }],
  });
  await rec.step('Parse the real batch response including records[0].engine', async () => {
    const response = await http.request({
      path: API_RENDER_BATCH_PREFLIGHT_ROUTE,
      method: 'POST',
      headers,
      body,
      schema: apiRenderBatchPreflightResponseSchema,
      timeoutMs: 120_000,
    });
    assert.equal(response.effects, 'none');
    assert.equal(response.records.length, 1);
    assert.equal(response.records[0]?.label, body.records[0]?.label);
    assert(response.records[0]?.engine);
    console.log(JSON.stringify({ template: response.template.displayName, engine: response.records[0].engine }));
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  rec.record('Benchmark failed', 'FAIL', message);
  console.error(message);
  process.exitCode = 1;
} finally {
  rec.print();
}
