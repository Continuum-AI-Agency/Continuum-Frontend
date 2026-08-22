import { getServerCommitSha } from '@/lib/system/version';

export function GET() {
  return Response.json({
    sha: getServerCommitSha(),
  });
}
