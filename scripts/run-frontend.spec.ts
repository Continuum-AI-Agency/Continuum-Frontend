import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isLocalSupabaseReachable, resolveFrontendEnvironment } from './run-frontend';

const temporaryDirectories: string[] = [];

const makeFrontendDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'continuum-frontend-env-'));
  temporaryDirectories.push(directory);
  writeFileSync(
    join(directory, '.env'),
    [
      'NEXT_PUBLIC_SUPABASE_URL=https://production.supabase.co',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=production-key',
    ].join('\n'),
  );
  writeFileSync(
    join(directory, '.env.local'),
    [
      'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=local-key',
      'SUPABASE_SERVICE_ROLE_KEY=local-service-key',
    ].join('\n'),
  );
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('frontend Supabase environment selection', () => {
  it('uses production Supabase when local Supabase is unavailable', async () => {
    const environment = await resolveFrontendEnvironment({
      frontendDirectory: makeFrontendDirectory(),
      inheritedEnvironment: { NEXT_PUBLIC_SUPABASE_URL: 'http://stale-local-value' },
      localSupabaseReachable: async () => false,
    });

    expect(environment.source).toBe('production');
    expect(environment.environment.NEXT_PUBLIC_SUPABASE_URL).toBe('https://production.supabase.co');
    expect(environment.environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY).toBe(
      'production-key',
    );
  });

  it('uses local Supabase only after the localhost probe succeeds', async () => {
    const environment = await resolveFrontendEnvironment({
      frontendDirectory: makeFrontendDirectory(),
      localSupabaseReachable: async () => true,
    });

    expect(environment.source).toBe('local');
    expect(environment.environment.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    expect(environment.environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY).toBe('local-key');
  });

  it('uses production Supabase when production is explicitly requested', async () => {
    const environment = await resolveFrontendEnvironment({
      frontendDirectory: makeFrontendDirectory(),
      forceSource: 'production',
      localSupabaseReachable: async () => true,
    });

    expect(environment.source).toBe('production');
    expect(environment.environment.NEXT_PUBLIC_SUPABASE_URL).toBe('https://production.supabase.co');
  });

  it('treats an authenticated local PostgREST response as reachable', async () => {
    const fetchImplementation: typeof fetch = async () => new Response(null, { status: 401 });

    expect(
      await isLocalSupabaseReachable('http://127.0.0.1:54321/rest/v1/', fetchImplementation),
    ).toBe(true);
  });
});
