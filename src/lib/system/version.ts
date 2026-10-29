export const LOCAL_DEV_SHA = 'local-dev';

type CommitEnv = {
  VERCEL_GIT_COMMIT_SHA?: string;
  NEXT_PUBLIC_COMMIT_SHA?: string;
};

type CommitEnvSource = CommitEnv | NodeJS.ProcessEnv;

export function getServerCommitSha(env: CommitEnvSource = process.env): string {
  return env.VERCEL_GIT_COMMIT_SHA ?? LOCAL_DEV_SHA;
}

export function getClientCommitSha(env: CommitEnvSource = process.env): string {
  return env.NEXT_PUBLIC_COMMIT_SHA ?? LOCAL_DEV_SHA;
}

export function isVersionMismatch({
  clientSha,
  serverSha,
}: {
  clientSha?: string;
  serverSha?: string;
}): boolean {
  if (!clientSha || !serverSha) return false;
  if (clientSha === LOCAL_DEV_SHA || serverSha === LOCAL_DEV_SHA) return false;
  return clientSha !== serverSha;
}

export type VersionResponse = { sha: string };

// A hand check, not zod: this runs in the root layout, and zod would ride every page's first load.
export function parseVersionResponse(payload: unknown): VersionResponse {
  const sha = (payload as { sha?: unknown } | null)?.sha;
  if (typeof sha !== 'string' || !sha) {
    throw new Error('Invalid version response from server.');
  }
  return { sha };
}

// What a tab says when its build is no longer the deployed one: the chunk it asks for is gone
// (Next/webpack "ChunkLoadError", or a dynamic import 404), or the Server Action id it posts
// belongs to a build the server no longer runs. Either way every press that needs that code
// does nothing at all, not even a spinner, until the page reloads.
const STALE_BUILD_PATTERNS = [
  /ChunkLoadError/,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Failed to find Server Action/i,
  /Server action not found/i,
];

export function isStaleBuildError(reason: unknown): boolean {
  const text =
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : typeof (reason as { message?: unknown } | null)?.message === 'string'
          ? String((reason as { message: string }).message)
          : '';
  return text !== '' && STALE_BUILD_PATTERNS.some((pattern) => pattern.test(text));
}
