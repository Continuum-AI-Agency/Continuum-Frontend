/**
 * End-to-end bench: real logger -> real OTLP exporter -> PostHog's live logs ingest endpoint.
 *
 * Asserts PostHog accepted a real record (ExportResultCode.SUCCESS). Two hops are NOT covered here
 * and must be confirmed by eye:
 *   1. read-back — proving the record is queryable needs a personal API key (phx_), which this repo
 *      does not carry. Search the printed marker in PostHog -> Logs.
 *   2. onRequestError firing on a real request — it can only export from preview/production, since
 *      local dev is console-only by design. Confirm after deploying.
 *
 * Run: bun run posthog:logs:bench   (from Continuum-Frontend, or via the root script)
 */
import { DiagLogLevel, diag } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { flushLogs, log } from './logger';
import {
  createLogExporter,
  isOtelLogsEnabled,
  registerOtelLogs,
  resolveOtelLogsConfig,
} from './otelLogs';

const marker = `bench-${crypto.randomUUID()}`;
const exporterErrors: string[] = [];

function fail(reason: string): never {
  console.error(`\nFAIL  ${reason}`);
  process.exit(1);
}

diag.setLogger(
  {
    error: (message, ...args) => exporterErrors.push([message, ...args.map(String)].join(' ')),
    warn: () => {},
    info: () => {},
    debug: () => {},
    verbose: () => {},
  },
  DiagLogLevel.ERROR,
);

const config = resolveOtelLogsConfig();
if (!config) {
  fail(
    'No PostHog project token resolved. Set POSTHOG_TOKEN (phc_...) in Continuum-Frontend/.env — ' +
      'a personal API key (phx_) is rejected on purpose.',
  );
}
if (!isOtelLogsEnabled()) {
  fail(
    `Export gate is closed. NODE_ENV is "${process.env.NODE_ENV}"; the bench must run as production.`,
  );
}

// Wraps the exporter the app actually uses, so the assertion below is made against the real export.
const results: ExportResult[] = [];
const realExporter = createLogExporter(config);
const observedExporter: LogRecordExporter = {
  export: (records: ReadableLogRecord[], done: (result: ExportResult) => void) =>
    realExporter.export(records, (result) => {
      results.push(result);
      done(result);
    }),
  // Load-bearing: BatchLogRecordProcessor calls forceFlush() before awaiting the export, and a
  // missing one throws into the global error handler, letting the flush resolve before the record
  // has left the process.
  forceFlush: () => realExporter.forceFlush(),
  shutdown: () => realExporter.shutdown(),
};

if (!registerOtelLogs(observedExporter)) {
  fail('registerOtelLogs() declined to register a provider.');
}

console.log(`\nPostHog logs bench`);
console.log(`  endpoint    ${config.url}`);
console.log(`  token       ${config.token.slice(0, 8)}…`);
console.log(`  resource    ${JSON.stringify(config.resourceAttributes)}`);
console.log(`  marker      ${marker}\n`);

log.info('[bench] posthog logs pipeline', { bench_marker: marker, hop: 'info' });
log.error('[bench] posthog logs pipeline', new Error('bench synthetic failure'), {
  bench_marker: marker,
  hop: 'error',
});

await flushLogs();

if (results.length === 0) {
  fail('The exporter was never invoked — nothing reached PostHog.');
}

const rejected = results.filter((result) => result.code !== ExportResultCode.SUCCESS);
if (rejected.length > 0) {
  for (const result of rejected)
    console.error(`  export failed: ${result.error?.message ?? 'unknown'}`);
  fail(`PostHog rejected ${rejected.length}/${results.length} export(s).`);
}
if (exporterErrors.length > 0) {
  for (const message of exporterErrors) console.error(`  exporter diag: ${message}`);
  fail('The exporter reported errors.');
}

console.log(`PASS  PostHog accepted ${results.length} export(s), 2 log records.`);
console.log(
  `\nUn-exercised hop: read-back. Confirm in PostHog -> Logs by searching:\n  ${marker}\n`,
);
