import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { isOtelLogsEnabled, resolveOtelLogsConfig } from './otelLogs';

const ENV_KEYS = [
  'POSTHOG_TOKEN',
  'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_COMMIT_SHA',
  'VERCEL_ENV',
  'NODE_ENV',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('resolveOtelLogsConfig', () => {
  it('prefers POSTHOG_TOKEN over the public project token', () => {
    process.env.POSTHOG_TOKEN = 'phc_server';
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_public';

    expect(resolveOtelLogsConfig()?.token).toBe('phc_server');
  });

  it('falls back to the public project token', () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_public';

    expect(resolveOtelLogsConfig()?.token).toBe('phc_public');
  });

  it('returns null when no token is configured', () => {
    expect(resolveOtelLogsConfig()).toBeNull();
  });

  it('rejects a personal API key, which the ingest endpoint would silently refuse', () => {
    process.env.POSTHOG_TOKEN = 'phx_personal_api_key';

    expect(resolveOtelLogsConfig()).toBeNull();
  });

  it('targets the PostHog logs ingest endpoint, never the browser /ingest proxy', () => {
    process.env.POSTHOG_TOKEN = 'phc_token';

    const url = resolveOtelLogsConfig()?.url;

    expect(url).toBe('https://us.i.posthog.com/i/v1/logs');
    expect(url).not.toContain('/ingest');
  });

  it('honors a configured host and trims its trailing slash', () => {
    process.env.POSTHOG_TOKEN = 'phc_token';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com/';

    expect(resolveOtelLogsConfig()?.url).toBe('https://eu.i.posthog.com/i/v1/logs');
  });

  it('ignores a non-https host rather than exporting to a bad origin', () => {
    process.env.POSTHOG_TOKEN = 'phc_token';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = '/ingest';

    expect(resolveOtelLogsConfig()?.url).toBe('https://us.i.posthog.com/i/v1/logs');
  });

  it('stamps the resource with service, commit and deploy environment', () => {
    process.env.POSTHOG_TOKEN = 'phc_token';
    process.env.NEXT_PUBLIC_COMMIT_SHA = 'abc123';
    process.env.VERCEL_ENV = 'preview';

    expect(resolveOtelLogsConfig()?.resourceAttributes).toEqual({
      'service.name': 'continuum-frontend',
      'service.version': 'abc123',
      'deployment.environment': 'preview',
    });
  });
});

describe('isOtelLogsEnabled', () => {
  it('is off in development even with a valid token', () => {
    process.env.POSTHOG_TOKEN = 'phc_token';
    process.env.NODE_ENV = 'development';

    expect(isOtelLogsEnabled()).toBe(false);
  });

  it('is off without a token', () => {
    process.env.NODE_ENV = 'production';

    expect(isOtelLogsEnabled()).toBe(false);
  });

  it('is on in production with a valid token', () => {
    process.env.POSTHOG_TOKEN = 'phc_token';
    process.env.NODE_ENV = 'production';

    expect(isOtelLogsEnabled()).toBe(true);
  });
});
