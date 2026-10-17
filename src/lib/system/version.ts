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
