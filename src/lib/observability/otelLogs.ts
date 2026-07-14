import { logs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
  type LogRecordExporter,
} from '@opentelemetry/sdk-logs';

export const SERVICE_NAME = 'continuum-frontend';

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const LOGS_INGEST_PATH = '/i/v1/logs';
const PROJECT_TOKEN_PREFIX = 'phc_';

export type OtelLogsConfig = {
  token: string;
  url: string;
  resourceAttributes: Record<string, string>;
};

/**
 * The browser SDK is proxied through the `/ingest` rewrite to survive ad blockers. Server-side
 * export has neither that problem nor that rewrite, so it must address PostHog directly.
 */
function resolveIngestUrl(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const origin = host?.startsWith('https://') ? host.replace(/\/+$/, '') : DEFAULT_POSTHOG_HOST;
  return `${origin}${LOGS_INGEST_PATH}`;
}

/**
 * Returns null when logs cannot be shipped, which is a valid state: local checkouts without a
 * token stay console-only. A personal API key (`phx_`) is rejected outright — PostHog's ingest
 * endpoint only accepts a project token, and swapping the two fails silently at export time.
 */
export function resolveOtelLogsConfig(): OtelLogsConfig | null {
  const token = process.env.POSTHOG_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token?.startsWith(PROJECT_TOKEN_PREFIX)) return null;

  return {
    token,
    url: resolveIngestUrl(),
    resourceAttributes: {
      'service.name': SERVICE_NAME,
      'service.version': process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'local-dev',
      'deployment.environment': process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    },
  };
}

/** Mirrors the dev gate in `instrumentation-client.ts`: local runs stay console-only. */
export function isOtelLogsEnabled(): boolean {
  return process.env.NODE_ENV !== 'development' && resolveOtelLogsConfig() !== null;
}

export function createLogExporter(config: OtelLogsConfig): LogRecordExporter {
  return new OTLPLogExporter({
    url: config.url,
    headers: {
      Authorization: `Bearer ${config.token}`,
      // PostHog rejects the export without an explicit JSON content type.
      'Content-Type': 'application/json',
    },
  });
}

export function createLoggerProvider(
  config: OtelLogsConfig,
  exporter: LogRecordExporter = createLogExporter(config),
): LoggerProvider {
  return new LoggerProvider({
    resource: resourceFromAttributes(config.resourceAttributes),
    processors: [new BatchLogRecordProcessor({ exporter })],
  });
}

let registered = false;

/**
 * Publishes the provider on OpenTelemetry's global registry, which lives on a `globalThis` symbol.
 * That is what lets `instrumentation.ts` and the route handlers — separate Next bundles — share one
 * provider and one export queue.
 *
 * The exporter override exists so the bench can observe the real export result; production passes
 * nothing.
 */
export function registerOtelLogs(exporter?: LogRecordExporter): boolean {
  if (registered) return true;

  const config = isOtelLogsEnabled() ? resolveOtelLogsConfig() : null;
  if (!config) return false;

  logs.setGlobalLoggerProvider(createLoggerProvider(config, exporter));
  registered = true;
  return true;
}

type FlushableProvider = { forceFlush?: () => Promise<void> };

/**
 * Serverless instances freeze the moment a response is sent, before a batched export can leave.
 * Flushing is therefore mandatory, not an optimization. Resolves to a no-op when no SDK provider
 * is registered (the global fallback is a no-op provider), so callers never need to check.
 */
export async function flushLogs(): Promise<void> {
  const provider = logs.getLoggerProvider() as unknown as FlushableProvider;
  await provider.forceFlush?.();
}
