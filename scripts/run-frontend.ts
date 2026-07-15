import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOCAL_SUPABASE_REST_URL = 'http://127.0.0.1:54321/rest/v1/';
const LOCAL_SUPABASE_TIMEOUT_MS = 750;

type Environment = Record<string, string | undefined>;
type NextMode = 'development' | 'production';

export type FrontendEnvironmentSource = 'local' | 'production';

export type ResolvedFrontendEnvironment = {
  environment: Record<string, string>;
  source: FrontendEnvironmentSource;
};

const readEnvironmentFile = (filePath: string): Environment => {
  if (!existsSync(filePath)) return {};

  const environment: Environment = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim();
    environment[key] =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value.replace(/\s+#.*$/, '');
  }
  return environment;
};

const isSupabaseEnvironmentVariable = (key: string): boolean =>
  key.startsWith('NEXT_PUBLIC_SUPABASE_') || key.startsWith('SUPABASE_');

const selectSupabaseEnvironment = (environment: Environment): Record<string, string> =>
  Object.fromEntries(
    Object.entries(environment).filter(
      ([key, value]) => isSupabaseEnvironmentVariable(key) && value !== undefined,
    ),
  ) as Record<string, string>;

const withoutSupabaseVariables = (environment: Environment): Record<string, string> =>
  Object.fromEntries(
    Object.entries(environment).filter(
      ([key, value]) => !isSupabaseEnvironmentVariable(key) && value !== undefined,
    ),
  ) as Record<string, string>;

const hasLocalSupabaseCredentials = (environment: Environment): boolean =>
  Boolean(
    environment.NEXT_PUBLIC_SUPABASE_URL &&
      (environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
        environment.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
      environment.SUPABASE_SERVICE_ROLE_KEY,
  );

export const isLocalSupabaseReachable = async (
  localSupabaseRestUrl = LOCAL_SUPABASE_REST_URL,
  fetchImplementation: typeof fetch = fetch,
): Promise<boolean> => {
  try {
    await fetchImplementation(localSupabaseRestUrl, {
      signal: AbortSignal.timeout(LOCAL_SUPABASE_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
};

export const resolveFrontendEnvironment = async ({
  frontendDirectory,
  inheritedEnvironment = process.env,
  mode = 'development',
  localSupabaseReachable = isLocalSupabaseReachable,
  forceSource,
}: {
  frontendDirectory: string;
  inheritedEnvironment?: Environment;
  mode?: NextMode;
  localSupabaseReachable?: () => Promise<boolean>;
  forceSource?: FrontendEnvironmentSource;
}): Promise<ResolvedFrontendEnvironment> => {
  const productionEnvironment = selectSupabaseEnvironment(
    readEnvironmentFile(resolve(frontendDirectory, '.env')),
  );
  const modeEnvironment = selectSupabaseEnvironment(
    readEnvironmentFile(resolve(frontendDirectory, `.env.${mode}`)),
  );
  const localEnvironment = {
    ...selectSupabaseEnvironment(readEnvironmentFile(resolve(frontendDirectory, '.env.local'))),
    ...selectSupabaseEnvironment(
      readEnvironmentFile(resolve(frontendDirectory, `.env.${mode}.local`)),
    ),
  };

  const environment = {
    ...withoutSupabaseVariables(inheritedEnvironment),
    ...productionEnvironment,
    ...modeEnvironment,
  };

  if (
    forceSource !== 'production' &&
    (await localSupabaseReachable()) &&
    hasLocalSupabaseCredentials(localEnvironment)
  ) {
    return { environment: { ...environment, ...localEnvironment }, source: 'local' };
  }

  return { environment, source: 'production' };
};

const startFrontend = async (): Promise<void> => {
  const frontendDirectory = resolve(import.meta.dir, '..');
  const command = process.argv[2];
  const forceProduction = process.argv.includes('--supabase=production');
  const commands = {
    '--build': {
      mode: 'production' as const,
      args: ['run', '--bun', 'next', 'build', '--turbopack'],
    },
    '--dev': { mode: 'development' as const, args: ['run', '--bun', 'next', 'dev', '--turbopack'] },
    '--start': { mode: 'production' as const, args: ['run', '--bun', 'next', 'start'] },
  };
  const selection = commands[command as keyof typeof commands];
  if (!selection) throw new Error('Usage: run-frontend.ts --dev|--build|--start');

  const { environment, source } = await resolveFrontendEnvironment({
    frontendDirectory,
    mode: selection.mode,
    forceSource: forceProduction ? 'production' : undefined,
  });
  console.info(`[frontend] Supabase target: ${source}`);

  const child = Bun.spawn({
    cmd: ['bun', '--no-env-file', ...selection.args],
    cwd: frontendDirectory,
    env: environment,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  process.exit(await child.exited);
};

if (import.meta.main) {
  await startFrontend();
}
