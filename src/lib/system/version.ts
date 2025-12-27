import { versionResponseSchema, type VersionResponse } from "@/lib/schemas/version";

export const LOCAL_DEV_SHA = "local-dev";

type CommitEnv = {
  VERCEL_GIT_COMMIT_SHA?: string;
  NEXT_PUBLIC_COMMIT_SHA?: string;
};

export function getServerCommitSha(env: CommitEnv = process.env): string {
  return env.VERCEL_GIT_COMMIT_SHA ?? LOCAL_DEV_SHA;
}

export function getClientCommitSha(env: CommitEnv = process.env): string {
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

export function parseVersionResponse(payload: unknown): VersionResponse {
  const parsed = versionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Invalid version response from server.");
  }
  return parsed.data;
}
