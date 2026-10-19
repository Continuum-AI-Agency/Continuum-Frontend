// Which env keys are an app cache, for organic:publish-targets:e2e:bench. One matcher for the env
// builder (publishTargetsBench.ts) and both in-process probes (the preloads), so what the bench
// strips and what cell 0 fails on cannot disagree. Importable from a preload: no other imports.

const CACHE_KEY_NAME = /REDIS|UPSTASH|APP_CACHE|KV_REST/i;
const CACHE_URL_VALUE = /upstash\.io|^\s*rediss?:\/\//i;

/**
 * Names (never values) of the keys that reach a Redis/Upstash cache: named like one, holding an
 * upstash.io or redis:// / rediss:// URL (`CHAT_CACHE_REST_URL` names no cache but holds one), or
 * the token beside such a URL (same prefix, ending `TOKEN`: `CHAT_CACHE_REST_TOKEN`).
 */
export function cacheEnvKeys(env: Record<string, string | undefined>): string[] {
  const keys = new Set<string>();
  const urlPrefixes: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && CACHE_URL_VALUE.test(value)) {
      keys.add(key);
      urlPrefixes.push(`${key.replace(/_[^_]*$/, '')}_`);
    } else if (CACHE_KEY_NAME.test(key)) {
      keys.add(key);
    }
  }
  for (const key of Object.keys(env)) {
    if (/TOKEN$/i.test(key) && urlPrefixes.some((prefix) => key.startsWith(prefix))) keys.add(key);
  }
  return [...keys].sort();
}

/** The cache keys that hold a value right now: what a live process could still use. */
export const liveCacheEnvKeys = (env: Record<string, string | undefined>): string[] =>
  cacheEnvKeys(env).filter((key) => env[key]);

if (process.argv[1]?.endsWith('publishTargetsBenchEnv.ts') && process.argv.includes('--self-check')) {
  const fake = {
    CHAT_CACHE_REST_URL: 'https://x.upstash.io',
    CHAT_CACHE_REST_TOKEN: 't',
    CHAT_CACHE_REST_READ_ONLY_TOKEN: 't',
    SOME_TCP_URL: 'rediss://h:6379',
    UPSTASH_REDIS_REST_TOKEN: 't',
    APP_CACHE_REDIS_URL: '',
    SLACK_BOT_TOKEN: 't',
    SUPABASE_URL: 'http://127.0.0.1:54321',
  };
  const got = cacheEnvKeys(fake).join(',');
  const want =
    'APP_CACHE_REDIS_URL,CHAT_CACHE_REST_READ_ONLY_TOKEN,CHAT_CACHE_REST_TOKEN,CHAT_CACHE_REST_URL,SOME_TCP_URL,UPSTASH_REDIS_REST_TOKEN';
  if (got !== want) throw new Error(`cacheEnvKeys: got ${got}`);
  if (liveCacheEnvKeys(fake).includes('APP_CACHE_REDIS_URL')) throw new Error('blank counted live');
  console.log('cacheEnvKeys self-check ok');
}
